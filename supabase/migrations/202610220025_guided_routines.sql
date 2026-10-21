-- Guided Routines (first version). See design/guided-routines/*.md for the approved behavior.
--
-- * Definitions, runs and step results are owner-only (no partner/group read policy).
-- * A routine definition is never written to the audit trail, so step names and notes never
--   reach the Google Sheets mirror. Each run logs only the six approved summary fields.
-- * A linked key step uses the same completions + wallet reconciliation as a manual checkoff,
--   so it can never create a second reward.

create table public.routines(
  id uuid primary key,
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 80),
  active_days integer[] not null check(cardinality(active_days) between 1 and 7 and active_days <@ array[1,2,3,4,5,6,7]),
  start_time time check(start_time is null or (extract(minute from start_time)::int % 15 = 0 and extract(second from start_time) = 0)),
  reminder_enabled boolean not null default false,
  archived_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create table public.routine_categories(
  id uuid primary key,
  routine_id uuid not null references public.routines(id) on delete cascade,
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  position integer not null,
  title text not null check(length(trim(title)) between 1 and 60));
create table public.routine_steps(
  id uuid primary key,
  category_id uuid not null references public.routine_categories(id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  position integer not null,
  title text not null check(length(trim(title)) between 1 and 80),
  instruction text not null default '' check(length(instruction) <= 500),
  weekdays integer[] check(weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7])),
  timer_seconds integer check(timer_seconds is null or timer_seconds between 10 and 14400),
  habit_task_id uuid references public.tasks(id) on delete set null,
  record_time boolean not null default false,
  enabled boolean not null default true);
create unique index routine_steps_one_key_per_habit on public.routine_steps(routine_id, habit_task_id) where habit_task_id is not null;

create table public.routine_runs(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  start_date date not null,
  snapshot jsonb not null,
  state text not null default 'active' check(state in ('active','finished','ended')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  step_started_at timestamptz not null default now(),
  paused_at timestamptz,
  step_paused_ms bigint not null default 0,
  revision integer not null default 1,
  unique(routine_id, start_date));
create table public.routine_step_results(
  run_id uuid not null references public.routine_runs(id) on delete cascade,
  step_id uuid not null,
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null check(status in ('done','skipped')),
  started_at timestamptz not null,
  resolved_at timestamptz not null default now(),
  local_date date not null,
  active_ms bigint not null default 0,
  habit_task_id uuid,
  habit_outcome text not null default 'none' check(habit_outcome in ('none','checked','already','not_scheduled')),
  created_checkoff boolean not null default false,
  primary key(run_id, step_id));

alter table public.routines enable row level security;
alter table public.routine_categories enable row level security;
alter table public.routine_steps enable row level security;
alter table public.routine_runs enable row level security;
alter table public.routine_step_results enable row level security;
create policy own_routines on public.routines for select to authenticated using(owner_id=auth.uid());
create policy own_routine_categories on public.routine_categories for select to authenticated using(owner_id=auth.uid());
create policy own_routine_steps on public.routine_steps for select to authenticated using(owner_id=auth.uid());
create policy own_routine_runs on public.routine_runs for select to authenticated using(owner_id=auth.uid());
create policy own_routine_step_results on public.routine_step_results for select to authenticated using(owner_id=auth.uid());
grant select on public.routines, public.routine_categories, public.routine_steps, public.routine_runs, public.routine_step_results to authenticated;

-- Reminder delivery bookkeeping (worker only).
create table public.routine_reminder_jobs(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  local_date date not null,
  state text not null default 'pending' check(state in ('pending','leased','sent','skipped','failed')),
  attempts integer not null default 0, lease_until timestamptz, sent_at timestamptz, last_error text,
  unique(routine_id, local_date));
alter table public.routine_reminder_jobs enable row level security;
revoke all on public.routine_reminder_jobs from anon, authenticated;

/* ---------- helpers ---------- */

-- The same checkoff write a manual checkoff makes (completion row, audit/Sheets entry, wallet
-- reconciliation). Callers must already have checked ownership and the schedule.
create function app.apply_completion(p_owner uuid, p_task uuid, p_date date, p_completed boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_old public.completions%rowtype; v_new public.completions%rowtype;
begin
  select * into v_old from public.completions where task_id=p_task and local_date=p_date for update;
  if v_old.task_id is null then
    insert into public.completions(task_id,owner_id,local_date,completed) values(p_task,p_owner,p_date,p_completed) returning * into v_new;
  else
    update public.completions set completed=p_completed,version=version+1,updated_at=now() where task_id=p_task and local_date=p_date returning * into v_new;
  end if;
  perform app.audit_change(p_owner,'completions',p_task::text||':'||p_date::text,case when v_old.task_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
  perform app.reconcile_wallet_change(p_owner,app.month_start(p_date));
end $$;

-- Ordered snapshot of the steps active on a given date.
create function app.routine_snapshot(p_routine uuid, p_date date)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(c.cat order by c.position), '[]'::jsonb) from (
    select rc.position, jsonb_build_object('id', rc.id, 'title', rc.title, 'steps', jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title, 'instruction', s.instruction, 'timer_seconds', s.timer_seconds,
      'habit_task_id', s.habit_task_id, 'record_time', s.record_time) order by s.position)) as cat
    from public.routine_categories rc join public.routine_steps s on s.category_id = rc.id
    where rc.routine_id = p_routine and s.enabled and (s.weekdays is null or extract(isodow from p_date)::int = any(s.weekdays))
    group by rc.id, rc.position, rc.title) c $$;

create function app.routine_step_ids(p_snapshot jsonb)
returns uuid[] language sql immutable as $$
  select coalesce(array_agg((step->>'id')::uuid order by ci, si), '{}') from jsonb_array_elements(p_snapshot) with ordinality as c(cat, ci), jsonb_array_elements(c.cat->'steps') with ordinality as s(step, si) $$;

-- Logs the approved six-field summary (and only that) for the Sheets mirror.
create function app.log_routine_run(p_run uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_run public.routine_runs%rowtype; v_done integer; v_skipped integer;
begin
  update public.routine_runs set revision = revision + 1 where id = p_run returning * into v_run;
  select count(*) filter (where status='done'), count(*) filter (where status='skipped') into v_done, v_skipped from public.routine_step_results where run_id = p_run;
  perform app.audit_change(v_run.owner_id, 'routine_runs', p_run::text, null, jsonb_build_object(
    'local_date', v_run.start_date, 'routine_id', v_run.routine_id, 'total_steps', cardinality(app.routine_step_ids(v_run.snapshot)),
    'done', v_done, 'skipped', v_skipped, 'finished', v_run.state = 'finished', 'revision', v_run.revision));
end $$;

/* ---------- builder ---------- */

create function public.save_routine(p_id uuid, p_name text, p_active_days integer[], p_start_time time, p_reminder boolean, p_categories jsonb, p_expected_revision integer default 0)
returns integer language plpgsql security definer set search_path=public as $$
declare v_old public.routines%rowtype; v_rev integer; v_cat jsonb; v_step jsonb; ci integer := 0; si integer; v_habit uuid; v_total integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_id is null or p_categories is null or jsonb_typeof(p_categories) <> 'array' then raise exception 'Invalid routine'; end if;
  if jsonb_array_length(p_categories) > 30 then raise exception 'A routine can have at most 30 categories'; end if;
  select * into v_old from public.routines where id = p_id for update;
  if v_old.id is not null and v_old.owner_id <> auth.uid() then raise exception 'Routine not found'; end if;
  if coalesce(v_old.revision, 0) <> p_expected_revision then raise exception 'This routine changed on another device. Reload and try again.'; end if;
  if v_old.id is null and (select count(*) from public.routines where owner_id = auth.uid() and archived_at is null) >= 20 then raise exception 'You can have up to 20 routines'; end if;
  v_rev := p_expected_revision + 1;
  insert into public.routines(id, owner_id, name, active_days, start_time, reminder_enabled, revision)
    values(p_id, auth.uid(), trim(p_name), (select array_agg(distinct d order by d) from unnest(p_active_days) d), p_start_time, coalesce(p_reminder, false), v_rev)
    on conflict(id) do update set name = excluded.name, active_days = excluded.active_days, start_time = excluded.start_time,
      reminder_enabled = excluded.reminder_enabled, revision = excluded.revision, updated_at = now();
  -- Replace the definition. Active runs keep their own snapshot, so they are unaffected.
  delete from public.routine_categories where routine_id = p_id;
  for v_cat in select value from jsonb_array_elements(p_categories) loop
    ci := ci + 1;
    if jsonb_typeof(v_cat->'steps') <> 'array' then raise exception 'Invalid category'; end if;
    insert into public.routine_categories(id, routine_id, owner_id, position, title) values((v_cat->>'id')::uuid, p_id, auth.uid(), ci, trim(v_cat->>'title'));
    si := 0;
    for v_step in select value from jsonb_array_elements(v_cat->'steps') loop
      si := si + 1; v_total := v_total + 1;
      if v_total > 150 then raise exception 'A routine can have at most 150 steps'; end if;
      v_habit := nullif(v_step->>'habit_task_id', '')::uuid;
      if v_habit is not null and not exists(select 1 from public.tasks where id = v_habit and owner_id = auth.uid() and archive_date is null) then raise exception 'A linked habit is not yours or is archived'; end if;
      insert into public.routine_steps(id, category_id, routine_id, owner_id, position, title, instruction, weekdays, timer_seconds, habit_task_id, record_time, enabled)
        values((v_step->>'id')::uuid, (v_cat->>'id')::uuid, p_id, auth.uid(), si, trim(v_step->>'title'), coalesce(v_step->>'instruction', ''),
          case when jsonb_typeof(v_step->'weekdays') = 'array' then array(select distinct x::int from jsonb_array_elements_text(v_step->'weekdays') x order by 1) end,
          nullif(v_step->>'timer_seconds', '')::integer, v_habit, coalesce((v_step->>'record_time')::boolean, false), coalesce((v_step->>'enabled')::boolean, true));
    end loop;
  end loop;
  return v_rev;
end $$;

create function public.archive_routine(p_id uuid, p_archived boolean default true)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.routines set archived_at = case when p_archived then now() end, reminder_enabled = case when p_archived then false else reminder_enabled end, revision = revision + 1, updated_at = now()
    where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'Routine not found'; end if;
end $$;

/* ---------- running ---------- */

create function public.start_routine_run(p_routine uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_routine public.routines%rowtype; v_run public.routine_runs%rowtype; v_today date := app.local_day(); v_snapshot jsonb;
begin
  select * into v_routine from public.routines where id = p_routine and owner_id = auth.uid() and archived_at is null for update;
  if v_routine.id is null then raise exception 'Routine not found'; end if;
  -- An unfinished run (even from an earlier day) is resumed rather than replaced.
  select * into v_run from public.routine_runs where routine_id = p_routine and state = 'active' order by start_date desc limit 1;
  if v_run.id is not null then return v_run.id; end if;
  if exists(select 1 from public.routine_runs where routine_id = p_routine and start_date = v_today) then raise exception 'You already ran this routine today'; end if;
  v_snapshot := app.routine_snapshot(p_routine, v_today);
  if cardinality(app.routine_step_ids(v_snapshot)) = 0 then raise exception 'No steps are scheduled for this routine today'; end if;
  insert into public.routine_runs(owner_id, routine_id, start_date, snapshot) values(auth.uid(), p_routine, v_today, v_snapshot) returning * into v_run;
  perform app.log_routine_run(v_run.id);
  return v_run.id;
end $$;

-- Done or Skip the current step. Retry-safe: repeating the same answer returns the saved result.
create function public.resolve_routine_step(p_run uuid, p_step uuid, p_status text)
returns text language plpgsql security definer set search_path=public as $$
declare v_run public.routine_runs%rowtype; v_ids uuid[]; v_next uuid; v_step jsonb; v_existing public.routine_step_results%rowtype;
  v_day date := app.local_day(); v_habit uuid; v_outcome text := 'none'; v_created boolean := false; v_active bigint;
begin
  if p_status not in ('done','skipped') then raise exception 'Invalid step result'; end if;
  select * into v_run from public.routine_runs where id = p_run and owner_id = auth.uid() for update;
  if v_run.id is null then raise exception 'Routine run not found'; end if;
  select * into v_existing from public.routine_step_results where run_id = p_run and step_id = p_step;
  if v_existing.run_id is not null then
    if v_existing.status = p_status then return v_existing.habit_outcome; end if;
    raise exception 'This step was already recorded. Use Undo to change it.';
  end if;
  if v_run.state <> 'active' then raise exception 'This run is no longer active'; end if;
  v_ids := app.routine_step_ids(v_run.snapshot);
  select id into v_next from unnest(v_ids) with ordinality as t(id, n) where id not in (select step_id from public.routine_step_results where run_id = p_run) order by n limit 1;
  if v_next is distinct from p_step then raise exception 'That is not the current step'; end if;
  select step into v_step from jsonb_array_elements(v_run.snapshot) c(cat), jsonb_array_elements(c.cat->'steps') s(step) where (step->>'id')::uuid = p_step;
  v_habit := nullif(v_step->>'habit_task_id', '')::uuid;
  if p_status = 'done' and v_habit is not null then
    perform 1 from public.profiles where user_id = auth.uid() for update;
    if not exists(select 1 from public.tasks where id = v_habit and owner_id = auth.uid()) or not app.due(v_habit, v_day) then v_outcome := 'not_scheduled';
    elsif exists(select 1 from public.completions where task_id = v_habit and local_date = v_day and completed) then v_outcome := 'already';
    else perform app.apply_completion(auth.uid(), v_habit, v_day, true); v_outcome := 'checked'; v_created := true;
    end if;
  end if;
  v_active := greatest(0, (extract(epoch from (coalesce(v_run.paused_at, now()) - v_run.step_started_at)) * 1000)::bigint - v_run.step_paused_ms);
  insert into public.routine_step_results(run_id, step_id, owner_id, status, started_at, local_date, active_ms, habit_task_id, habit_outcome, created_checkoff)
    values(p_run, p_step, auth.uid(), p_status, v_run.step_started_at, v_day, v_active, v_habit, v_outcome, v_created);
  update public.routine_runs set step_started_at = now(), paused_at = null, step_paused_ms = 0,
      state = case when cardinality(v_ids) = (select count(*) from public.routine_step_results where run_id = p_run) then 'finished' else 'active' end,
      finished_at = case when cardinality(v_ids) = (select count(*) from public.routine_step_results where run_id = p_run) then now() end
    where id = p_run;
  perform app.log_routine_run(p_run);
  return v_outcome;
end $$;

-- Undo the most recent Done/Skip. A habit checkoff is removed only if this routine created it.
create function public.undo_routine_step(p_run uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_run public.routine_runs%rowtype; v_last public.routine_step_results%rowtype;
begin
  select * into v_run from public.routine_runs where id = p_run and owner_id = auth.uid() for update;
  if v_run.id is null or v_run.state = 'ended' then raise exception 'Routine run not found'; end if;
  select * into v_last from public.routine_step_results where run_id = p_run order by resolved_at desc, started_at desc limit 1;
  if v_last.run_id is null then raise exception 'Nothing to undo'; end if;
  if v_last.created_checkoff and exists(select 1 from public.completions where task_id = v_last.habit_task_id and local_date = v_last.local_date and completed) then
    perform 1 from public.profiles where user_id = auth.uid() for update;
    perform app.apply_completion(auth.uid(), v_last.habit_task_id, v_last.local_date, false);
  end if;
  delete from public.routine_step_results where run_id = p_run and step_id = v_last.step_id;
  update public.routine_runs set state = 'active', finished_at = null, paused_at = null, step_paused_ms = 0,
    step_started_at = now() - (v_last.active_ms || ' milliseconds')::interval where id = p_run;
  perform app.log_routine_run(p_run);
  return v_last.step_id;
end $$;

create function public.set_routine_run_paused(p_run uuid, p_paused boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_paused then
    update public.routine_runs set paused_at = coalesce(paused_at, now()) where id = p_run and owner_id = auth.uid() and state = 'active';
  else
    update public.routine_runs set step_paused_ms = step_paused_ms + coalesce((extract(epoch from (now() - paused_at)) * 1000)::bigint, 0), paused_at = null
      where id = p_run and owner_id = auth.uid() and state = 'active';
  end if;
  if not found then raise exception 'Routine run not found'; end if;
end $$;

create function public.end_routine_run(p_run uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.routine_runs set state = 'ended', finished_at = now(), paused_at = null where id = p_run and owner_id = auth.uid() and state = 'active';
  if not found then raise exception 'Routine run not found'; end if;
  perform app.log_routine_run(p_run);
end $$;

revoke execute on function public.save_routine(uuid,text,integer[],time,boolean,jsonb,integer), public.archive_routine(uuid,boolean), public.start_routine_run(uuid),
  public.resolve_routine_step(uuid,uuid,text), public.undo_routine_step(uuid), public.set_routine_run_paused(uuid,boolean), public.end_routine_run(uuid) from public, anon;
grant execute on function public.save_routine(uuid,text,integer[],time,boolean,jsonb,integer), public.archive_routine(uuid,boolean), public.start_routine_run(uuid),
  public.resolve_routine_step(uuid,uuid,text), public.undo_routine_step(uuid), public.set_routine_run_paused(uuid,boolean), public.end_routine_run(uuid) to authenticated;
revoke execute on function app.apply_completion(uuid,uuid,date,boolean) from public, anon, authenticated;

-- Start over also removes routine data.
create or replace function public.start_over(p_confirm text)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid();
  v_group record;
  v_heir uuid;
  v_reset_id text;
begin
  if v_user is null then raise exception 'Sign in first'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'Type DELETE to confirm starting over'; end if;
  perform 1 from profiles where user_id = v_user for update;

  -- Groups: hand off or remove the ones this member owns, then leave all of them.
  for v_group in select g.id from groups g join memberships m on m.group_id = g.id and m.user_id = v_user where g.owner_id = v_user loop
    select user_id into v_heir from memberships where group_id = v_group.id and user_id <> v_user order by joined_at, user_id limit 1;
    if v_heir is not null then
      update groups set owner_id = v_heir, revision = revision + 1 where id = v_group.id;
      update garden_plants set creator_id = v_heir where group_id = v_group.id and creator_id = v_user;
    else
      delete from invitations where group_id = v_group.id;
      delete from memberships where group_id = v_group.id;
      delete from groups where id = v_group.id; -- garden, sharing and opt-ins cascade
    end if;
  end loop;
  -- Plants this member started in groups owned by someone else stay with that group's owner.
  update garden_plants p set creator_id = g.owner_id from groups g where p.group_id = g.id and p.creator_id = v_user;
  delete from garden_visual_events where user_id = v_user;
  delete from garden_participants where user_id = v_user;
  delete from garden_cheers where from_user = v_user or to_user = v_user;
  delete from group_versus_optins where user_id = v_user;
  delete from invitations where created_by = v_user;
  delete from memberships where user_id = v_user; -- group_sharing and activity shares cascade

  -- Guided routines (runs cascade to step results; jobs and steps cascade from routines).
  delete from routine_reminder_jobs where owner_id = v_user;
  delete from routine_step_results where owner_id = v_user;
  delete from routine_runs where owner_id = v_user;
  delete from routine_steps where owner_id = v_user;
  delete from routine_categories where owner_id = v_user;
  delete from routines where owner_id = v_user;

  -- Notifications, reports and reminders.
  delete from custom_reminder_jobs where owner_id = v_user;
  delete from reminder_rules where owner_id = v_user;
  delete from reminder_preferences where owner_id = v_user;
  delete from notification_jobs where owner_id = v_user;
  delete from notification_updates where owner_id = v_user;
  delete from notification_preferences where owner_id = v_user;
  delete from push_subscriptions where owner_id = v_user;
  delete from report_delivery_jobs where owner_id = v_user;
  delete from weekly_reports where owner_id = v_user;
  delete from report_preferences where owner_id = v_user;

  -- Private measurements and activity numbers.
  delete from private_metric_logs where owner_id = v_user;
  delete from private_metric_audit where owner_id = v_user;
  delete from private_metrics where owner_id = v_user;
  delete from activity_kpi_logs where owner_id = v_user;
  delete from activity_kpis where owner_id = v_user;

  -- Rewards: purchases and wishlist items point at each other, so unlink them first.
  delete from purchase_allocation_effects where owner_id = v_user;
  delete from allocation_events where owner_id = v_user;
  delete from item_allocations where owner_id = v_user;
  update wishlist_items set linked_purchase_id = null where owner_id = v_user and linked_purchase_id is not null;
  update purchases set linked_wishlist_id = null where owner_id = v_user and linked_wishlist_id is not null;
  delete from purchases where owner_id = v_user;
  delete from category_target_increments where owner_id = v_user;
  delete from category_target_plans where owner_id = v_user;
  delete from wishlist_items where owner_id = v_user;
  delete from categories where owner_id = v_user;
  delete from earnings where owner_id = v_user;

  -- Checklist and history.
  delete from completions where owner_id = v_user;
  delete from task_periods where owner_id = v_user;
  delete from checklist_presentation where owner_id = v_user;
  delete from task_month_settings where task_id in (select id from tasks where owner_id = v_user);
  delete from task_schedule_versions where task_id in (select id from tasks where owner_id = v_user);
  delete from tasks where owner_id = v_user;
  delete from template_versions where template_id in (select id from routine_templates where owner_id = v_user);
  delete from routine_templates where owner_id = v_user;

  -- Setup and preferences, then send the member back to guided setup.
  delete from onboarding_progress where owner_id = v_user;
  delete from experience_preferences where owner_id = v_user;
  update profiles set display_name = '', setup_completed_at = null, step_goal = null, water_quantity = null, water_unit = null, revision = revision + 1
    where user_id = v_user;

  -- Leave a marker in the audit trail; the Sheets mirror appends it as a new row.
  v_reset_id := v_user::text || ':' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDD"T"HH24MISS.US');
  perform app.audit_change(v_user, 'account_reset', v_reset_id, null, jsonb_build_object(
    'revision', 1, 'reset_at', clock_timestamp(),
    'note', 'Member deleted their Pronark data and started over. Earlier rows for this member are history and no longer in the app.'));
end $$;
