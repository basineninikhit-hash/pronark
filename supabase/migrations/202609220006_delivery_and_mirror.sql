-- Operational tables for the single Sheets mirror and private device delivery.
-- Endpoint/key JSON is intentionally excluded from sheet_jobs and all CSV exports.
create table push_subscriptions(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles(user_id), endpoint text not null unique, keys_json jsonb not null, user_agent text, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table sheet_records(entity text not null, record_id text not null, revision integer not null, row_key text not null, synced_at timestamptz not null default now(), primary key(entity,record_id));
create table backup_runs(id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('sql_export','sheet_snapshot','restore_test')), state text not null check(state in ('pending','done','failed')), location_hint text, completed_at timestamptz, error text);
create table daily_quotes(day_of_year integer primary key check(day_of_year between 1 and 366), text text not null unique check(length(text) between 10 and 280));
insert into daily_quotes(day_of_year,text)
select n, 'HNF reminder '||n||': one small promise kept today builds tomorrow''s confidence.' from generate_series(1,366) n;

create function public.save_push_subscription(p_endpoint text,p_keys jsonb,p_user_agent text default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or length(p_endpoint)<10 or p_keys is null then raise exception 'Invalid push subscription'; end if;
 insert into push_subscriptions(owner_id,endpoint,keys_json,user_agent) values(auth.uid(),p_endpoint,p_keys,left(p_user_agent,500)) on conflict(endpoint) do update set owner_id=auth.uid(),keys_json=excluded.keys_json,user_agent=excluded.user_agent,active=true,updated_at=now();
end $$;
create function public.disable_push_subscription(p_endpoint text) returns void language plpgsql security definer set search_path=public as $$ begin update push_subscriptions set active=false,updated_at=now() where endpoint=p_endpoint and owner_id=auth.uid(); end $$;
alter table push_subscriptions enable row level security; alter table sheet_records enable row level security; alter table backup_runs enable row level security; alter table daily_quotes enable row level security;
create policy own_push_subscription on push_subscriptions for select to authenticated using(owner_id=auth.uid());
revoke all on push_subscriptions,sheet_records,backup_runs,daily_quotes from anon,authenticated;
revoke execute on function public.save_push_subscription(text,jsonb,text),public.disable_push_subscription(text) from public,anon;
grant execute on function public.save_push_subscription(text,jsonb,text),public.disable_push_subscription(text) to authenticated;
