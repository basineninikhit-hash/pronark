-- Keep a crashed push attempt recoverable without creating duplicate logical jobs.
alter table notification_jobs add column lease_until timestamptz;
alter table notification_jobs add column sent_at timestamptz;
create index notification_jobs_retry_idx on notification_jobs(state, lease_until) where state in ('pending','leased','failed');
