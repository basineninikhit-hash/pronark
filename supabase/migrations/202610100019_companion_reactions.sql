-- Explicit categories avoid guessing a person's activity from its title.
alter table public.tasks add column reaction_category text not null default 'other'
  check (reaction_category in ('strength','movement','water','reading','morning','other'));

create function public.save_task_reaction_category(p_task uuid,p_category text,p_expected_revision integer)
returns integer language plpgsql security definer set search_path=public as $$
declare v_old public.tasks%rowtype; v_new public.tasks%rowtype;
begin
  if p_category not in ('strength','movement','water','reading','morning','other') then raise exception 'Invalid reaction category'; end if;
  select * into v_old from public.tasks where id=p_task for update;
  if v_old.id is null or v_old.owner_id<>auth.uid() then raise exception 'Activity not found or read-only'; end if;
  if v_old.revision<>p_expected_revision then raise exception 'Activity changed on another device'; end if;
  update public.tasks set reaction_category=p_category,revision=revision+1 where id=p_task returning * into v_new;
  perform app.audit_change(auth.uid(),'tasks',p_task::text,to_jsonb(v_old),to_jsonb(v_new));
  return v_new.revision;
end $$;
revoke execute on function public.save_task_reaction_category(uuid,text,integer) from public,anon;
grant execute on function public.save_task_reaction_category(uuid,text,integer) to authenticated;
