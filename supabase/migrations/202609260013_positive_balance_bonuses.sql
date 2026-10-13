-- Visible activity streaks remain unchanged. Only bonus-eligible calendar days pause
-- while the owner's historical in-app wallet is zero or negative.
create function app.wallet_for_bonus(p_owner uuid,p_day date,p_task uuid,p_month date)
returns integer language sql stable security definer set search_path=public as $$
 select coalesce((select sum(e.cents) from public.earnings e
   where e.owner_id=p_owner and e.active and e.earned_date<=p_day
   and not (e.task_id=p_task and e.kind<>'base' and e.earned_date>=p_month)),0)
  -coalesce((select sum(p.amount_cents) from public.purchases p
   where p.owner_id=p_owner and p.deleted_at is null and p.purchase_date<=p_day),0)
$$;

create or replace function public.rebuild_task_month(p_task uuid,p_month date)
returns void language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_day date; v_end date; v_today date:=app.local_day(); v_anchor date;
 v_bonus_days integer:=0; v_bonus_base integer:=0; v_bonus14 integer:=0; v_awarded integer:=0;
 v_cents integer; v_daily_base integer; v_due boolean; v_done boolean; v_positive boolean;
 v_id text; v_ids text[]:=array[]::text[]; v_old public.earnings%rowtype;
begin
 select owner_id into v_owner from public.tasks where id=p_task for update;
 if v_owner is null then raise exception 'Task not found'; end if;
 if auth.uid() is not null and auth.uid()<>v_owner then raise exception 'Read-only'; end if;
 if p_month<>app.month_start(p_month) then raise exception 'Invalid month'; end if;
 v_end:=least((p_month+interval '1 month - 1 day')::date,v_today);
 -- A removed checkoff must not keep stale base money in the eligibility ledger.
 update public.earnings e set active=false,revision=e.revision+1
 where e.task_id=p_task and e.kind='base' and e.earned_date between p_month and v_end and e.active
 and not exists(select 1 from public.completions c where c.task_id=p_task and c.local_date=e.earned_date and c.completed);
 for v_day in select generate_series(p_month,v_end,'1 day'::interval)::date loop
   v_due:=app.due(p_task,v_day);
   select coalesce(completed,false) into v_done from public.completions where task_id=p_task and local_date=v_day;
   v_done:=coalesce(v_done,false);
   v_daily_base:=0;
   if v_due and not v_done and v_day<v_today then
     v_anchor:=null; v_bonus_days:=0; v_bonus_base:=0; v_bonus14:=0;
   end if;
   if v_due and v_done then
     if v_anchor is null then v_anchor:=v_day; v_bonus_days:=0; v_bonus_base:=0; v_bonus14:=0; end if;
     v_daily_base:=(app.setting(p_task,v_day)).reward_cents;
     v_id:=p_task::text||':'||v_day::text||':base';
     v_ids:=array_append(v_ids,v_id);
     insert into public.earnings(id,owner_id,task_id,earned_date,kind,cents,active)
       values(v_id,v_owner,p_task,v_day,'base',v_daily_base,true)
       on conflict(id) do update set cents=excluded.cents,active=true,revision=public.earnings.revision+1
       where public.earnings.cents is distinct from excluded.cents or not public.earnings.active;
   end if;
   if v_anchor is not null and (not v_due or v_done) then
     v_positive:=app.wallet_for_bonus(v_owner,v_day,p_task,p_month)+v_awarded>0;
     if v_positive then
       v_bonus_days:=v_bonus_days+1;
       v_bonus_base:=v_bonus_base+v_daily_base;
       if v_bonus_days in (14,28) then
         if v_bonus_days=14 then
           v_cents:=(v_bonus_base*20+50)/100; v_bonus14:=v_cents;
         else
           v_cents:=(v_bonus_base*40+50)/100-v_bonus14;
         end if;
         v_id:=p_task::text||':'||v_anchor::text||':bonus'||v_bonus_days::text;
         v_ids:=array_append(v_ids,v_id);
         insert into public.earnings(id,owner_id,task_id,earned_date,kind,cents,active)
           values(v_id,v_owner,p_task,v_day,'bonus'||v_bonus_days,v_cents,true)
           on conflict(id) do update set earned_date=excluded.earned_date,cents=excluded.cents,active=true,revision=public.earnings.revision+1
           where public.earnings.earned_date is distinct from excluded.earned_date or public.earnings.cents is distinct from excluded.cents or not public.earnings.active;
         v_awarded:=v_awarded+v_cents;
       end if;
     end if;
   end if;
 end loop;
 update public.earnings set active=false,revision=revision+1
 where task_id=p_task and earned_date between p_month and v_end and active and not (id=any(v_ids));
 for v_old in select * from public.earnings where task_id=p_task and earned_date between p_month and v_end loop
   if not exists(select 1 from public.sheet_jobs where entity='earnings' and record_id=v_old.id and revision=v_old.revision) then
     perform app.audit_change(v_owner,'earnings',v_old.id,null,to_jsonb(v_old));
   end if;
 end loop;
end $$;

-- A purchase (including an edited/backdated purchase) can change bonus eligibility.
-- Reconcile affected months in chronological order; no bonus is paid on paused days.
create or replace function app.reconcile_wallet_change(p_owner uuid,p_from date)
returns void language plpgsql security definer set search_path=public as $$
declare v_month date; v_task uuid; v_first date;
begin
 if p_owner<>auth.uid() then raise exception 'Read-only'; end if;
 select app.month_start(min(start_date)) into v_first from public.tasks where owner_id=p_owner;
 if v_first is null then return; end if;
 for v_month in select generate_series(greatest(app.month_start(p_from),v_first),app.month_start(app.local_day()),'1 month'::interval)::date loop
   for v_task in select id from public.tasks where owner_id=p_owner and start_date<=(v_month+interval '1 month - 1 day')::date and (archive_date is null or archive_date>v_month) order by id loop
     perform public.rebuild_task_month(v_task,v_month);
   end loop;
 end loop;
end $$;

create or replace function public.save_completion(p_task uuid,p_date date,p_completed boolean,p_expected_version integer default 0)
returns integer language plpgsql security definer set search_path=public as $$
declare v_task public.tasks%rowtype; v_old public.completions%rowtype; v_new public.completions%rowtype;
begin
 perform 1 from public.profiles where user_id=auth.uid() for update;
 select * into v_task from public.tasks where id=p_task for update;
 if v_task.id is null or v_task.owner_id<>auth.uid() then raise exception 'Task not found or read-only'; end if;
 if p_date>app.local_day() or app.month_start(p_date)<>app.month_start(app.local_day()) or not app.due(p_task,p_date) then raise exception 'Only due dates in the current month can be corrected'; end if;
 select * into v_old from public.completions where task_id=p_task and local_date=p_date for update;
 if coalesce(v_old.version,0)<>p_expected_version then raise exception 'This day changed on another device. Review the latest version.'; end if;
 if v_old.task_id is null then
   insert into public.completions(task_id,owner_id,local_date,completed) values(p_task,auth.uid(),p_date,p_completed) returning * into v_new;
 else
   update public.completions set completed=p_completed,version=version+1,updated_at=now() where task_id=p_task and local_date=p_date returning * into v_new;
 end if;
 perform app.audit_change(auth.uid(),'completions',p_task::text||':'||p_date::text,case when v_old.task_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
 perform app.reconcile_wallet_change(auth.uid(),app.month_start(p_date));
 return v_new.version;
end $$;

create function app.bonus_progress(p_task uuid)
returns integer language plpgsql stable security definer set search_path=public as $$
declare v_owner uuid; v_month date:=app.month_start(app.local_day()); v_day date; v_due boolean; v_done boolean; v_running boolean:=false; v_days integer:=0; v_existing_bonus integer;
begin
 select owner_id into v_owner from public.tasks where id=p_task;
 if v_owner is null or not app.same_group(auth.uid(),v_owner) then return 0; end if;
 for v_day in select generate_series(v_month,app.local_day(),'1 day'::interval)::date loop
   v_due:=app.due(p_task,v_day);
   select coalesce(completed,false) into v_done from public.completions where task_id=p_task and local_date=v_day;
   v_done:=coalesce(v_done,false);
   if v_due and not v_done and v_day<app.local_day() then v_running:=false; v_days:=0; end if;
   if v_due and v_done then v_running:=true; end if;
   if v_running and (not v_due or v_done) then
     select coalesce(sum(cents),0) into v_existing_bonus from public.earnings
       where task_id=p_task and kind<>'base' and active and earned_date between v_month and v_day;
     if app.wallet_for_bonus(v_owner,v_day,p_task,v_month)+v_existing_bonus>0 then v_days:=v_days+1; end if;
   end if;
 end loop;
 return v_days;
end $$;
create view public.bonus_progress_rows with (security_invoker=true) as
 select t.id task_id,t.owner_id,app.bonus_progress(t.id) eligible_days from public.tasks t;
revoke all on public.bonus_progress_rows from anon,authenticated;
grant select on public.bonus_progress_rows to authenticated;
revoke execute on function app.wallet_for_bonus(uuid,date,uuid,date),app.reconcile_wallet_change(uuid,date),app.keep_funded_item_category() from public,anon,authenticated;

-- Bring already-recorded current-month bonuses into line with the new rule.
do $$
declare v_owner uuid; v_task uuid; v_previous text:=current_setting('request.jwt.claim.sub',true); v_month date:=app.month_start(app.local_day());
begin
 for v_owner in select distinct owner_id from public.tasks loop
   perform set_config('request.jwt.claim.sub',v_owner::text,true);
   for v_task in select id from public.tasks where owner_id=v_owner and start_date<=(v_month+interval '1 month - 1 day')::date and (archive_date is null or archive_date>v_month) order by id loop
     perform public.rebuild_task_month(v_task,v_month);
   end loop;
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(v_previous,''),true);
end $$;
