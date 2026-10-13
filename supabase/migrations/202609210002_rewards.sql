create function public.finish_setup(p_name text,p_step_goal integer,p_water_quantity numeric,p_water_unit text,p_tasks jsonb) returns void language plpgsql security definer set search_path=public as $$
declare v_day date:=app.local_day(); v_month date:=app.month_start(app.local_day()); v_item jsonb; v_task tasks%rowtype; v_weekdays integer[]; v_cents integer;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if not exists(select 1 from memberships where user_id=auth.uid()) then raise exception 'Join a group first'; end if;
 if p_step_goal not in (10000,15000) or p_water_quantity<=0 or length(trim(p_water_unit)) not between 1 and 30 then raise exception 'Invalid monthly goals'; end if;
 if jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks)<>8 then raise exception 'Setup needs eight activities'; end if;
 perform 1 from profiles where user_id=auth.uid() for update;
 if (select setup_completed_at from profiles where user_id=auth.uid()) is not null then raise exception 'Setup was already completed'; end if;
 update profiles set display_name=left(trim(p_name),100),step_goal=p_step_goal,water_quantity=p_water_quantity,water_unit=trim(p_water_unit),setup_completed_at=now(),revision=revision+1 where user_id=auth.uid();
 perform app.audit_change(auth.uid(),'profiles',auth.uid()::text,null,(select to_jsonb(p) from profiles p where user_id=auth.uid()));
 for v_item in select value from jsonb_array_elements(p_tasks) loop
   select array_agg(x::integer) into v_weekdays from jsonb_array_elements_text(v_item->'weekdays') x;
   v_cents:=(v_item->>'reward_cents')::integer;
   if length(trim(v_item->>'title'))<1 or v_cents<0 or array_length(v_weekdays,1) not between 1 and 7 or not v_weekdays <@ array[1,2,3,4,5,6,7] then raise exception 'Invalid activity'; end if;
   insert into tasks(owner_id,title,description,start_date) values(auth.uid(),trim(v_item->>'title'),coalesce(v_item->>'description',''),v_day) returning * into v_task;
   insert into task_month_settings(task_id,month,reward_cents,weekdays,step_goal,water_quantity,water_unit) values(v_task.id,v_month,v_cents,v_weekdays,p_step_goal,p_water_quantity,p_water_unit);
   insert into task_schedule_versions(task_id,month,weekdays,revision) values(v_task.id,v_month,v_weekdays,1);
   perform app.audit_change(auth.uid(),'tasks',v_task.id::text,null,to_jsonb(v_task));
   perform app.audit_change(auth.uid(),'task_month_settings',v_task.id::text||':'||v_month::text,null,jsonb_build_object('task_id',v_task.id,'month',v_month,'reward_cents',v_cents,'weekdays',v_weekdays,'step_goal',p_step_goal,'water_quantity',p_water_quantity,'water_unit',p_water_unit,'revision',1));
 end loop;
end $$;

create function public.rebuild_task_month(p_task uuid,p_month date) returns void language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_day date; v_end date; v_today date:=app.local_day(); v_anchor date; v_run_base integer:=0; v_bonus14 integer:=0; v_cents integer; v_due boolean; v_done boolean; v_elapsed integer; v_id text; v_ids text[]:=array[]::text[]; v_old earnings%rowtype;
begin
 select owner_id into v_owner from tasks where id=p_task for update;
 if v_owner is null then raise exception 'Task not found'; end if;
 if auth.uid() is not null and auth.uid()<>v_owner then raise exception 'Read-only'; end if;
 if p_month<>app.month_start(p_month) then raise exception 'Invalid month'; end if;
 v_end:=least((p_month+interval '1 month - 1 day')::date,v_today);
 for v_day in select generate_series(p_month,v_end,'1 day'::interval)::date loop
   v_due:=app.due(p_task,v_day);
   select coalesce(completed,false) into v_done from completions where task_id=p_task and local_date=v_day;
   v_done:=coalesce(v_done,false);
   if v_due and not v_done and v_day<v_today then v_anchor:=null; v_run_base:=0; v_bonus14:=0; end if;
   if v_due and v_done then
     if v_anchor is null then v_anchor:=v_day; v_run_base:=0; v_bonus14:=0; end if;
     v_cents:=(app.setting(p_task,v_day)).reward_cents;
     v_run_base:=v_run_base+v_cents;
     v_id:=p_task::text||':'||v_day::text||':base';
     v_ids:=array_append(v_ids,v_id);
     insert into earnings(id,owner_id,task_id,earned_date,kind,cents,active) values(v_id,v_owner,p_task,v_day,'base',v_cents,true)
       on conflict(id) do update set cents=excluded.cents,active=true,revision=earnings.revision+1 where earnings.cents is distinct from excluded.cents or not earnings.active;
   end if;
   if v_anchor is not null then
     v_elapsed:=v_day-v_anchor+1;
     if v_elapsed in (14,28) and (not v_due or v_done) then
       if v_elapsed=14 then v_cents:=(v_run_base*20+50)/100; v_bonus14:=v_cents; else v_cents:=(v_run_base*40+50)/100-v_bonus14; end if;
       v_id:=p_task::text||':'||v_anchor::text||':bonus'||v_elapsed::text;
       v_ids:=array_append(v_ids,v_id);
       insert into earnings(id,owner_id,task_id,earned_date,kind,cents,active) values(v_id,v_owner,p_task,v_day,'bonus'||v_elapsed,v_cents,true)
         on conflict(id) do update set earned_date=excluded.earned_date,cents=excluded.cents,active=true,revision=earnings.revision+1 where earnings.earned_date is distinct from excluded.earned_date or earnings.cents is distinct from excluded.cents or not earnings.active;
     end if;
   end if;
 end loop;
 update earnings set active=false,revision=revision+1 where task_id=p_task and earned_date>=p_month and earned_date<=v_end and active and not (id=any(v_ids));
 for v_old in select * from earnings where task_id=p_task and earned_date>=p_month and earned_date<=v_end loop
   if not exists(select 1 from sheet_jobs where entity='earnings' and record_id=v_old.id and revision=v_old.revision) then
     perform app.audit_change(v_owner,'earnings',v_old.id,null,to_jsonb(v_old));
   end if;
 end loop;
end $$;

create function public.reconcile_month(p_owner uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_task uuid;
begin
 if p_owner<>auth.uid() then raise exception 'Read-only'; end if;
 for v_task in select id from tasks where owner_id=p_owner and start_date<=app.local_day() and (archive_date is null or archive_date>app.month_start(app.local_day())) loop
   perform public.rebuild_task_month(v_task,app.month_start(app.local_day()));
 end loop;
end $$;

create function public.archive_task(p_task uuid,p_expected_revision integer) returns void language plpgsql security definer set search_path=public as $$
declare v_task tasks%rowtype;
begin
 select * into v_task from tasks where id=p_task for update;
 if v_task.owner_id<>auth.uid() or v_task.revision<>p_expected_revision then raise exception 'Task changed or read-only'; end if;
 update tasks set archive_date=app.local_day()+1,revision=revision+1 where id=p_task;
 perform app.audit_change(auth.uid(),'tasks',p_task::text,to_jsonb(v_task),(select to_jsonb(t) from tasks t where id=p_task));
end $$;

create function public.create_task(p_id uuid,p_title text,p_description text,p_reward_cents integer,p_weekdays integer[]) returns uuid language plpgsql security definer set search_path=public as $$
declare v_task tasks%rowtype; v_day date:=app.local_day(); v_month date:=app.month_start(app.local_day());
begin
 if auth.uid() is null or not exists(select 1 from profiles where user_id=auth.uid() and setup_completed_at is not null) then raise exception 'Finish setup first'; end if;
 if p_id is null or length(trim(p_title)) not between 1 and 200 or length(p_description)>10000 or p_reward_cents is null or p_reward_cents<0 or array_length(p_weekdays,1) not between 1 and 7 or not p_weekdays <@ array[1,2,3,4,5,6,7] then raise exception 'Invalid activity'; end if;
 select * into v_task from tasks where id=p_id for update;
 if v_task.id is not null then
   if v_task.owner_id<>auth.uid() then raise exception 'Activity ID is unavailable'; end if;
   return v_task.id;
 end if;
 insert into tasks(id,owner_id,title,description,start_date) values(p_id,auth.uid(),trim(p_title),p_description,v_day) returning * into v_task;
 insert into task_month_settings(task_id,month,reward_cents,weekdays,step_goal,water_quantity,water_unit) values(p_id,v_month,p_reward_cents,p_weekdays,(select step_goal from profiles where user_id=auth.uid()),(select water_quantity from profiles where user_id=auth.uid()),(select water_unit from profiles where user_id=auth.uid()));
 insert into task_schedule_versions(task_id,month,weekdays,revision) values(p_id,v_month,p_weekdays,1);
 perform app.audit_change(auth.uid(),'tasks',p_id::text,null,to_jsonb(v_task));
 perform app.audit_change(auth.uid(),'task_month_settings',p_id::text||':'||v_month::text,null,jsonb_build_object('task_id',p_id,'month',v_month,'reward_cents',p_reward_cents,'weekdays',p_weekdays,'revision',1));
 return p_id;
end $$;

create function public.save_month_goals(p_step_goal integer,p_water_quantity numeric,p_water_unit text) returns void language plpgsql security definer set search_path=public as $$
declare v_month date:=app.month_start(app.local_day()); v_task tasks%rowtype; v_current task_month_settings%rowtype; v_setting task_month_settings%rowtype;
begin
 if auth.uid() is null or extract(day from app.local_day())<>1 then raise exception 'Monthly goals reopen on the first calendar day'; end if;
 if p_step_goal not in (10000,15000) or p_water_quantity<=0 or length(trim(p_water_unit)) not between 1 and 30 then raise exception 'Invalid monthly goals'; end if;
 perform 1 from profiles where user_id=auth.uid() and setup_completed_at is not null for update;
 if not found then raise exception 'Finish setup first'; end if;
 update profiles set step_goal=p_step_goal,water_quantity=p_water_quantity,water_unit=trim(p_water_unit),revision=revision+1 where user_id=auth.uid();
 perform app.audit_change(auth.uid(),'profiles',auth.uid()::text,null,(select to_jsonb(p) from profiles p where user_id=auth.uid()));
 for v_task in select * from tasks where owner_id=auth.uid() and (archive_date is null or archive_date>v_month) loop
   select * into v_current from task_month_settings where task_id=v_task.id and month=v_month for update;
   if v_current.task_id is null then
     select * into v_setting from app.setting(v_task.id,v_month);
     insert into task_month_settings(task_id,month,reward_cents,weekdays,step_goal,water_quantity,water_unit) values(v_task.id,v_month,v_setting.reward_cents,v_setting.weekdays,p_step_goal,p_water_quantity,trim(p_water_unit));
   else
     update task_month_settings set step_goal=p_step_goal,water_quantity=p_water_quantity,water_unit=trim(p_water_unit),revision=revision+1 where task_id=v_task.id and month=v_month;
   end if;
   perform app.audit_change(auth.uid(),'task_month_settings',v_task.id::text||':'||v_month::text,null,(select to_jsonb(s) from task_month_settings s where task_id=v_task.id and month=v_month));
 end loop;
end $$;

grant execute on function public.finish_setup(text,integer,numeric,text,jsonb),public.rebuild_task_month(uuid,date),public.reconcile_month(uuid),public.archive_task(uuid,integer),public.create_task(uuid,text,text,integer,integer[]),public.save_month_goals(integer,numeric,text) to authenticated;
