-- "Do later" in the routine runner: move the current step of an active run to a
-- "Saved for later" group at the end of that run. Only the run's own snapshot
-- changes; the routine definition and other runs are untouched.

create function public.defer_routine_step(p_run uuid, p_step uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_run public.routine_runs%rowtype; v_next uuid; v_left integer; v_step jsonb; v_rest jsonb; v_n integer;
begin
  select * into v_run from public.routine_runs where id = p_run and owner_id = auth.uid() for update;
  if v_run.id is null then raise exception 'Routine run not found'; end if;
  if v_run.state <> 'active' then raise exception 'This run is no longer active'; end if;
  select id into v_next from unnest(app.routine_step_ids(v_run.snapshot)) with ordinality as t(id, n)
    where id not in (select step_id from public.routine_step_results where run_id = p_run) order by n limit 1;
  if v_next is distinct from p_step then raise exception 'That is not the current step'; end if;
  select count(*) into v_left from unnest(app.routine_step_ids(v_run.snapshot)) as t(id)
    where id not in (select step_id from public.routine_step_results where run_id = p_run);
  if v_left < 2 then raise exception 'This is the last step left'; end if;

  select step into v_step from jsonb_array_elements(v_run.snapshot) c(cat), jsonb_array_elements(c.cat->'steps') s(step) where (step->>'id')::uuid = p_step;
  -- Take the step out of its group and drop any group left empty.
  select coalesce(jsonb_agg(x.cat order by x.ci), '[]'::jsonb) into v_rest from (
    select c.ci, jsonb_set(c.cat, '{steps}', coalesce((select jsonb_agg(s.step order by s.si) from jsonb_array_elements(c.cat->'steps') with ordinality as s(step, si)
      where s.step->>'id' <> p_step::text), '[]'::jsonb)) as cat
    from jsonb_array_elements(v_run.snapshot) with ordinality as c(cat, ci)) x
  where jsonb_array_length(x.cat->'steps') > 0;
  -- Append it to the "Saved for later" group, which is always last.
  v_n := jsonb_array_length(v_rest);
  if v_n > 0 and coalesce((v_rest->(v_n - 1)->>'later')::boolean, false) then
    v_rest := jsonb_set(v_rest, array[(v_n - 1)::text, 'steps'], (v_rest->(v_n - 1)->'steps') || jsonb_build_array(v_step));
  else
    v_rest := v_rest || jsonb_build_array(jsonb_build_object('id', p_run, 'title', 'Saved for later', 'later', true, 'steps', jsonb_build_array(v_step)));
  end if;
  -- The time spent on it so far is dropped; it starts fresh when it comes back around.
  update public.routine_runs set snapshot = v_rest, step_started_at = now(), paused_at = null, step_paused_ms = 0 where id = p_run;
end $$;

revoke execute on function public.defer_routine_step(uuid,uuid) from public, anon;
grant execute on function public.defer_routine_step(uuid,uuid) to authenticated;
