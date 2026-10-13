create extension if not exists pgcrypto;
create schema if not exists app;

create function app.local_day() returns date language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;
create function app.month_start(d date) returns date language sql immutable as $$ select date_trunc('month', d)::date $$;
create table profiles(user_id uuid primary key references auth.users(id) on delete cascade, display_name text not null default '', setup_completed_at timestamptz, step_goal integer check(step_goal in (10000,15000)), water_quantity numeric check(water_quantity > 0), water_unit text check(length(water_unit) between 1 and 30), revision integer not null default 1);
create table groups(id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles(user_id), created_at timestamptz not null default now());
create table memberships(group_id uuid not null references groups(id), user_id uuid not null unique references profiles(user_id), joined_at timestamptz not null default now(), primary key(group_id,user_id));
create function app.same_group(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select a = b or exists(select 1 from memberships x join memberships y on x.group_id=y.group_id where x.user_id=a and y.user_id=b)
$$;
create table invitations(id uuid primary key default gen_random_uuid(), group_id uuid not null references groups(id), token_hash text not null unique, expires_at timestamptz not null, redeemed_at timestamptz, created_by uuid not null references profiles(user_id));
create table tasks(id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles(user_id), title text not null check(length(trim(title)) between 1 and 200), description text not null default '' check(length(description)<=10000), start_date date not null, archive_date date, source_template_id uuid, source_revision integer, revision integer not null default 1, created_at timestamptz not null default now());
create table task_month_settings(task_id uuid not null references tasks(id), month date not null check(month=app.month_start(month)), reward_cents integer not null check(reward_cents>=0), weekdays integer[] not null check(array_length(weekdays,1) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]), step_goal integer, water_quantity numeric, water_unit text, revision integer not null default 1, primary key(task_id,month));
create table task_schedule_versions(id uuid primary key default gen_random_uuid(), task_id uuid not null references tasks(id), month date not null, weekdays integer[] not null, revision integer not null, created_at timestamptz not null default now());
create table completions(task_id uuid not null references tasks(id), owner_id uuid not null references profiles(user_id), local_date date not null, completed boolean not null, version integer not null default 1, updated_at timestamptz not null default now(), primary key(task_id,local_date));
create table earnings(id text primary key, owner_id uuid not null references profiles(user_id), task_id uuid not null references tasks(id), earned_date date not null, kind text not null check(kind in ('base','bonus14','bonus28')), cents integer not null, active boolean not null default true, revision integer not null default 1);
create table audit_events(id uuid primary key default gen_random_uuid(), actor_id uuid not null references profiles(user_id), owner_id uuid not null references profiles(user_id), entity text not null, entity_id text not null, before_value jsonb, after_value jsonb, created_at timestamptz not null default now());
create table sheet_jobs(id bigint generated always as identity primary key, entity text not null, record_id text not null, revision integer not null, state text not null default 'pending' check(state in ('pending','leased','done','error')), attempts integer not null default 0, next_attempt_at timestamptz not null default now(), lease_until timestamptz, error text, unique(entity,record_id,revision));
create table sheet_status(singleton boolean primary key default true check(singleton), last_success_at timestamptz, last_error text, spreadsheet_id text);
insert into sheet_status(singleton) values(true);

create function app.audit_change(p_owner uuid,p_entity text,p_id text,p_before jsonb,p_after jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
  insert into audit_events(actor_id,owner_id,entity,entity_id,before_value,after_value) values(auth.uid(),p_owner,p_entity,p_id,p_before,p_after);
  insert into sheet_jobs(entity,record_id,revision) values(p_entity,p_id,coalesce((p_after->>'revision')::integer,1)) on conflict do nothing;
end $$;

create function public.create_group() returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 insert into profiles(user_id) values(auth.uid()) on conflict do nothing;
 if exists(select 1 from memberships where user_id=auth.uid()) then select group_id into v_id from memberships where user_id=auth.uid(); return v_id; end if;
 insert into groups(owner_id) values(auth.uid()) returning id into v_id;
 insert into memberships(group_id,user_id) values(v_id,auth.uid());
 perform app.audit_change(auth.uid(),'groups',v_id::text,null,jsonb_build_object('id',v_id,'owner_id',auth.uid(),'revision',1));
 return v_id;
end $$;
create function public.issue_invitation() returns text language plpgsql security definer set search_path=public as $$
declare v_group uuid; v_token text;
begin
 select id into v_group from groups where owner_id=auth.uid();
 if v_group is null then raise exception 'Only the group owner can invite'; end if;
 if (select count(*) from memberships where group_id=v_group)>=2 then raise exception 'Group is full'; end if;
 v_token:=encode(gen_random_bytes(24),'hex');
 insert into invitations(group_id,token_hash,expires_at,created_by) values(v_group,encode(digest(v_token,'sha256'),'hex'),now()+interval '48 hours',auth.uid());
 return v_token;
end $$;
create function public.redeem_invitation(p_token text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_inv invitations%rowtype; v_existing uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 insert into profiles(user_id) values(auth.uid()) on conflict do nothing;
 select group_id into v_existing from memberships where user_id=auth.uid();
 select * into v_inv from invitations where token_hash=encode(digest(p_token,'sha256'),'hex') for update;
 if v_inv.id is null or v_inv.expires_at<=now() or v_inv.redeemed_at is not null then raise exception 'Invite expired or already used. Ask for a new one.'; end if;
 if v_existing is not null then raise exception 'Already in a group'; end if;
 if (select count(*) from memberships where group_id=v_inv.group_id)>=2 then raise exception 'Group is full'; end if;
 insert into memberships(group_id,user_id) values(v_inv.group_id,auth.uid());
 update invitations set redeemed_at=now() where id=v_inv.id;
 perform app.audit_change(auth.uid(),'memberships',auth.uid()::text,null,jsonb_build_object('group_id',v_inv.group_id,'user_id',auth.uid(),'revision',1));
 return v_inv.group_id;
end $$;

create function app.setting(p_task uuid,p_date date) returns task_month_settings language sql stable security definer set search_path=public as $$
 select s from task_month_settings s where s.task_id=p_task and s.month<=app.month_start(p_date) order by month desc limit 1
$$;
create function app.due(p_task uuid,p_date date) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from tasks t where t.id=p_task and p_date>=t.start_date and (t.archive_date is null or p_date<t.archive_date) and extract(isodow from p_date)::integer=any((app.setting(p_task,p_date)).weekdays))
$$;

create function public.save_task(p_id uuid,p_title text,p_description text,p_reward_cents integer,p_weekdays integer[],p_expected_revision integer default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_task tasks%rowtype; v_date date:=app.local_day(); v_month date:=app.month_start(app.local_day()); v_old jsonb; v_new jsonb; v_setting task_month_settings%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if length(trim(p_title))<1 or length(p_title)>200 or length(p_description)>10000 or p_reward_cents<0 or p_reward_cents is null or array_length(p_weekdays,1) not between 1 and 7 or not p_weekdays <@ array[1,2,3,4,5,6,7] then raise exception 'Invalid task fields'; end if;
 if p_id is null then
   if not exists(select 1 from profiles where user_id=auth.uid() and setup_completed_at is not null) then raise exception 'Finish setup first'; end if;
   insert into tasks(owner_id,title,description,start_date) values(auth.uid(),trim(p_title),p_description,v_date) returning * into v_task;
   insert into task_month_settings(task_id,month,reward_cents,weekdays) values(v_task.id,v_month,p_reward_cents,p_weekdays);
 else
   select * into v_task from tasks where id=p_id for update;
   if v_task.id is null or v_task.owner_id<>auth.uid() then raise exception 'Task not found or read-only'; end if;
   if p_expected_revision is distinct from v_task.revision then raise exception 'This task changed on another device. Review the latest version.'; end if;
   v_old:=to_jsonb(v_task);
   select * into v_setting from app.setting(v_task.id,v_date);
   if (p_reward_cents<>v_setting.reward_cents or p_weekdays<>v_setting.weekdays) and extract(day from v_date)<>1 then raise exception 'Reward and schedule changes reopen on the first calendar day'; end if;
   update tasks set title=trim(p_title),description=p_description,revision=revision+1 where id=p_id returning * into v_task;
   if extract(day from v_date)=1 then
     insert into task_month_settings(task_id,month,reward_cents,weekdays) values(p_id,v_month,p_reward_cents,p_weekdays) on conflict(task_id,month) do update set reward_cents=excluded.reward_cents,weekdays=excluded.weekdays,revision=task_month_settings.revision+1;
     insert into task_schedule_versions(task_id,month,weekdays,revision) values(p_id,v_month,p_weekdays,v_task.revision);
     perform app.audit_change(auth.uid(),'task_month_settings',p_id::text||':'||v_month::text,null,jsonb_build_object('task_id',p_id,'month',v_month,'reward_cents',p_reward_cents,'weekdays',p_weekdays,'revision',v_task.revision));
     perform public.rebuild_task_month(p_id,v_month);
   end if;
 end if;
 v_new:=to_jsonb(v_task); perform app.audit_change(auth.uid(),'tasks',v_task.id::text,v_old,v_new);
 if p_id is null then
   insert into task_schedule_versions(task_id,month,weekdays,revision) values(v_task.id,v_month,p_weekdays,1);
   perform app.audit_change(auth.uid(),'task_month_settings',v_task.id::text||':'||v_month::text,null,jsonb_build_object('task_id',v_task.id,'month',v_month,'reward_cents',p_reward_cents,'weekdays',p_weekdays,'revision',1));
 end if;
 return v_task.id;
end $$;

create function public.save_completion(p_task uuid,p_date date,p_completed boolean,p_expected_version integer default 0) returns integer language plpgsql security definer set search_path=public as $$
declare v_task tasks%rowtype; v_old completions%rowtype; v_new completions%rowtype;
begin
 select * into v_task from tasks where id=p_task for update;
 if v_task.id is null or v_task.owner_id<>auth.uid() then raise exception 'Task not found or read-only'; end if;
 if p_date>app.local_day() or app.month_start(p_date)<>app.month_start(app.local_day()) or not app.due(p_task,p_date) then raise exception 'Only due dates in the current month can be corrected'; end if;
 select * into v_old from completions where task_id=p_task and local_date=p_date for update;
 if coalesce(v_old.version,0)<>p_expected_version then raise exception 'This day changed on another device. Review the latest version.'; end if;
 if v_old.task_id is null then
   insert into completions(task_id,owner_id,local_date,completed) values(p_task,auth.uid(),p_date,p_completed) returning * into v_new;
 else
   update completions set completed=p_completed,version=version+1,updated_at=now() where task_id=p_task and local_date=p_date returning * into v_new;
 end if;
 perform app.audit_change(auth.uid(),'completions',p_task::text||':'||p_date::text,case when v_old.task_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
 perform public.rebuild_task_month(p_task,app.month_start(p_date));
 return v_new.version;
end $$;

alter table profiles enable row level security; alter table groups enable row level security; alter table memberships enable row level security; alter table invitations enable row level security; alter table tasks enable row level security; alter table task_month_settings enable row level security; alter table task_schedule_versions enable row level security; alter table completions enable row level security; alter table earnings enable row level security; alter table audit_events enable row level security; alter table sheet_jobs enable row level security; alter table sheet_status enable row level security;
create policy read_profiles on profiles for select to authenticated using(app.same_group(auth.uid(),user_id));
create policy read_groups on groups for select to authenticated using(exists(select 1 from memberships where group_id=id and user_id=auth.uid()));
create policy read_memberships on memberships for select to authenticated using(app.same_group(auth.uid(),user_id));
create policy read_tasks on tasks for select to authenticated using(app.same_group(auth.uid(),owner_id));
create policy read_settings on task_month_settings for select to authenticated using(exists(select 1 from tasks where id=task_id and app.same_group(auth.uid(),owner_id)));
create policy read_schedule on task_schedule_versions for select to authenticated using(exists(select 1 from tasks where id=task_id and app.same_group(auth.uid(),owner_id)));
create policy read_completions on completions for select to authenticated using(app.same_group(auth.uid(),owner_id));
create policy read_earnings on earnings for select to authenticated using(app.same_group(auth.uid(),owner_id));
create policy read_audit on audit_events for select to authenticated using(app.same_group(auth.uid(),owner_id));
revoke all on all tables in schema public from anon, authenticated;
grant select on profiles,groups,memberships,tasks,task_month_settings,task_schedule_versions,completions,earnings,audit_events to authenticated;
grant usage on schema app to authenticated;
grant execute on function public.create_group(),public.issue_invitation(),public.redeem_invitation(text),public.save_task(uuid,text,text,integer,integer[],integer),public.save_completion(uuid,date,boolean,integer) to authenticated;
