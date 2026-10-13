-- Fail closed on personal rows before allowing a user to join multiple groups.
alter table public.memberships drop constraint if exists memberships_user_id_key;
alter table public.groups add column name text not null default 'My group' check(length(trim(name)) between 1 and 80);
alter table public.groups add column revision integer not null default 1;
create or replace function app.same_group(a uuid,b uuid) returns boolean language sql stable security definer set search_path=public as $$ select a is not null and a=b $$;
create function app.member_of_group(p_group uuid,p_user uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.memberships where group_id=p_group and user_id=p_user)
$$;

create table public.group_sharing(
 group_id uuid not null references public.groups(id) on delete cascade,user_id uuid not null references public.profiles(user_id) on delete cascade,
 show_summary boolean not null default true,full_history boolean not null default false,revision integer not null default 1,
 primary key(group_id,user_id),foreign key(group_id,user_id) references public.memberships(group_id,user_id) on delete cascade);
create table public.group_activity_shares(
 group_id uuid not null,user_id uuid not null,task_id uuid not null references public.tasks(id) on delete cascade,
 primary key(group_id,user_id,task_id),foreign key(group_id,user_id) references public.memberships(group_id,user_id) on delete cascade);
insert into public.group_sharing(group_id,user_id) select group_id,user_id from public.memberships;
-- Legacy partners retain visibility of their existing activity names, but not full history.
insert into public.group_activity_shares(group_id,user_id,task_id)
 select m.group_id,m.user_id,t.id from public.memberships m join public.tasks t on t.owner_id=m.user_id where t.archive_date is null;
alter table public.group_sharing enable row level security;
alter table public.group_activity_shares enable row level security;
create policy group_sharing_read on public.group_sharing for select to authenticated using(app.member_of_group(group_id,auth.uid()));
create policy group_activity_shares_read on public.group_activity_shares for select to authenticated using(app.member_of_group(group_id,auth.uid()));
grant select on public.group_sharing,public.group_activity_shares to authenticated;

create function public.create_private_group(p_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_group public.groups%rowtype;
begin
 if auth.uid() is null or length(trim(coalesce(p_name,''))) not between 1 and 80 then raise exception 'Enter a group name'; end if;
 insert into public.profiles(user_id) values(auth.uid()) on conflict do nothing;
 if (select count(*) from public.memberships where user_id=auth.uid())>=20 then raise exception 'Maximum 20 groups per account'; end if;
 insert into public.groups(owner_id,name) values(auth.uid(),trim(p_name)) returning * into v_group;
 insert into public.memberships(group_id,user_id) values(v_group.id,auth.uid());
 insert into public.group_sharing(group_id,user_id) values(v_group.id,auth.uid());
 perform app.audit_change(auth.uid(),'groups',v_group.id::text,null,to_jsonb(v_group));
 return v_group.id;
end $$;
create or replace function public.create_group() returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select group_id into v_id from public.memberships where user_id=auth.uid() order by joined_at,group_id limit 1;
 if v_id is not null then return v_id; end if;
 return public.create_private_group('My group');
end $$;
create function public.issue_group_invitation(p_group uuid) returns text language plpgsql security definer set search_path=public,extensions as $$
declare v_token text;
begin
 if not exists(select 1 from public.groups where id=p_group and owner_id=auth.uid()) then raise exception 'Only the group owner can invite'; end if;
 if (select count(*) from public.memberships where group_id=p_group)>=20 then raise exception 'Group is full'; end if;
 if (select count(*) from public.invitations where group_id=p_group and expires_at>now() and redeemed_at is null)>=20 then raise exception 'Too many active invitations'; end if;
 v_token:=encode(gen_random_bytes(24),'hex');
 insert into public.invitations(group_id,token_hash,expires_at,created_by) values(p_group,encode(digest(v_token,'sha256'),'hex'),now()+interval '48 hours',auth.uid());
 return v_token;
end $$;
create or replace function public.redeem_invitation(p_token text) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare v_inv public.invitations%rowtype;
begin
 if auth.uid() is null or length(coalesce(p_token,''))<>48 then raise exception 'Invalid invitation'; end if;
 insert into public.profiles(user_id) values(auth.uid()) on conflict do nothing;
 select * into v_inv from public.invitations where token_hash=encode(digest(p_token,'sha256'),'hex') for update;
 if v_inv.id is null or v_inv.expires_at<=now() or v_inv.redeemed_at is not null then raise exception 'Invite expired or already used. Ask for a new one.'; end if;
 if app.member_of_group(v_inv.group_id,auth.uid()) then raise exception 'Already in this group'; end if;
 if (select count(*) from public.memberships where group_id=v_inv.group_id)>=20 then raise exception 'Group is full'; end if;
 if (select count(*) from public.memberships where user_id=auth.uid())>=20 then raise exception 'Maximum 20 groups per account'; end if;
 insert into public.memberships(group_id,user_id) values(v_inv.group_id,auth.uid());
 insert into public.group_sharing(group_id,user_id) values(v_inv.group_id,auth.uid());
 update public.invitations set redeemed_at=now() where id=v_inv.id;
 perform app.audit_change(auth.uid(),'memberships',v_inv.group_id::text||':'||auth.uid()::text,null,jsonb_build_object('group_id',v_inv.group_id,'user_id',auth.uid(),'revision',1));
 return v_inv.group_id;
end $$;
create function public.save_group_sharing(p_group uuid,p_summary boolean,p_full_history boolean,p_expected_revision integer)
returns integer language plpgsql security definer set search_path=public as $$
declare v_old public.group_sharing%rowtype;v_new public.group_sharing%rowtype;
begin
 if p_summary is null or p_full_history is null then raise exception 'Invalid sharing choice'; end if;
 select * into v_old from public.group_sharing where group_id=p_group and user_id=auth.uid() for update;
 if v_old.user_id is null then raise exception 'Not a group member'; end if;
 if v_old.revision<>p_expected_revision then raise exception 'Sharing changed on another device'; end if;
 update public.group_sharing set show_summary=p_summary,full_history=p_full_history,revision=revision+1 where group_id=p_group and user_id=auth.uid() returning * into v_new;
 perform app.audit_change(auth.uid(),'group_sharing',p_group::text||':'||auth.uid()::text,to_jsonb(v_old),to_jsonb(v_new));
 return v_new.revision;
end $$;
create function public.rename_private_group(p_group uuid,p_name text,p_expected_revision integer) returns integer language plpgsql security definer set search_path=public as $$
declare v_old public.groups%rowtype;v_new public.groups%rowtype;
begin
 if length(trim(coalesce(p_name,''))) not between 1 and 80 then raise exception 'Invalid group name'; end if;
 select * into v_old from public.groups where id=p_group for update;
 if v_old.id is null or v_old.owner_id<>auth.uid() then raise exception 'Only the group owner can rename it'; end if;
 if v_old.revision<>p_expected_revision then raise exception 'Group changed on another device'; end if;
 update public.groups set name=trim(p_name),revision=revision+1 where id=p_group returning * into v_new;
 perform app.audit_change(auth.uid(),'groups',p_group::text,to_jsonb(v_old),to_jsonb(v_new));
 return v_new.revision;
end $$;
create function public.leave_private_group(p_group uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not app.member_of_group(p_group,auth.uid()) then raise exception 'Not a member'; end if;
 if exists(select 1 from public.groups where id=p_group and owner_id=auth.uid()) then raise exception 'The group owner must transfer ownership before leaving'; end if;
 delete from public.memberships where group_id=p_group and user_id=auth.uid();
 perform app.audit_change(auth.uid(),'memberships',p_group::text||':'||auth.uid()::text,jsonb_build_object('group_id',p_group,'user_id',auth.uid()),null);
end $$;
create function public.transfer_group_ownership(p_group uuid,p_new_owner uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_old public.groups%rowtype;v_new public.groups%rowtype;
begin
 select * into v_old from public.groups where id=p_group for update;
 if v_old.id is null or v_old.owner_id<>auth.uid() or p_new_owner=auth.uid() or not app.member_of_group(p_group,p_new_owner) then raise exception 'Choose another current group member'; end if;
 update public.groups set owner_id=p_new_owner,revision=revision+1 where id=p_group returning * into v_new;
 perform app.audit_change(auth.uid(),'groups',p_group::text,to_jsonb(v_old),to_jsonb(v_new));
end $$;
create function public.remove_private_group_member(p_group uuid,p_user uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.groups where id=p_group and owner_id=auth.uid()) then raise exception 'Only the group owner can remove a member'; end if;
 if p_user=auth.uid() then raise exception 'Cannot remove the group owner'; end if;
 if not app.member_of_group(p_group,p_user) then raise exception 'Member not found'; end if;
 delete from public.memberships where group_id=p_group and user_id=p_user;
 perform app.audit_change(auth.uid(),'memberships',p_group::text||':'||p_user::text,jsonb_build_object('group_id',p_group,'user_id',p_user),null);
end $$;
create function public.revoke_group_invitations(p_group uuid) returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
 if not exists(select 1 from public.groups where id=p_group and owner_id=auth.uid()) then raise exception 'Only the group owner can revoke invites'; end if;
 update public.invitations set expires_at=now() where group_id=p_group and redeemed_at is null and expires_at>now();
 get diagnostics v_count=row_count;
 return v_count;
end $$;
create function public.set_group_activity_share(p_group uuid,p_task uuid,p_shared boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_shared is null or not app.member_of_group(p_group,auth.uid()) or not exists(select 1 from public.tasks where id=p_task and owner_id=auth.uid()) then raise exception 'Activity or group not yours'; end if;
 if p_shared then insert into public.group_activity_shares(group_id,user_id,task_id) values(p_group,auth.uid(),p_task) on conflict do nothing;
 else delete from public.group_activity_shares where group_id=p_group and user_id=auth.uid() and task_id=p_task;end if;
 perform app.audit_change(auth.uid(),'group_activity_shares',p_group::text||':'||p_task::text,null,jsonb_build_object('group_id',p_group,'user_id',auth.uid(),'task_id',p_task,'shared',p_shared,'revision',extract(epoch from now())::integer));
end $$;
create function public.read_group_overview(p_group uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_name text;v_members jsonb;
begin
 if not app.member_of_group(p_group,auth.uid()) then raise exception 'Group not found'; end if;
 select name into v_name from public.groups where id=p_group;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',p.display_name,
  'summary_visible',s.show_summary,'full_history',s.full_history,
  'scheduled',case when s.show_summary then (select count(*) from public.tasks t where t.owner_id=m.user_id and app.due(t.id,app.local_day())) else null end,
  'completed',case when s.show_summary then (select count(*) from public.completions c join public.tasks t on t.id=c.task_id where c.owner_id=m.user_id and c.local_date=app.local_day() and c.completed and app.due(t.id,app.local_day())) else null end,
  'activities',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'scheduled_today',app.due(t.id,app.local_day()),'completed_today',coalesce(c.completed,false)) order by t.title),'[]'::jsonb)
   from public.tasks t left join public.completions c on c.task_id=t.id and c.local_date=app.local_day()
   where t.owner_id=m.user_id and (t.archive_date is null or t.archive_date>app.local_day()) and (s.full_history or exists(select 1 from public.group_activity_shares sh where sh.group_id=p_group and sh.user_id=m.user_id and sh.task_id=t.id)))
 ) order by p.display_name),'[]'::jsonb) into v_members
 from public.memberships m join public.profiles p on p.user_id=m.user_id join public.group_sharing s on s.group_id=m.group_id and s.user_id=m.user_id where m.group_id=p_group;
 return jsonb_build_object('id',p_group,'name',v_name,'members',v_members);
end $$;
create function public.read_group_history(p_group uuid,p_member uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
 if not app.member_of_group(p_group,auth.uid()) or not app.member_of_group(p_group,p_member) or not exists(select 1 from public.group_sharing where group_id=p_group and user_id=p_member and full_history) then raise exception 'History not shared'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to>app.local_day() or p_to-p_from>90 then raise exception 'Choose up to 90 past days'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('date',d.day,'task_id',t.id,'title',t.title,'scheduled',app.due(t.id,d.day),'completed',coalesce(c.completed,false)) order by d.day,t.title),'[]'::jsonb) into v_result
 from public.tasks t cross join lateral generate_series(p_from,p_to,'1 day'::interval) d(day)
 left join public.completions c on c.task_id=t.id and c.local_date=d.day::date
 where t.owner_id=p_member and app.due(t.id,d.day::date);
 return v_result;
end $$;
revoke execute on function public.create_private_group(text),public.issue_group_invitation(uuid),public.save_group_sharing(uuid,boolean,boolean,integer),public.rename_private_group(uuid,text,integer),public.transfer_group_ownership(uuid,uuid),public.leave_private_group(uuid),public.remove_private_group_member(uuid,uuid),public.revoke_group_invitations(uuid),public.set_group_activity_share(uuid,uuid,boolean),public.read_group_overview(uuid),public.read_group_history(uuid,uuid,date,date) from public,anon;
grant execute on function public.create_private_group(text),public.issue_group_invitation(uuid),public.save_group_sharing(uuid,boolean,boolean,integer),public.rename_private_group(uuid,text,integer),public.transfer_group_ownership(uuid,uuid),public.leave_private_group(uuid),public.remove_private_group_member(uuid,uuid),public.revoke_group_invitations(uuid),public.set_group_activity_share(uuid,uuid,boolean),public.read_group_overview(uuid),public.read_group_history(uuid,uuid,date,date) to authenticated;
