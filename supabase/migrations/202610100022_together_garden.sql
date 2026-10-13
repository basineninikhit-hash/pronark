-- Cooperative garden is visual-only. No wallet or earning effects in this migration.
create table public.garden_plants(
 id uuid primary key,group_id uuid not null references public.groups(id) on delete cascade,
 creator_id uuid not null references public.profiles(user_id),name text not null check(length(trim(name)) between 1 and 80),
 species text not null check(species in ('sprout','flower','tree','constellation')),
 rule_kind text not null check(rule_kind in ('checkoff','kpi','weekly_total','custom_visual')),
 target numeric not null check(target>0 and target<=1000000),
 starts_on date not null,ends_on date not null check(ends_on>=starts_on and ends_on<=starts_on+89),
 status text not null default 'active' check(status in ('draft','active','paused','archived')),
 revision integer not null default 1,created_at timestamptz not null default now());
create table public.garden_participants(
 plant_id uuid not null references public.garden_plants(id) on delete cascade,
 user_id uuid not null references public.profiles(user_id),task_id uuid references public.tasks(id),
 accepted boolean not null default false,revision integer not null default 1,
 primary key(plant_id,user_id));
create table public.garden_visual_events(
 plant_id uuid not null references public.garden_plants(id) on delete cascade,
 user_id uuid not null references public.profiles(user_id),local_date date not null,
 primary key(plant_id,user_id,local_date));
create table public.garden_cheers(
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.groups(id) on delete cascade,
 from_user uuid not null references public.profiles(user_id),to_user uuid not null references public.profiles(user_id),
 kind text not null check(kind in ('you_got_this','nice_work','thank_you')),
 created_at timestamptz not null default now());
create table public.group_versus_optins(
 group_id uuid not null references public.groups(id) on delete cascade,user_id uuid not null references public.profiles(user_id),
 enabled boolean not null default false,expires_at timestamptz,revision integer not null default 1,
 primary key(group_id,user_id));
alter table public.garden_plants enable row level security;
alter table public.garden_participants enable row level security;
alter table public.garden_visual_events enable row level security;
alter table public.garden_cheers enable row level security;
alter table public.group_versus_optins enable row level security;
create policy group_garden_plants on public.garden_plants for select to authenticated using(app.member_of_group(group_id,auth.uid()));
create policy group_garden_participants on public.garden_participants for select to authenticated using(user_id=auth.uid());
create policy group_garden_visual on public.garden_visual_events for select to authenticated using(user_id=auth.uid());
create policy group_garden_cheers on public.garden_cheers for select to authenticated using(app.member_of_group(group_id,auth.uid()));
create policy group_versus_optins on public.group_versus_optins for select to authenticated using(user_id=auth.uid());
grant select on public.garden_plants,public.garden_participants,public.garden_visual_events,public.garden_cheers,public.group_versus_optins to authenticated;

create function public.save_garden_plant(p_id uuid,p_group uuid,p_name text,p_species text,p_rule_kind text,p_target numeric,p_starts_on date,p_ends_on date,p_status text,p_expected_revision integer default 0)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_old public.garden_plants%rowtype;v_new public.garden_plants%rowtype;
begin
 if p_id is null or not app.member_of_group(p_group,auth.uid()) then raise exception 'Group not found'; end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 80 or p_species not in ('sprout','flower','tree','constellation') or p_rule_kind not in ('checkoff','kpi','weekly_total','custom_visual') or p_target is null or p_target<=0 or p_target>1000000 or p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on or p_ends_on>p_starts_on+89 or p_status not in ('draft','active','paused','archived') then raise exception 'Invalid plant'; end if;
 select * into v_old from public.garden_plants where id=p_id for update;
 if v_old.id is not null and (v_old.creator_id<>auth.uid() or v_old.group_id<>p_group or v_old.revision<>p_expected_revision) then raise exception 'Plant changed or read-only'; end if;
 if v_old.id is null and (p_expected_revision<>0 or (select count(*) from public.garden_plants where group_id=p_group and status<>'archived')>=100) then raise exception 'Plant limit or revision changed'; end if;
 if v_old.id is not null and v_old.rule_kind<>p_rule_kind and exists(select 1 from public.garden_participants where plant_id=p_id and accepted) then raise exception 'Pause and create a new plant to change its rule'; end if;
 insert into public.garden_plants(id,group_id,creator_id,name,species,rule_kind,target,starts_on,ends_on,status,revision)
 values(p_id,p_group,auth.uid(),trim(p_name),p_species,p_rule_kind,p_target,p_starts_on,p_ends_on,p_status,p_expected_revision+1)
 on conflict(id) do update set name=excluded.name,species=excluded.species,rule_kind=excluded.rule_kind,target=excluded.target,starts_on=excluded.starts_on,ends_on=excluded.ends_on,status=excluded.status,revision=excluded.revision
 returning * into v_new;
 if v_old.id is null then insert into public.garden_participants(plant_id,user_id) values(p_id,auth.uid()); end if;
 perform app.audit_change(auth.uid(),'garden_plants',p_id::text,case when v_old.id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
 return p_id;
end $$;
create function public.invite_garden_participant(p_plant uuid,p_user uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_group uuid;
begin
 select group_id into v_group from public.garden_plants where id=p_plant and creator_id=auth.uid() and status<>'archived';
 if v_group is null or not app.member_of_group(v_group,p_user) then raise exception 'Choose a current group member'; end if;
 insert into public.garden_participants(plant_id,user_id) values(p_plant,p_user) on conflict do nothing;
 perform app.audit_change(auth.uid(),'garden_participants',p_plant::text||':'||p_user::text,null,jsonb_build_object('plant_id',p_plant,'user_id',p_user,'accepted',false,'revision',1));
end $$;
create function public.accept_garden_participation(p_plant uuid,p_task uuid,p_accept boolean,p_expected_revision integer) returns integer language plpgsql security definer set search_path=public as $$
declare v_plant public.garden_plants%rowtype;v_old public.garden_participants%rowtype;v_new public.garden_participants%rowtype;
begin
 select * into v_plant from public.garden_plants where id=p_plant;
 if v_plant.id is null or not app.member_of_group(v_plant.group_id,auth.uid()) or p_accept is null then raise exception 'Plant not available'; end if;
 select * into v_old from public.garden_participants where plant_id=p_plant and user_id=auth.uid() for update;
 if v_old.user_id is null or v_old.revision<>p_expected_revision then raise exception 'Invitation changed'; end if;
 if p_accept and v_plant.rule_kind in ('checkoff','kpi') and not exists(select 1 from public.tasks where id=p_task and owner_id=auth.uid()) then raise exception 'Choose one of your activities'; end if;
 if p_accept and v_plant.rule_kind='kpi' and not exists(select 1 from public.activity_kpis where task_id=p_task and owner_id=auth.uid()) then raise exception 'Choose an activity with a KPI'; end if;
 update public.garden_participants set task_id=case when p_accept and v_plant.rule_kind in ('checkoff','kpi') then p_task else null end,accepted=p_accept,revision=revision+1 where plant_id=p_plant and user_id=auth.uid() returning * into v_new;
 perform app.audit_change(auth.uid(),'garden_participants',p_plant::text||':'||auth.uid()::text,to_jsonb(v_old),to_jsonb(v_new));
 return v_new.revision;
end $$;
create function public.water_visual_plant(p_plant uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_plant public.garden_plants%rowtype;v_count integer;
begin
 select * into v_plant from public.garden_plants where id=p_plant;
 if v_plant.rule_kind<>'custom_visual' or v_plant.status<>'active' or app.local_day() not between v_plant.starts_on and v_plant.ends_on or not exists(select 1 from public.garden_participants where plant_id=p_plant and user_id=auth.uid() and accepted) then raise exception 'Plant not available'; end if;
 insert into public.garden_visual_events(plant_id,user_id,local_date) values(p_plant,auth.uid(),app.local_day()) on conflict do nothing;
 get diagnostics v_count=row_count;
 if v_count>0 then perform app.audit_change(auth.uid(),'garden_visual_events',p_plant::text||':'||auth.uid()::text||':'||app.local_day()::text,null,jsonb_build_object('plant_id',p_plant,'user_id',auth.uid(),'local_date',app.local_day(),'revision',1)); end if;
end $$;
create function app.garden_contribution(p_plant uuid,p_user uuid) returns numeric language plpgsql stable security definer set search_path=public as $$
declare v_plant public.garden_plants%rowtype;v_part public.garden_participants%rowtype;v_total numeric:=0;
begin
 select * into v_plant from public.garden_plants where id=p_plant;
 select * into v_part from public.garden_participants where plant_id=p_plant and user_id=p_user;
 if v_plant.id is null or not coalesce(v_part.accepted,false) then return 0; end if;
 if v_plant.rule_kind='custom_visual' then select count(*) into v_total from public.garden_visual_events where plant_id=p_plant and user_id=p_user and local_date between v_plant.starts_on and least(v_plant.ends_on,app.local_day());
 elsif v_plant.rule_kind='checkoff' then select count(*) into v_total from public.completions c where c.task_id=v_part.task_id and c.owner_id=p_user and c.completed and c.local_date between v_plant.starts_on and least(v_plant.ends_on,app.local_day()) and app.due(c.task_id,c.local_date);
 elsif v_plant.rule_kind='kpi' then select count(*) into v_total from public.activity_kpi_logs l join public.activity_kpis k on k.task_id=l.task_id where l.task_id=v_part.task_id and l.owner_id=p_user and l.local_date between v_plant.starts_on and least(v_plant.ends_on,app.local_day()) and l.value>=k.target and app.due(l.task_id,l.local_date);
 elsif v_plant.rule_kind='weekly_total' then select count(*) into v_total from public.completions c where c.owner_id=p_user and c.completed and c.local_date between v_plant.starts_on and least(v_plant.ends_on,app.local_day()) and app.due(c.task_id,c.local_date);
 end if;
 return coalesce(v_total,0);
end $$;
create function public.read_group_garden(p_group uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_plants jsonb;
begin
 if not app.member_of_group(p_group,auth.uid()) then raise exception 'Group not found'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'species',p.species,'rule_kind',p.rule_kind,'target',p.target,'starts_on',p.starts_on,'ends_on',p.ends_on,'status',p.status,'revision',p.revision,'creator_id',p.creator_id,
  'progress',(select coalesce(sum(app.garden_contribution(p.id,g.user_id)),0) from public.garden_participants g where g.plant_id=p.id),
  'participants',(select coalesce(jsonb_agg(jsonb_build_object('user_id',g.user_id,'accepted',g.accepted,'contribution',app.garden_contribution(p.id,g.user_id)) order by g.user_id),'[]'::jsonb) from public.garden_participants g where g.plant_id=p.id)
 ) order by p.created_at desc),'[]'::jsonb) into v_plants from public.garden_plants p where p.group_id=p_group;
 return v_plants;
end $$;
create function public.send_garden_cheer(p_group uuid,p_to uuid,p_kind text) returns void language plpgsql security definer set search_path=public as $$
declare v_new public.garden_cheers%rowtype;
begin
 if not app.member_of_group(p_group,auth.uid()) or not app.member_of_group(p_group,p_to) or p_to=auth.uid() or p_kind not in ('you_got_this','nice_work','thank_you') then raise exception 'Invalid cheer'; end if;
 if (select count(*) from public.garden_cheers where group_id=p_group and from_user=auth.uid() and created_at::date=app.local_day())>=5 then raise exception 'Five cheers per day maximum'; end if;
 insert into public.garden_cheers(group_id,from_user,to_user,kind) values(p_group,auth.uid(),p_to,p_kind) returning * into v_new;
 perform app.audit_change(auth.uid(),'garden_cheers',v_new.id::text,null,to_jsonb(v_new)||jsonb_build_object('revision',1));
end $$;
create function public.save_versus_optin(p_group uuid,p_enabled boolean,p_expected_revision integer default 0) returns integer language plpgsql security definer set search_path=public as $$
declare v_old public.group_versus_optins%rowtype;v_new public.group_versus_optins%rowtype;
begin
 if not app.member_of_group(p_group,auth.uid()) or p_enabled is null then raise exception 'Group not found'; end if;
 select * into v_old from public.group_versus_optins where group_id=p_group and user_id=auth.uid() for update;
 if coalesce(v_old.revision,0)<>p_expected_revision then raise exception 'Versus choice changed'; end if;
 insert into public.group_versus_optins(group_id,user_id,enabled,expires_at,revision) values(p_group,auth.uid(),p_enabled,case when p_enabled then now()+interval '7 days' else null end,p_expected_revision+1)
 on conflict(group_id,user_id) do update set enabled=excluded.enabled,expires_at=excluded.expires_at,revision=excluded.revision returning * into v_new;
 perform app.audit_change(auth.uid(),'group_versus_optins',p_group::text||':'||auth.uid()::text,case when v_old.user_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
 return v_new.revision;
end $$;
create function public.read_group_versus(p_group uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
 if not exists(select 1 from public.group_versus_optins where group_id=p_group and user_id=auth.uid() and enabled and expires_at>now()) then raise exception 'Opt in to view private comparison'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',v.user_id,'name',p.display_name,'scheduled',(select count(*) from public.tasks t cross join lateral generate_series(app.local_day()-6,app.local_day(),'1 day'::interval) d(day) where t.owner_id=v.user_id and app.due(t.id,d.day::date)),
 'completed',(select count(*) from public.completions c where c.owner_id=v.user_id and c.completed and c.local_date between app.local_day()-6 and app.local_day() and app.due(c.task_id,c.local_date))) order by p.display_name),'[]'::jsonb) into v_result
 from public.group_versus_optins v join public.profiles p on p.user_id=v.user_id where v.group_id=p_group and v.enabled and v.expires_at>now();
 return v_result;
end $$;
revoke execute on function public.save_garden_plant(uuid,uuid,text,text,text,numeric,date,date,text,integer),public.invite_garden_participant(uuid,uuid),public.accept_garden_participation(uuid,uuid,boolean,integer),public.water_visual_plant(uuid),app.garden_contribution(uuid,uuid),public.read_group_garden(uuid),public.send_garden_cheer(uuid,uuid,text),public.save_versus_optin(uuid,boolean,integer),public.read_group_versus(uuid) from public,anon;
grant execute on function public.save_garden_plant(uuid,uuid,text,text,text,numeric,date,date,text,integer),public.invite_garden_participant(uuid,uuid),public.accept_garden_participation(uuid,uuid,boolean,integer),public.water_visual_plant(uuid),public.read_group_garden(uuid),public.send_garden_cheer(uuid,uuid,text),public.save_versus_optin(uuid,boolean,integer),public.read_group_versus(uuid) to authenticated;
