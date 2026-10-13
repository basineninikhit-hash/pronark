-- Apply after 006 before enabling the weekly worker. No mail is sent by this migration.
alter table report_delivery_jobs add column created_at timestamptz not null default now();
alter table report_delivery_jobs add column next_attempt_at timestamptz not null default now();
alter table report_delivery_jobs add column lease_until timestamptz;
alter table report_delivery_jobs add column recipient_email text;

create function public.claim_report_delivery(p_id uuid) returns report_delivery_jobs
language plpgsql security definer set search_path=public as $$
declare claimed report_delivery_jobs;
begin
  update report_delivery_jobs
     set state='leased', attempts=attempts+1, lease_until=now()+interval '5 minutes'
   where id=p_id and attempts<5 and created_at>now()-interval '23 hours'
     and ((state in ('pending','failed') and next_attempt_at<=now())
       or (state='leased' and lease_until<now()))
   returning * into claimed;
  return claimed;
end $$;
revoke execute on function public.claim_report_delivery(uuid) from public,anon,authenticated;
grant execute on function public.claim_report_delivery(uuid) to service_role;
