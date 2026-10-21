-- Customizable companion character: each member's color, hat and outfit, synced across devices.
-- Stored on experience_preferences next to the existing companion settings.
alter table public.experience_preferences
  add column character_style jsonb not null default '{"color":"cream","hat":"none","outfit":"none"}'::jsonb;

alter table public.experience_preferences add constraint experience_character_style_valid check (
  jsonb_typeof(character_style) = 'object'
  and character_style - 'color' - 'hat' - 'outfit' = '{}'::jsonb
  and character_style->>'color' in ('cream','mint','lavender','peach','sky')
  and character_style->>'hat' in ('none','cap','beanie','crown')
  and character_style->>'outfit' in ('none','hoodie','overalls','cape')
);

-- Saves the look with the same revision check as the other companion preferences. A member who
-- has no preferences row yet gets one with default chatter/motion settings.
create function public.save_character_style(p_style jsonb, p_expected_revision integer default 0)
returns integer language plpgsql security definer set search_path=public as $$
declare v_old public.experience_preferences%rowtype; v_new public.experience_preferences%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_style is null or jsonb_typeof(p_style) <> 'object' then raise exception 'Invalid companion look'; end if;
  insert into public.profiles(user_id) values(auth.uid()) on conflict do nothing;
  select * into v_old from public.experience_preferences where owner_id = auth.uid() for update;
  if coalesce(v_old.revision, 0) <> p_expected_revision then raise exception 'Preferences changed on another device'; end if;
  insert into public.experience_preferences(owner_id, character_style, revision)
    values(auth.uid(), jsonb_build_object('color', p_style->>'color', 'hat', p_style->>'hat', 'outfit', p_style->>'outfit'), p_expected_revision + 1)
    on conflict(owner_id) do update set character_style = excluded.character_style, revision = excluded.revision, updated_at = now()
    returning * into v_new;
  perform app.audit_change(auth.uid(), 'experience_preferences', auth.uid()::text,
    case when v_old.owner_id is null then null else to_jsonb(v_old) end, to_jsonb(v_new));
  return v_new.revision;
end $$;

revoke execute on function public.save_character_style(jsonb, integer) from public, anon;
grant execute on function public.save_character_style(jsonb, integer) to authenticated;
