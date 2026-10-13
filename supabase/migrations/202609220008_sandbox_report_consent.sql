-- Sandbox-only address verification: a confirmed Google/Supabase login may
-- opt in only to its own signed-in email and the fixed Resend test recipient.
-- Other addresses stay pending until a separate email-code flow is deployed.
create or replace function public.save_report_preference(p_email text,p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
declare chosen text:=lower(trim(p_email)); confirmed boolean;
begin
  if auth.uid() is null or chosen is null or chosen !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;
  select lower(u.email)=chosen and u.email_confirmed_at is not null
    into confirmed from auth.users u where u.id=auth.uid();
  confirmed:=coalesce(confirmed,false) and chosen='basineni.nikhit@gmail.com';
  insert into report_preferences(owner_id,pending_email,verified_email,enabled,verification_state)
  values(auth.uid(),case when confirmed then null else chosen end,
         case when confirmed then chosen else null end,
         confirmed and coalesce(p_enabled,false),case when confirmed then 'verified' else 'pending' end)
  on conflict(owner_id) do update set
    pending_email=excluded.pending_email,verified_email=excluded.verified_email,
    enabled=excluded.enabled,verification_state=excluded.verification_state,
    revision=report_preferences.revision+1,updated_at=now();
  perform app.audit_change(auth.uid(),'report_preferences',auth.uid()::text,null,
    (select to_jsonb(p) from report_preferences p where owner_id=auth.uid()));
end $$;

create function public.set_weekly_report_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or p_enabled is null then raise exception 'Sign in and choose an email setting'; end if;
  update report_preferences set enabled=p_enabled,revision=revision+1,updated_at=now()
   where owner_id=auth.uid() and (not p_enabled or
     (verification_state='verified' and verified_email='basineni.nikhit@gmail.com'));
  if not found then raise exception 'Verify your sandbox email address first'; end if;
  perform app.audit_change(auth.uid(),'report_preferences',auth.uid()::text,null,
    (select to_jsonb(p) from report_preferences p where owner_id=auth.uid()));
end $$;
revoke execute on function public.set_weekly_report_enabled(boolean) from public,anon;
grant execute on function public.set_weekly_report_enabled(boolean) to authenticated;
