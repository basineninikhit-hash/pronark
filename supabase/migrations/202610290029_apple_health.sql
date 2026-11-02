-- Apple Health and Apple Fitness as suggested check-ins.
--
-- * The iPhone companion uploads one daily total per data type (steps, or workout minutes by
--   workout kind) for days in the current month. Nothing else: no samples, routes or locations.
-- * When a total meets a linked activity's target, a suggestion appears. Only an explicit
--   confirmation creates a completion, through the same write path as a manual check-off, so a
--   day can never earn twice. Dismissing never creates a completion.
-- * Every health table is owner-only: no group or partner read policy, no audit trail entry and
--   no Google Sheets mirror. Group members only see the ordinary completion.
-- * Days follow America/New_York (app.local_day), the same rule as every other check-off.

create table public.health_connections(
  owner_id uuid primary key references public.profiles(user_id) on delete cascade,
  steps_enabled boolean not null default false,
  workouts_enabled boolean not null default false,
  device_label text not null default '' check (length(device_label) <= 60),
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  revision integer not null default 1
);

create table public.health_activity_links(
  task_id uuid primary key references public.tasks(id) on delete cascade,
  owner_id uuid not null references public.profiles(user_id),
  kind text not null check (kind in ('steps','workouts')),
  -- steps: a step count; workouts: total minutes that day.
  target numeric(10,1) not null,
  -- Empty means any workout counts.
  workout_types text[] not null default '{}',
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  check ((kind = 'steps' and target between 100 and 200000 and workout_types = '{}')
      or (kind = 'workouts' and target between 1 and 1440
          and workout_types <@ array['running','walking','cycling','strength','hiit','yoga','swimming','dance','other']))
);

create table public.health_daily_values(
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  kind text not null check (kind in ('steps','workouts')),
  local_date date not null,
  value numeric(10,1) not null check (value >= 0),
  -- Workouts only: minutes per workout kind, e.g. {"running": 32}.
  details jsonb not null default '{}',
  source text not null default 'Apple Health' check (length(source) <= 80),
  -- When the phone read this total. An older total never replaces a newer one.
  observed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, kind, local_date)
);

-- Each upload carries a batch id, so an offline retry of the same upload is a no-op.
create table public.health_sync_batches(
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  batch_id uuid not null,
  received_at timestamptz not null default now(),
  result jsonb not null,
  primary key (owner_id, batch_id)
);

create table public.health_suggestions(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(user_id),
  task_id uuid not null references public.tasks(id) on delete cascade,
  local_date date not null,
  kind text not null check (kind in ('steps','workouts')),
  measured_value numeric(10,1) not null,
  target numeric(10,1) not null,
  unit text not null,
  source text not null,
  -- pending: waiting for the member · confirmed: checked off from this suggestion
  -- dismissed: member said no · withdrawn: Health data no longer meets the target
  -- already_done: the member checked it off by hand · undone: confirmed, then unchecked
  status text not null default 'pending' check (status in ('pending','confirmed','dismissed','withdrawn','already_done','undone')),
  -- True when Health data dropped below the target after the member confirmed.
  data_changed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (task_id, local_date)
);
create index health_suggestions_owner_status on public.health_suggestions(owner_id, status);

alter table public.health_connections enable row level security;
alter table public.health_activity_links enable row level security;
alter table public.health_daily_values enable row level security;
alter table public.health_sync_batches enable row level security;
alter table public.health_suggestions enable row level security;
-- Owner-only reads. Daily totals and sync batches are not readable from the browser at all.
create policy read_own_health_connection on public.health_connections for select to authenticated using (owner_id = auth.uid());
create policy read_own_health_links on public.health_activity_links for select to authenticated using (owner_id = auth.uid());
create policy read_own_health_suggestions on public.health_suggestions for select to authenticated using (owner_id = auth.uid());
grant select on public.health_connections, public.health_activity_links, public.health_suggestions to authenticated;

-- A day can take a suggestion when it's in the current month, not in the future, and scheduled.
create function app.health_day_open(p_task uuid, p_date date)
returns boolean language sql stable security definer set search_path=public as $$
  select p_date <= app.local_day() and app.month_start(p_date) = app.month_start(app.local_day()) and app.due(p_task, p_date)
$$;

-- Brings one activity's suggestion for one day up to date with the latest Health total.
-- Returns true when a suggestion became pending (new or reopened).
create function app.health_evaluate(p_owner uuid, p_task uuid, p_date date)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  l public.health_activity_links%rowtype; d public.health_daily_values%rowtype; s public.health_suggestions%rowtype;
  v numeric; v_meets boolean; v_open boolean; v_done boolean;
begin
  select * into l from public.health_activity_links where task_id = p_task and owner_id = p_owner;
  if l.task_id is not null then
    select * into d from public.health_daily_values where owner_id = p_owner and kind = l.kind and local_date = p_date;
    if d.owner_id is not null then
      v := case when l.kind = 'workouts' and cardinality(l.workout_types) > 0
        then (select coalesce(sum((d.details ->> t)::numeric), 0) from unnest(l.workout_types) t)
        else d.value end;
    end if;
  end if;
  v_meets := v is not null and v >= l.target;
  v_open := app.health_day_open(p_task, p_date);
  v_done := exists(select 1 from public.completions where task_id = p_task and local_date = p_date and completed);
  select * into s from public.health_suggestions where task_id = p_task and local_date = p_date for update;

  if s.id is null then
    if v_meets and v_open and not v_done then
      insert into public.health_suggestions(owner_id, task_id, local_date, kind, measured_value, target, unit, source)
      values (p_owner, p_task, p_date, l.kind, v, l.target, case l.kind when 'steps' then 'steps' else 'minutes' end, d.source);
      return true;
    end if;
    return false;
  end if;

  if s.status in ('pending', 'withdrawn') then
    if v_meets and v_open and not v_done then
      update public.health_suggestions set status = 'pending', kind = l.kind, measured_value = v, target = l.target,
        unit = case l.kind when 'steps' then 'steps' else 'minutes' end, source = d.source, updated_at = now(), resolved_at = null
        where id = s.id;
      return s.status = 'withdrawn';
    elsif s.status = 'pending' then
      update public.health_suggestions set status = case when v_done then 'already_done' else 'withdrawn' end,
        updated_at = now(), resolved_at = now() where id = s.id;
    end if;
  elsif s.status = 'confirmed' and s.data_changed is distinct from (not coalesce(v_meets, false)) then
    -- A confirmed check-in stays (the member said they did it); the history just notes the change.
    update public.health_suggestions set data_changed = not coalesce(v_meets, false), updated_at = now() where id = s.id;
  end if;
  return false;
end $$;

-- Re-checks every activity linked to one data type for one day.
create function app.health_evaluate_kind(p_owner uuid, p_kind text, p_date date)
returns integer language plpgsql security definer set search_path=public as $$
declare v_task uuid; v_count integer := 0;
begin
  for v_task in select task_id from public.health_activity_links where owner_id = p_owner and kind = p_kind loop
    if app.health_evaluate(p_owner, v_task, p_date) then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;

-- Re-checks one activity for every open day this month.
create function app.health_evaluate_task_month(p_owner uuid, p_task uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_day date;
begin
  for v_day in select generate_series(app.month_start(app.local_day()), app.local_day(), interval '1 day')::date loop
    perform app.health_evaluate(p_owner, p_task, v_day);
  end loop;
  -- Pending suggestions from earlier months can no longer be confirmed.
  update public.health_suggestions set status = 'withdrawn', updated_at = now(), resolved_at = now()
    where task_id = p_task and status = 'pending' and app.month_start(local_date) <> app.month_start(app.local_day());
end $$;

-- Manual check-offs keep suggestions honest: checking a day by hand settles its suggestion,
-- and unchecking a day that came from Health marks that suggestion as undone.
create function app.health_on_completion() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.completed and (tg_op = 'INSERT' or not old.completed) then
    update public.health_suggestions set status = 'already_done', updated_at = now(), resolved_at = now()
      where task_id = new.task_id and local_date = new.local_date and status = 'pending';
  elsif tg_op = 'UPDATE' and old.completed and not new.completed then
    update public.health_suggestions set status = 'undone', updated_at = now(), resolved_at = now()
      where task_id = new.task_id and local_date = new.local_date and status = 'confirmed';
  end if;
  return new;
end $$;
create trigger health_on_completion after insert or update of completed on public.completions
  for each row execute function app.health_on_completion();

-- Called by the iPhone companion after it asks for permission. Turning a data type off deletes
-- its stored totals and withdraws its pending suggestions.
create function public.save_health_connection(p_steps boolean, p_workouts boolean, p_device_label text default '')
returns integer language plpgsql security definer set search_path=public as $$
declare v_owner uuid := auth.uid(); v_row public.health_connections%rowtype;
begin
  if v_owner is null then raise exception 'Sign in required'; end if;
  if p_steps is null or p_workouts is null or length(coalesce(p_device_label, '')) > 60 then raise exception 'Invalid Apple Health settings'; end if;
  if not exists(select 1 from public.profiles where user_id = v_owner and setup_completed_at is not null) then raise exception 'Finish setting up Pronark first'; end if;
  insert into public.health_connections(owner_id, steps_enabled, workouts_enabled, device_label)
  values (v_owner, p_steps, p_workouts, coalesce(p_device_label, ''))
  on conflict (owner_id) do update set steps_enabled = excluded.steps_enabled, workouts_enabled = excluded.workouts_enabled,
    device_label = excluded.device_label, revision = health_connections.revision + 1
  returning * into v_row;
  if not p_steps then perform app.health_forget_kind(v_owner, 'steps'); end if;
  if not p_workouts then perform app.health_forget_kind(v_owner, 'workouts'); end if;
  return v_row.revision;
end $$;

create function app.health_forget_kind(p_owner uuid, p_kind text)
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.health_daily_values where owner_id = p_owner and kind = p_kind;
  update public.health_suggestions set status = 'withdrawn', updated_at = now(), resolved_at = now()
    where owner_id = p_owner and kind = p_kind and status = 'pending';
end $$;

-- Stops syncing: unlinks every activity (so the phone has nothing left to read) and deletes every
-- stored Health total. Confirmed check-ins and their history stay.
create function public.disconnect_health()
returns void language plpgsql security definer set search_path=public as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Sign in required'; end if;
  perform app.health_forget_kind(v_owner, 'steps');
  perform app.health_forget_kind(v_owner, 'workouts');
  delete from public.health_activity_links where owner_id = v_owner;
  delete from public.health_sync_batches where owner_id = v_owner;
  delete from public.health_connections where owner_id = v_owner;
end $$;

-- Links an activity to a data type (or unlinks it when p_kind is null).
create function public.save_health_link(p_task uuid, p_kind text, p_target numeric, p_workout_types text[] default '{}')
returns void language plpgsql security definer set search_path=public as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.tasks where id = p_task and owner_id = v_owner) then raise exception 'Task not found or read-only'; end if;
  perform 1 from public.profiles where user_id = v_owner for update;
  if p_kind is null then
    delete from public.health_activity_links where task_id = p_task;
    update public.health_suggestions set status = 'withdrawn', updated_at = now(), resolved_at = now()
      where task_id = p_task and status = 'pending';
    return;
  end if;
  if p_kind not in ('steps', 'workouts') then raise exception 'Choose steps or workouts'; end if;
  insert into public.health_activity_links(task_id, owner_id, kind, target, workout_types)
  values (p_task, v_owner, p_kind, p_target, case when p_kind = 'steps' then '{}' else coalesce(p_workout_types, '{}') end)
  on conflict (task_id) do update set kind = excluded.kind, target = excluded.target, workout_types = excluded.workout_types,
    revision = health_activity_links.revision + 1, updated_at = now();
  perform app.health_evaluate_task_month(v_owner, p_task);
end $$;

-- The companion's upload: [{kind, date, value, details?, source?, observed_at}], one entry per
-- data type per day. Days outside the current month, future days and data types the member has
-- not turned on are ignored, never stored. A repeated batch id returns the first result.
create function public.submit_health_values(p_batch uuid, p_values jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_owner uuid := auth.uid(); v_conn public.health_connections%rowtype; v_prev jsonb; e jsonb;
  v_kind text; v_date date; v_value numeric; v_details jsonb; v_observed timestamptz; v_source text;
  v_accepted integer := 0; v_ignored integer := 0; v_suggested integer := 0; v_result jsonb;
begin
  if v_owner is null then raise exception 'Sign in required'; end if;
  if p_batch is null or jsonb_typeof(p_values) is distinct from 'array' or jsonb_array_length(p_values) > 200 then raise exception 'Invalid health sync'; end if;
  -- Same lock as check-offs, so a sync and a confirmation never race.
  perform 1 from public.profiles where user_id = v_owner for update;
  select result into v_prev from public.health_sync_batches where owner_id = v_owner and batch_id = p_batch;
  if v_prev is not null then return v_prev || jsonb_build_object('duplicate', true); end if;
  select * into v_conn from public.health_connections where owner_id = v_owner;
  if v_conn.owner_id is null then raise exception 'Connect Apple Health first'; end if;

  for e in select * from jsonb_array_elements(p_values) loop
    v_kind := e ->> 'kind';
    v_date := null; v_value := null; v_observed := null;
    if jsonb_typeof(e) = 'object' and coalesce(e ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$' and jsonb_typeof(e -> 'value') = 'number'
       and coalesce(e ->> 'observed_at', '') ~ '^\d{4}-\d{2}-\d{2}T' then
      v_date := (e ->> 'date')::date; v_value := (e ->> 'value')::numeric; v_observed := (e ->> 'observed_at')::timestamptz;
    end if;
    if v_date is null or v_observed is null
       or not ((v_kind = 'steps' and v_conn.steps_enabled and v_value between 0 and 200000)
            or (v_kind = 'workouts' and v_conn.workouts_enabled and v_value between 0 and 1440))
       or v_date > app.local_day() or app.month_start(v_date) <> app.month_start(app.local_day()) then
      v_ignored := v_ignored + 1; continue;
    end if;
    v_details := '{}';
    if v_kind = 'workouts' and jsonb_typeof(e -> 'details') = 'object' then
      select coalesce(jsonb_object_agg(k, least(greatest((x)::numeric, 0), 1440)), '{}') into v_details
        from jsonb_each_text(e -> 'details') as j(k, x)
        where k = any(array['running','walking','cycling','strength','hiit','yoga','swimming','dance','other']) and x ~ '^\d+(\.\d+)?$';
    end if;
    v_source := left(coalesce(nullif(trim(e ->> 'source'), ''), 'Apple Health'), 80);
    insert into public.health_daily_values(owner_id, kind, local_date, value, details, source, observed_at)
    values (v_owner, v_kind, v_date, round(v_value, 1), v_details, v_source, v_observed)
    on conflict (owner_id, kind, local_date) do update set value = excluded.value, details = excluded.details,
      source = excluded.source, observed_at = excluded.observed_at, updated_at = now()
      where health_daily_values.observed_at <= excluded.observed_at;
    v_accepted := v_accepted + 1;
    v_suggested := v_suggested + app.health_evaluate_kind(v_owner, v_kind, v_date);
  end loop;

  update public.health_connections set last_sync_at = now() where owner_id = v_owner;
  v_result := jsonb_build_object('accepted', v_accepted, 'ignored', v_ignored, 'suggested', v_suggested);
  insert into public.health_sync_batches(owner_id, batch_id, result) values (v_owner, p_batch, v_result);
  delete from public.health_sync_batches where owner_id = v_owner and received_at < now() - interval '30 days';
  return v_result;
end $$;

-- Confirms a suggestion. Re-checks the latest Health total and the schedule first, then writes
-- the completion the same way a manual check-off does. Safe to call twice.
-- Returns {status, rewarded}: rewarded is true only for the call that created the check-in.
create function public.confirm_health_suggestion(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_owner uuid := auth.uid(); s public.health_suggestions%rowtype;
begin
  if v_owner is null then raise exception 'Sign in required'; end if;
  perform 1 from public.profiles where user_id = v_owner for update;
  select * into s from public.health_suggestions where id = p_id;
  if s.id is null or s.owner_id <> v_owner then raise exception 'Suggestion not found'; end if;
  if s.status in ('confirmed', 'already_done') then return jsonb_build_object('status', s.status, 'rewarded', false); end if;
  if s.status <> 'pending' then raise exception 'This suggestion is no longer available.'; end if;
  perform app.health_evaluate(v_owner, s.task_id, s.local_date);
  select * into s from public.health_suggestions where id = p_id;
  if s.status <> 'pending' then return jsonb_build_object('status', s.status, 'rewarded', false); end if;
  update public.health_suggestions set status = 'confirmed', data_changed = false, updated_at = now(), resolved_at = now() where id = p_id;
  perform app.apply_completion(v_owner, s.task_id, s.local_date, true);
  return jsonb_build_object('status', 'confirmed', 'rewarded', true);
end $$;

create function public.dismiss_health_suggestion(p_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v_owner uuid := auth.uid(); s public.health_suggestions%rowtype;
begin
  if v_owner is null then raise exception 'Sign in required'; end if;
  select * into s from public.health_suggestions where id = p_id for update;
  if s.id is null or s.owner_id <> v_owner then raise exception 'Suggestion not found'; end if;
  if s.status in ('pending', 'withdrawn') then
    update public.health_suggestions set status = 'dismissed', updated_at = now(), resolved_at = now() where id = p_id;
    return 'dismissed';
  end if;
  return s.status;
end $$;

revoke execute on function app.health_day_open(uuid,date), app.health_evaluate(uuid,uuid,date), app.health_evaluate_kind(uuid,text,date),
  app.health_evaluate_task_month(uuid,uuid), app.health_forget_kind(uuid,text), app.health_on_completion() from public, anon, authenticated;
revoke execute on function public.save_health_connection(boolean,boolean,text), public.disconnect_health(), public.save_health_link(uuid,text,numeric,text[]),
  public.submit_health_values(uuid,jsonb), public.confirm_health_suggestion(uuid), public.dismiss_health_suggestion(uuid) from public, anon;
grant execute on function public.save_health_connection(boolean,boolean,text), public.disconnect_health(), public.save_health_link(uuid,text,numeric,text[]),
  public.submit_health_values(uuid,jsonb), public.confirm_health_suggestion(uuid), public.dismiss_health_suggestion(uuid) to authenticated;

-- Start over also removes every Apple Health record (same as 202610220025, plus the health block).
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

  -- Apple Health: links, suggestions, daily totals, sync history and the connection.
  delete from health_suggestions where owner_id = v_user;
  delete from health_activity_links where owner_id = v_user;
  delete from health_daily_values where owner_id = v_user;
  delete from health_sync_batches where owner_id = v_user;
  delete from health_connections where owner_id = v_user;

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
