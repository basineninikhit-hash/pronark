-- Standalone measurements are private health-adjacent data. They are deliberately
-- outside app.audit_change and the Google Sheets outbox until backup is opt-in.
create table public.private_metrics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(user_id),
  name text not null check (length(trim(name)) between 1 and 80),
  unit text not null check (length(trim(unit)) between 1 and 30),
  aggregation text not null check (aggregation in ('sum','average','latest')),
  target numeric(12,3) check (target > 0 and target <= 100000000),
  revision integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.private_metric_logs (
  metric_id uuid not null references public.private_metrics(id) on delete cascade,
  owner_id uuid not null references public.profiles(user_id),
  local_date date not null,
  value numeric(12,3) not null check (value >= 0 and value <= 100000000),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (metric_id, local_date)
);
create table public.private_metric_audit (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(user_id),
  metric_id uuid not null,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);
alter table public.private_metrics enable row level security;
alter table public.private_metric_logs enable row level security;
alter table public.private_metric_audit enable row level security;
create policy own_private_metrics on public.private_metrics for select to authenticated using (owner_id = auth.uid());
create policy own_private_metric_logs on public.private_metric_logs for select to authenticated using (owner_id = auth.uid());
create policy own_private_metric_audit on public.private_metric_audit for select to authenticated using (owner_id = auth.uid());
grant select on public.private_metrics, public.private_metric_logs, public.private_metric_audit to authenticated;

create function public.save_private_metric(p_id uuid, p_name text, p_unit text, p_aggregation text, p_target numeric, p_expected_revision integer default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_old public.private_metrics%rowtype; v_new public.private_metrics%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_id is null or length(trim(coalesce(p_name,''))) not between 1 and 80 or length(trim(coalesce(p_unit,''))) not between 1 and 30 or p_aggregation not in ('sum','average','latest') or (p_target is not null and (p_target <= 0 or p_target > 100000000)) then raise exception 'Invalid measurement definition'; end if;
  select * into v_old from public.private_metrics where id = p_id for update;
  if v_old.id is not null and v_old.owner_id <> auth.uid() then raise exception 'Measurement not found or read-only'; end if;
  if coalesce(v_old.revision,0) <> p_expected_revision then raise exception 'Measurement changed on another device'; end if;
  if v_old.id is not null and v_old.unit<>trim(p_unit) and exists(select 1 from public.private_metric_logs where metric_id=p_id) then raise exception 'Unit cannot change after values are logged; create a new measurement instead'; end if;
  insert into public.private_metrics(id,owner_id,name,unit,aggregation,target,revision)
    values(p_id,auth.uid(),trim(p_name),trim(p_unit),p_aggregation,p_target,p_expected_revision+1)
    on conflict(id) do update set name=excluded.name,unit=excluded.unit,aggregation=excluded.aggregation,target=excluded.target,revision=excluded.revision,updated_at=now()
      where public.private_metrics.owner_id=auth.uid()
    returning * into v_new;
  if v_new.id is null then raise exception 'Measurement not found or read-only'; end if;
  insert into public.private_metric_audit(owner_id,metric_id,action,before_value,after_value)
    values(auth.uid(),p_id,'save_definition',case when v_old.id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
  return p_id;
end $$;

create function public.archive_private_metric(p_id uuid, p_expected_revision integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.private_metrics%rowtype; v_new public.private_metrics%rowtype;
begin
  select * into v_old from public.private_metrics where id=p_id for update;
  if v_old.id is null or v_old.owner_id<>auth.uid() or v_old.archived_at is not null then raise exception 'Measurement not found or read-only'; end if;
  if v_old.revision<>p_expected_revision then raise exception 'Measurement changed on another device'; end if;
  update public.private_metrics set archived_at=now(),revision=revision+1,updated_at=now() where id=p_id returning * into v_new;
  insert into public.private_metric_audit(owner_id,metric_id,action,before_value,after_value) values(auth.uid(),p_id,'archive',to_jsonb(v_old),to_jsonb(v_new));
end $$;

create function public.save_private_metric_log(p_metric uuid, p_date date, p_value numeric, p_expected_revision integer default 0)
returns integer language plpgsql security definer set search_path = public as $$
declare v_metric public.private_metrics%rowtype; v_old public.private_metric_logs%rowtype; v_new public.private_metric_logs%rowtype;
begin
  select * into v_metric from public.private_metrics where id=p_metric;
  if v_metric.id is null or v_metric.owner_id <> auth.uid() or v_metric.archived_at is not null then raise exception 'Measurement not found or read-only'; end if;
  if p_date is null or p_date > app.local_day() or p_value is null or p_value < 0 or p_value > 100000000 then raise exception 'Invalid date or value'; end if;
  select * into v_old from public.private_metric_logs where metric_id=p_metric and local_date=p_date for update;
  if coalesce(v_old.revision,0) <> p_expected_revision then raise exception 'Measurement changed on another device'; end if;
  insert into public.private_metric_logs(metric_id,owner_id,local_date,value,revision)
    values(p_metric,auth.uid(),p_date,p_value,p_expected_revision+1)
    on conflict(metric_id,local_date) do update set value=excluded.value,revision=excluded.revision,updated_at=now()
    returning * into v_new;
  insert into public.private_metric_audit(owner_id,metric_id,action,before_value,after_value)
    values(auth.uid(),p_metric,'save_value',case when v_old.metric_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
  return v_new.revision;
end $$;

create function public.delete_private_metric_log(p_metric uuid, p_date date, p_expected_revision integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.private_metric_logs%rowtype;
begin
  select * into v_old from public.private_metric_logs where metric_id=p_metric and local_date=p_date for update;
  if v_old.metric_id is null or v_old.owner_id<>auth.uid() then raise exception 'Measurement not found or read-only'; end if;
  if v_old.revision<>p_expected_revision then raise exception 'Measurement changed on another device'; end if;
  delete from public.private_metric_logs where metric_id=p_metric and local_date=p_date;
  insert into public.private_metric_audit(owner_id,metric_id,action,before_value,after_value) values(auth.uid(),p_metric,'delete_value',to_jsonb(v_old),null);
end $$;
revoke execute on function public.save_private_metric(uuid,text,text,text,numeric,integer), public.save_private_metric_log(uuid,date,numeric,integer), public.archive_private_metric(uuid,integer), public.delete_private_metric_log(uuid,date,integer) from public, anon;
grant execute on function public.save_private_metric(uuid,text,text,text,numeric,integer), public.save_private_metric_log(uuid,date,numeric,integer), public.archive_private_metric(uuid,integer), public.delete_private_metric_log(uuid,date,integer) to authenticated;
