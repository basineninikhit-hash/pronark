-- Versioned, owner-only first-run draft and cross-device companion preferences.
-- Creating a draft does not create a group or complete setup.
create table public.onboarding_progress (
  owner_id uuid primary key references public.profiles(user_id) on delete cascade,
  flow_version integer not null default 2,
  step integer not null default 0 check (step between 0 and 12),
  draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft) = 'object'),
  completed_at timestamptz,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.experience_preferences (
  owner_id uuid primary key references public.profiles(user_id) on delete cascade,
  companion text not null default 'robot' check (companion in ('robot','dog','cat','muse','care')),
  chatter text not null default 'full' check (chatter in ('full','quiet','off')),
  reduced_motion boolean not null default false,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.categories add column priority_order integer;
alter table public.onboarding_progress enable row level security;
alter table public.experience_preferences enable row level security;
create policy own_onboarding_progress on public.onboarding_progress for select to authenticated using (owner_id=auth.uid());
create policy own_experience_preferences on public.experience_preferences for select to authenticated using (owner_id=auth.uid());
grant select on public.onboarding_progress,public.experience_preferences to authenticated;

create function public.save_onboarding_progress(p_step integer,p_draft jsonb,p_expected_revision integer default 0,p_complete boolean default false)
returns integer language plpgsql security definer set search_path=public as $$
declare v_old public.onboarding_progress%rowtype; v_new public.onboarding_progress%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_step not between 0 and 12 or p_draft is null or jsonb_typeof(p_draft)<>'object' or length(p_draft::text)>65000 then raise exception 'Invalid setup draft'; end if;
  if exists(select 1 from jsonb_object_keys(p_draft) k where k not in ('name','step_goal','water','water_unit','tasks','companion','chatter','reduced_motion','goal_mode','priority_ids','goal_index')) then raise exception 'Unexpected setup field'; end if;
  insert into public.profiles(user_id) values(auth.uid()) on conflict do nothing;
  if p_complete and not exists(select 1 from public.profiles where user_id=auth.uid() and setup_completed_at is not null) then raise exception 'Finish your checklist first'; end if;
  select * into v_old from public.onboarding_progress where owner_id=auth.uid() for update;
  if coalesce(v_old.revision,0)<>p_expected_revision then raise exception 'Setup changed on another device; reload and review it'; end if;
  if v_old.completed_at is not null then raise exception 'This walkthrough is already complete'; end if;
  insert into public.onboarding_progress(owner_id,step,draft,completed_at,revision)
    values(auth.uid(),p_step,p_draft,case when p_complete then now() else null end,p_expected_revision+1)
    on conflict(owner_id) do update set step=excluded.step,draft=excluded.draft,completed_at=excluded.completed_at,revision=excluded.revision,updated_at=now()
    returning * into v_new;
  perform app.audit_change(auth.uid(),'onboarding_progress',auth.uid()::text,
    case when v_old.owner_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
  return v_new.revision;
end $$;

create function public.save_goal_priority_order(p_categories uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare v_count integer; v_category public.categories%rowtype; v_index integer:=0;
begin
  if auth.uid() is null or p_categories is null or cardinality(p_categories)>30 then raise exception 'Invalid goal order'; end if;
  select count(*) into v_count from public.categories where owner_id=auth.uid();
  if cardinality(p_categories)<>v_count or (select count(distinct id) from public.categories where owner_id=auth.uid() and id=any(p_categories))<>v_count then raise exception 'Goal order is stale or contains another person''s category'; end if;
  foreach v_category.id in array p_categories loop
    v_index:=v_index+1;
    select * into v_category from public.categories where id=v_category.id and owner_id=auth.uid() for update;
    update public.categories set priority_order=v_index,revision=revision+1 where id=v_category.id;
    perform app.audit_change(auth.uid(),'categories',v_category.id::text,to_jsonb(v_category),(select to_jsonb(c) from public.categories c where c.id=v_category.id));
  end loop;
end $$;

create function public.save_experience_preferences(p_companion text,p_chatter text,p_reduced_motion boolean,p_expected_revision integer default 0)
returns integer language plpgsql security definer set search_path=public as $$
declare v_old public.experience_preferences%rowtype; v_new public.experience_preferences%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_companion not in ('robot','dog','cat','muse','care') or p_chatter not in ('full','quiet','off') or p_reduced_motion is null then raise exception 'Invalid companion preferences'; end if;
  insert into public.profiles(user_id) values(auth.uid()) on conflict do nothing;
  select * into v_old from public.experience_preferences where owner_id=auth.uid() for update;
  if coalesce(v_old.revision,0)<>p_expected_revision then raise exception 'Preferences changed on another device'; end if;
  insert into public.experience_preferences(owner_id,companion,chatter,reduced_motion,revision)
    values(auth.uid(),p_companion,p_chatter,p_reduced_motion,p_expected_revision+1)
    on conflict(owner_id) do update set companion=excluded.companion,chatter=excluded.chatter,reduced_motion=excluded.reduced_motion,revision=excluded.revision,updated_at=now()
    returning * into v_new;
  perform app.audit_change(auth.uid(),'experience_preferences',auth.uid()::text,
    case when v_old.owner_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
  return v_new.revision;
end $$;

-- The original starter list is now a suggestion, not an eight-task constraint.
-- The entire initial checklist, optional KPIs, and time labels remain atomic.
create or replace function public.finish_setup(p_name text,p_step_goal integer,p_water_quantity numeric,p_water_unit text,p_tasks jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_day date:=app.local_day(); v_month date:=app.month_start(app.local_day()); v_item jsonb; v_task public.tasks%rowtype; v_weekdays integer[]; v_cents integer; v_kpi numeric; v_unit text; v_period text; v_ids uuid[]:='{}';
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.memberships where user_id=auth.uid()) then raise exception 'Join a group first'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 100 or p_step_goal not in (10000,15000) or p_water_quantity is null or p_water_quantity<=0 or length(trim(coalesce(p_water_unit,''))) not between 1 and 30 then raise exception 'Invalid profile or monthly goals'; end if;
  if p_tasks is null or jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks) not between 1 and 100 then raise exception 'Choose at least one activity (maximum 100)'; end if;
  perform 1 from public.profiles where user_id=auth.uid() for update;
  if (select setup_completed_at from public.profiles where user_id=auth.uid()) is not null then raise exception 'Setup was already completed'; end if;
  -- Validate all items before any writes; the function transaction also rolls back on failure.
  for v_item in select value from jsonb_array_elements(p_tasks) loop
    if jsonb_typeof(v_item)<>'object' or jsonb_typeof(v_item->'weekdays')<>'array' then raise exception 'Invalid activity'; end if;
    select array_agg(x::integer) into v_weekdays from jsonb_array_elements_text(v_item->'weekdays') x;
    v_cents:=(v_item->>'reward_cents')::integer;
    v_kpi:=nullif(v_item->>'kpi_target','')::numeric;
    v_unit:=nullif(trim(coalesce(v_item->>'kpi_unit','')),'');
    v_period:=coalesce(v_item->>'period','anytime');
    if length(trim(coalesce(v_item->>'title',''))) not between 1 and 200 or length(coalesce(v_item->>'description',''))>10000 or v_cents is null or v_cents<0 or v_cents>100000000 or array_length(v_weekdays,1) not between 1 and 7 or not v_weekdays <@ array[1,2,3,4,5,6,7] or (select count(distinct x) from unnest(v_weekdays) x)<>array_length(v_weekdays,1) or v_period not in ('morning','afternoon','evening','anytime') then raise exception 'Invalid activity'; end if;
    if (v_kpi is null and v_unit is not null) or (v_kpi is not null and (v_kpi<=0 or v_kpi>100000000 or length(v_unit) not between 1 and 30)) then raise exception 'Invalid activity KPI'; end if;
  end loop;
  update public.profiles set display_name=trim(p_name),step_goal=p_step_goal,water_quantity=p_water_quantity,water_unit=trim(p_water_unit),setup_completed_at=now(),revision=revision+1 where user_id=auth.uid();
  perform app.audit_change(auth.uid(),'profiles',auth.uid()::text,null,(select to_jsonb(p) from public.profiles p where user_id=auth.uid()));
  for v_item in select value from jsonb_array_elements(p_tasks) loop
    select array_agg(x::integer) into v_weekdays from jsonb_array_elements_text(v_item->'weekdays') x;
    v_cents:=(v_item->>'reward_cents')::integer;
    insert into public.tasks(owner_id,title,description,start_date) values(auth.uid(),trim(v_item->>'title'),coalesce(v_item->>'description',''),v_day) returning * into v_task;
    v_ids:=array_append(v_ids,v_task.id);
    insert into public.task_month_settings(task_id,month,reward_cents,weekdays,step_goal,water_quantity,water_unit) values(v_task.id,v_month,v_cents,v_weekdays,p_step_goal,p_water_quantity,p_water_unit);
    insert into public.task_schedule_versions(task_id,month,weekdays,revision) values(v_task.id,v_month,v_weekdays,1);
    perform app.audit_change(auth.uid(),'tasks',v_task.id::text,null,to_jsonb(v_task));
    perform app.audit_change(auth.uid(),'task_month_settings',v_task.id::text||':'||v_month::text,null,jsonb_build_object('task_id',v_task.id,'month',v_month,'reward_cents',v_cents,'weekdays',v_weekdays,'step_goal',p_step_goal,'water_quantity',p_water_quantity,'water_unit',p_water_unit,'revision',1));
    if nullif(v_item->>'kpi_target','') is not null then
      insert into public.activity_kpis(task_id,owner_id,target,unit) values(v_task.id,auth.uid(),(v_item->>'kpi_target')::numeric,trim(v_item->>'kpi_unit'));
      perform app.audit_change(auth.uid(),'activity_kpis',v_task.id::text,null,(select to_jsonb(k) from public.activity_kpis k where k.task_id=v_task.id));
    end if;
    v_period:=coalesce(v_item->>'period','anytime');
    if v_period<>'anytime' then
      insert into public.task_periods(task_id,owner_id,period) values(v_task.id,auth.uid(),v_period);
      perform app.audit_change(auth.uid(),'task_periods',v_task.id::text,null,(select to_jsonb(p) from public.task_periods p where p.task_id=v_task.id));
    end if;
  end loop;
  insert into public.checklist_presentation(owner_id,ordered_ids,grouped) values(auth.uid(),v_ids,false);
  perform app.audit_change(auth.uid(),'checklist_presentation',auth.uid()::text,null,(select to_jsonb(p) from public.checklist_presentation p where p.owner_id=auth.uid()));
end $$;

revoke execute on function public.save_onboarding_progress(integer,jsonb,integer,boolean),public.save_experience_preferences(text,text,boolean,integer),public.save_goal_priority_order(uuid[]) from public,anon;
grant execute on function public.save_onboarding_progress(integer,jsonb,integer,boolean),public.save_experience_preferences(text,text,boolean,integer),public.save_goal_priority_order(uuid[]) to authenticated;
