-- The 1st/15th plan raises only the general category target. It never creates
-- earnings, changes the wallet, or assigns earned dollars.
create table public.category_target_plans (
  category_id uuid primary key references public.categories(id) on delete cascade,
  owner_id uuid not null references public.profiles(user_id),
  increment_cents integer not null check (increment_cents > 0 and increment_cents <= 100000000),
  starts_on date not null,
  enabled boolean not null default true,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.category_target_increments (
  category_id uuid not null references public.categories(id) on delete cascade,
  owner_id uuid not null references public.profiles(user_id),
  scheduled_date date not null,
  increment_cents integer not null,
  previous_target_cents integer not null,
  new_target_cents integer not null,
  applied_at timestamptz not null default now(),
  primary key(category_id,scheduled_date)
);
alter table public.category_target_plans enable row level security;
alter table public.category_target_increments enable row level security;
create policy read_category_target_plans on public.category_target_plans for select to authenticated using (owner_id=auth.uid());
create policy read_category_target_increments on public.category_target_increments for select to authenticated using (owner_id=auth.uid());
grant select on public.category_target_plans,public.category_target_increments to authenticated;

create function public.save_category_target_plan(p_category uuid,p_increment_cents integer,p_starts_on date,p_enabled boolean,p_expected_revision integer default 0)
returns integer language plpgsql security definer set search_path=public as $$
declare v_category public.categories%rowtype; v_old public.category_target_plans%rowtype; v_new public.category_target_plans%rowtype;
begin
  select * into v_category from public.categories where id=p_category;
  if v_category.id is null or v_category.owner_id<>auth.uid() then raise exception 'Category not found or read-only'; end if;
  if p_increment_cents is null or p_increment_cents<=0 or p_increment_cents>100000000 or p_starts_on is null or p_enabled is null then raise exception 'Invalid target growth plan'; end if;
  select * into v_old from public.category_target_plans where category_id=p_category for update;
  if coalesce(v_old.revision,0)<>p_expected_revision then raise exception 'Plan changed on another device'; end if;
  if p_starts_on<app.local_day() and (v_old.category_id is null or p_starts_on<>v_old.starts_on) then raise exception 'New plans must start today or later'; end if;
  insert into public.category_target_plans(category_id,owner_id,increment_cents,starts_on,enabled,revision)
    values(p_category,auth.uid(),p_increment_cents,p_starts_on,p_enabled,p_expected_revision+1)
    on conflict(category_id) do update set increment_cents=excluded.increment_cents,starts_on=excluded.starts_on,enabled=excluded.enabled,revision=excluded.revision,updated_at=now()
      where public.category_target_plans.owner_id=auth.uid()
    returning * into v_new;
  if v_new.category_id is null then raise exception 'Plan not found or read-only'; end if;
  perform app.audit_change(auth.uid(),'category_target_plans',p_category::text,case when v_old.category_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
  return v_new.revision;
end $$;

create function public.apply_category_target_plans(p_through_date date default null)
returns integer language plpgsql security definer set search_path=public as $$
declare v_today date:=coalesce(p_through_date,app.local_day()); v_plan public.category_target_plans%rowtype; v_date date; v_old public.categories%rowtype; v_new public.categories%rowtype; v_count integer:=0;
begin
  if v_today>app.local_day() then raise exception 'Cannot apply future target increases'; end if;
  for v_plan in select * from public.category_target_plans where enabled order by category_id loop
    for v_date in select x::date from (
      select gs as x from generate_series(date_trunc('month',v_plan.starts_on::timestamp),date_trunc('month',v_today::timestamp),interval '1 month') gs
      union all
      select gs+interval '14 days' from generate_series(date_trunc('month',v_plan.starts_on::timestamp),date_trunc('month',v_today::timestamp),interval '1 month') gs
    ) dates where x::date>=v_plan.starts_on and x::date<=v_today order by x loop
      select * into v_old from public.categories where id=v_plan.category_id for update;
      if not exists(select 1 from public.category_target_increments where category_id=v_plan.category_id and scheduled_date=v_date) then
        if v_old.id is null or v_old.general_target_cents>100000000-v_plan.increment_cents then raise exception 'Target growth exceeds the maximum'; end if;
        update public.categories set general_target_cents=general_target_cents+v_plan.increment_cents,revision=revision+1 where id=v_plan.category_id returning * into v_new;
        insert into public.category_target_increments(category_id,owner_id,scheduled_date,increment_cents,previous_target_cents,new_target_cents)
          values(v_plan.category_id,v_plan.owner_id,v_date,v_plan.increment_cents,v_old.general_target_cents,v_new.general_target_cents);
        insert into public.audit_events(actor_id,owner_id,entity,entity_id,before_value,after_value)
          values(v_plan.owner_id,v_plan.owner_id,'categories',v_plan.category_id::text,to_jsonb(v_old),to_jsonb(v_new)||jsonb_build_object('source','scheduled_target_growth','scheduled_date',v_date));
        insert into public.sheet_jobs(entity,record_id,revision) values('categories',v_plan.category_id::text,v_new.revision) on conflict do nothing;
        v_count:=v_count+1;
      end if;
    end loop;
  end loop;
  return v_count;
end $$;
revoke execute on function public.save_category_target_plan(uuid,integer,date,boolean,integer), public.apply_category_target_plans(date) from public,anon,authenticated;
grant execute on function public.save_category_target_plan(uuid,integer,date,boolean,integer) to authenticated;
grant execute on function public.apply_category_target_plans(date) to service_role;
