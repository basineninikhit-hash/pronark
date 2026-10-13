-- Presentation choices do not change due days, rewards, or monthly locks.
create table public.checklist_presentation (
  owner_id uuid primary key references public.profiles(user_id),
  ordered_ids uuid[] not null default '{}',
  grouped boolean not null default false,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.task_periods (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  owner_id uuid not null references public.profiles(user_id),
  period text not null check (period in ('morning','afternoon','evening','anytime')),
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.checklist_presentation enable row level security;
alter table public.task_periods enable row level security;
create policy read_checklist_presentation on public.checklist_presentation for select to authenticated using (app.same_group(auth.uid(),owner_id));
create policy read_task_periods on public.task_periods for select to authenticated using (app.same_group(auth.uid(),owner_id));
grant select on public.checklist_presentation,public.task_periods to authenticated;

create function public.save_checklist_presentation(p_ordered_ids uuid[], p_grouped boolean, p_expected_revision integer default 0)
returns integer language plpgsql security definer set search_path=public as $$
declare v_old public.checklist_presentation%rowtype; v_new public.checklist_presentation%rowtype; v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_ordered_ids is null or p_grouped is null or cardinality(p_ordered_ids)>200 then raise exception 'Invalid checklist'; end if;
  select count(distinct id) into v_count from public.tasks where id=any(p_ordered_ids) and owner_id=auth.uid();
  if v_count<>cardinality(p_ordered_ids) then raise exception 'Checklist contains a duplicate or another person''s activity'; end if;
  select * into v_old from public.checklist_presentation where owner_id=auth.uid() for update;
  if coalesce(v_old.revision,0)<>p_expected_revision then raise exception 'Checklist changed on another device'; end if;
  insert into public.checklist_presentation(owner_id,ordered_ids,grouped,revision)
    values(auth.uid(),p_ordered_ids,p_grouped,p_expected_revision+1)
    on conflict(owner_id) do update set ordered_ids=excluded.ordered_ids,grouped=excluded.grouped,revision=excluded.revision,updated_at=now()
    returning * into v_new;
  perform app.audit_change(auth.uid(),'checklist_presentation',auth.uid()::text,
    case when v_old.owner_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
  return v_new.revision;
end $$;

create function public.save_task_period(p_task uuid,p_period text,p_expected_revision integer default 0)
returns integer language plpgsql security definer set search_path=public as $$
declare v_old public.task_periods%rowtype; v_new public.task_periods%rowtype;
begin
  if not exists(select 1 from public.tasks where id=p_task and owner_id=auth.uid()) then raise exception 'Activity not found or read-only'; end if;
  if p_period not in ('morning','afternoon','evening','anytime') then raise exception 'Invalid time of day'; end if;
  select * into v_old from public.task_periods where task_id=p_task for update;
  if coalesce(v_old.revision,0)<>p_expected_revision then raise exception 'Time of day changed on another device'; end if;
  insert into public.task_periods(task_id,owner_id,period,revision)
    values(p_task,auth.uid(),p_period,p_expected_revision+1)
    on conflict(task_id) do update set period=excluded.period,revision=excluded.revision,updated_at=now()
    returning * into v_new;
  perform app.audit_change(auth.uid(),'task_periods',p_task::text,
    case when v_old.task_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
  return v_new.revision;
end $$;
revoke execute on function public.save_checklist_presentation(uuid[],boolean,integer), public.save_task_period(uuid,text,integer) from public,anon;
grant execute on function public.save_checklist_presentation(uuid[],boolean,integer), public.save_task_period(uuid,text,integer) to authenticated;
