-- Optional measurable targets and daily tracking for existing activities.
create table public.activity_kpis (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  owner_id uuid not null references public.profiles(user_id),
  target numeric(12,3) not null check (target > 0 and target <= 100000000),
  unit text not null check (length(trim(unit)) between 1 and 30),
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.activity_kpi_logs (
  task_id uuid not null references public.tasks(id) on delete cascade,
  owner_id uuid not null references public.profiles(user_id),
  local_date date not null,
  value numeric(12,3) not null check (value >= 0 and value <= 100000000),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (task_id, local_date)
);
alter table public.activity_kpis enable row level security;
alter table public.activity_kpi_logs enable row level security;
create policy read_activity_kpis on public.activity_kpis for select to authenticated using (app.same_group(auth.uid(), owner_id));
create policy read_activity_kpi_logs on public.activity_kpi_logs for select to authenticated using (app.same_group(auth.uid(), owner_id));
grant select on public.activity_kpis, public.activity_kpi_logs to authenticated;

create function public.save_activity_kpi(p_task uuid, p_target numeric, p_unit text, p_expected_revision integer default 0)
returns integer language plpgsql security definer set search_path = public as $$
declare v_task public.tasks%rowtype; v_old public.activity_kpis%rowtype; v_new public.activity_kpis%rowtype;
begin
  select * into v_task from public.tasks where id = p_task for update;
  if v_task.id is null or v_task.owner_id <> auth.uid() then raise exception 'Activity not found or read-only'; end if;
  if p_target is null or p_target <= 0 or p_target > 100000000 or length(trim(coalesce(p_unit, ''))) not between 1 and 30 then raise exception 'Enter a positive target and a unit'; end if;
  select * into v_old from public.activity_kpis where task_id = p_task for update;
  if coalesce(v_old.revision, 0) <> p_expected_revision then raise exception 'This KPI changed on another device. Refresh and try again.'; end if;
  insert into public.activity_kpis(task_id, owner_id, target, unit, revision)
    values(p_task, auth.uid(), p_target, trim(p_unit),
      coalesce(v_old.revision, (select max((after_value->>'revision')::integer) from public.audit_events where entity = 'activity_kpis' and entity_id = p_task::text), 0) + 1)
    on conflict(task_id) do update set target = excluded.target, unit = excluded.unit, revision = excluded.revision, updated_at = now()
    returning * into v_new;
  perform app.audit_change(auth.uid(), 'activity_kpis', p_task::text,
    case when v_old.task_id is null then null else to_jsonb(v_old) end, to_jsonb(v_new));
  return v_new.revision;
end $$;

create function public.remove_activity_kpi(p_task uuid, p_expected_revision integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.activity_kpis%rowtype;
begin
  select * into v_old from public.activity_kpis where task_id = p_task for update;
  if v_old.task_id is null or v_old.owner_id <> auth.uid() then raise exception 'KPI not found or read-only'; end if;
  if v_old.revision <> p_expected_revision then raise exception 'This KPI changed on another device. Refresh and try again.'; end if;
  delete from public.activity_kpis where task_id = p_task;
  perform app.audit_change(auth.uid(), 'activity_kpis', p_task::text, to_jsonb(v_old),
    jsonb_build_object('task_id', p_task, 'owner_id', auth.uid(), 'deleted', true, 'revision', v_old.revision + 1));
end $$;

create function public.save_activity_kpi_log(p_task uuid, p_date date, p_value numeric, p_expected_revision integer default 0)
returns integer language plpgsql security definer set search_path = public as $$
declare v_task public.tasks%rowtype; v_old public.activity_kpi_logs%rowtype; v_new public.activity_kpi_logs%rowtype;
begin
  select * into v_task from public.tasks where id = p_task for update;
  if v_task.id is null or v_task.owner_id <> auth.uid() then raise exception 'Activity not found or read-only'; end if;
  if not exists(select 1 from public.activity_kpis where task_id = p_task) then raise exception 'Set a KPI target first'; end if;
  if p_value is null or p_value < 0 or p_value > 100000000 then raise exception 'Enter a valid measurement'; end if;
  if p_date > app.local_day() or app.month_start(p_date) <> app.month_start(app.local_day()) or not app.due(p_task, p_date) then raise exception 'Only scheduled days in the current month can be tracked'; end if;
  select * into v_old from public.activity_kpi_logs where task_id = p_task and local_date = p_date for update;
  if coalesce(v_old.revision, 0) <> p_expected_revision then raise exception 'This measurement changed on another device. Refresh and try again.'; end if;
  insert into public.activity_kpi_logs(task_id, owner_id, local_date, value, revision)
    values(p_task, auth.uid(), p_date, p_value, coalesce(v_old.revision, 0) + 1)
    on conflict(task_id, local_date) do update set value = excluded.value, revision = excluded.revision, updated_at = now()
    returning * into v_new;
  perform app.audit_change(auth.uid(), 'activity_kpi_logs', p_task::text || ':' || p_date::text,
    case when v_old.task_id is null then null else to_jsonb(v_old) end, to_jsonb(v_new));
  return v_new.revision;
end $$;

revoke execute on function public.save_activity_kpi(uuid,numeric,text,integer), public.remove_activity_kpi(uuid,integer), public.save_activity_kpi_log(uuid,date,numeric,integer) from public, anon;
grant execute on function public.save_activity_kpi(uuid,numeric,text,integer), public.remove_activity_kpi(uuid,integer), public.save_activity_kpi_log(uuid,date,numeric,integer) to authenticated;
