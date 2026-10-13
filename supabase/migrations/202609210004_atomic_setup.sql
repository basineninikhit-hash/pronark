-- Keep the private membership setup behind the routine form. If any setup
-- field fails validation, the group creation and profile/task writes roll back.
create function public.start_setup(
  p_name text,
  p_step_goal integer,
  p_water_quantity numeric,
  p_water_unit text,
  p_tasks jsonb
) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from memberships where user_id=auth.uid()) then
    perform public.create_group();
  end if;
  perform public.finish_setup(p_name,p_step_goal,p_water_quantity,p_water_unit,p_tasks);
end $$;

revoke execute on function public.start_setup(text,integer,numeric,text,jsonb) from public, anon;
grant execute on function public.start_setup(text,integer,numeric,text,jsonb) to authenticated;
