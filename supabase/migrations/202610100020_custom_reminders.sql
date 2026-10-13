-- Standard remains the default. No custom rule sends until the worker is explicitly enabled.
create table public.reminder_preferences(
 owner_id uuid primary key references public.profiles(user_id) on delete cascade,
 mode text not null default 'standard' check(mode in ('standard','custom','off')),
 quiet_start time not null default '21:00', quiet_end time not null default '07:00',
 max_per_day integer not null default 3 check(max_per_day between 1 and 6),
 revision integer not null default 1, updated_at timestamptz not null default now());
create table public.reminder_rules(
 id uuid primary key, owner_id uuid not null references public.profiles(user_id) on delete cascade,
 task_id uuid references public.tasks(id) on delete cascade,
 local_time time not null, enabled boolean not null default true,
 revision integer not null default 1, created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index reminder_rules_unique on public.reminder_rules(owner_id,coalesce(task_id::text,'general'),local_time);
create table public.custom_reminder_jobs(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(user_id),
 rule_id uuid not null references public.reminder_rules(id) on delete cascade,local_date date not null,
 state text not null default 'pending' check(state in ('pending','leased','sent','skipped','failed')),
 attempts integer not null default 0,lease_until timestamptz,sent_at timestamptz,last_error text,
 unique(owner_id,rule_id,local_date));
alter table public.reminder_preferences enable row level security;
alter table public.reminder_rules enable row level security;
alter table public.custom_reminder_jobs enable row level security;
create policy own_reminder_preferences on public.reminder_preferences for select to authenticated using(owner_id=auth.uid());
create policy own_reminder_rules on public.reminder_rules for select to authenticated using(owner_id=auth.uid());
grant select on public.reminder_preferences,public.reminder_rules to authenticated;
revoke all on public.custom_reminder_jobs from anon,authenticated;

create function public.save_reminder_preferences(p_mode text,p_quiet_start time,p_quiet_end time,p_max_per_day integer,p_expected_revision integer default 0)
returns integer language plpgsql security definer set search_path=public as $$
declare v_old public.reminder_preferences%rowtype;v_new public.reminder_preferences%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_mode not in ('standard','custom','off') or p_quiet_start is null or p_quiet_end is null or p_max_per_day not between 1 and 6 then raise exception 'Invalid reminder preference'; end if;
 select * into v_old from public.reminder_preferences where owner_id=auth.uid() for update;
 if coalesce(v_old.revision,0)<>p_expected_revision then raise exception 'Reminder settings changed on another device'; end if;
 insert into public.reminder_preferences(owner_id,mode,quiet_start,quiet_end,max_per_day,revision)
 values(auth.uid(),p_mode,p_quiet_start,p_quiet_end,p_max_per_day,p_expected_revision+1)
 on conflict(owner_id) do update set mode=excluded.mode,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,max_per_day=excluded.max_per_day,revision=excluded.revision,updated_at=now()
 returning * into v_new;
 perform app.audit_change(auth.uid(),'reminder_preferences',auth.uid()::text,case when v_old.owner_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
 return v_new.revision;
end $$;
create function public.save_reminder_rule(p_id uuid,p_task uuid,p_time time,p_enabled boolean,p_expected_revision integer default 0)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_old public.reminder_rules%rowtype;v_new public.reminder_rules%rowtype;
begin
 if auth.uid() is null or p_id is null or p_time is null or p_enabled is null then raise exception 'Invalid reminder'; end if;
 if p_task is not null and not exists(select 1 from public.tasks where id=p_task and owner_id=auth.uid() and (archive_date is null or archive_date>app.local_day())) then raise exception 'Activity is not yours or is archived'; end if;
 select * into v_old from public.reminder_rules where id=p_id for update;
 if v_old.id is not null and (v_old.owner_id<>auth.uid() or v_old.revision<>p_expected_revision) then raise exception 'Reminder changed or read-only'; end if;
 if v_old.id is null and p_expected_revision<>0 then raise exception 'Reminder changed'; end if;
 insert into public.reminder_rules(id,owner_id,task_id,local_time,enabled,revision) values(p_id,auth.uid(),p_task,p_time,p_enabled,p_expected_revision+1)
 on conflict(id) do update set task_id=excluded.task_id,local_time=excluded.local_time,enabled=excluded.enabled,revision=excluded.revision,updated_at=now()
 returning * into v_new;
 perform app.audit_change(auth.uid(),'reminder_rules',p_id::text,case when v_old.id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
 return p_id;
end $$;
revoke execute on function public.save_reminder_preferences(text,time,time,integer,integer),public.save_reminder_rule(uuid,uuid,time,boolean,integer) from public,anon;
grant execute on function public.save_reminder_preferences(text,time,time,integer,integer),public.save_reminder_rule(uuid,uuid,time,boolean,integer) to authenticated;
