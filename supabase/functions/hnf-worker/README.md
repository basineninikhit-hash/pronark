# HNF scheduled worker

The Edge Function is deployed in project `gjflzvlmildwjgfosfxk`. The Sheets
mirror runs every five minutes via Supabase Cron job `hnf-sheet-mirror`, with
its trigger token read from Supabase Vault secret `hnf_worker_token`. The same
token is stored locally in macOS Keychain under service `hnf-worker-token`
and account `hnf-app`. `ENABLE_SHEET_MIRROR=1` is set; delivery is still off.
The mirror processes up to 25 queued changes per invocation, updating stable
rows in the app-managed `HNF Records` tab. SQL remains authoritative. Inspect
`cron.job_run_details`, `net._http_response`, `sheet_jobs`, and `sheet_status`
when diagnosing failures. The mirror is not a tested backup/restore system.

The optional `goal-targets` job is implemented locally but **not deployed or
scheduled**. Apply `202610080017_goal_target_growth.sql` only after review, then
deploy the worker, set `ENABLE_GOAL_TARGET_GROWTH=1`, and configure a protected
daily POST to `hnf-worker?job=goal-targets` with the worker token. A daily run
after midnight Eastern will apply any due 1st/15th general-target increases,
including missed runs, exactly once per category/date. It never credits the
wallet or assigns earned dollars. Confirm the first live run and Sheets mirror
rows before treating this automation as released.

The opt-in push worker is enabled through `ENABLE_PUSH_DELIVERY=1` and Cron job
`hnf-push-delivery`. Cron checks every 15 minutes but calls the worker only in
the 6 AM and 6 PM America/New_York hours; the worker applies the same window
check, rechecks preferences and evening completions, and records delivery jobs.
One closed-app iPhone test notification was confirmed by the owner. The
one-time `ENABLE_PUSH_TEST` flag is unset. Turning off the push schedule requires
unsetting `ENABLE_PUSH_DELIVERY` and unscheduling `hnf-push-delivery`.

The weekly-report path is implemented but not scheduled. Migrations 007 and
008 and the required server-side secrets are present. Keep secrets out of
`VITE_` variables. Set `ENABLE_REPORT_DELIVERY=1` only after review.

A reviewed cron should POST to `hnf-worker?job=weekly` with
`X-HNF-Worker-Token` every few minutes from Monday 6 AM through Tuesday
5:59 AM Eastern so late jobs can retry. The worker checks Eastern time including
daylight saving. It builds one persisted snapshot per owner/week, creates one
delivery job, takes an atomic lease, rechecks opt-out, then sends through Resend
with a stable idempotency key. Retries are limited to five attempts within
23 hours. The sandbox sender is `onboarding@resend.dev` and only the verified
test recipient `basineni.nikhit@gmail.com` is permitted. Other recipients are
skipped, not sent. Resend acceptance is not proof of delivery or reading.

The sandbox address can be verified only when it exactly matches the signed-in
user's confirmed Supabase email. A different address stays pending and cannot
receive reports; a general email-code verification flow and delivery webhook
reconciliation are not yet complete. A local
mock verifies one send and duplicate suppression; it does not prove a weekly
cron. The default worker path only reports pending Sheets jobs. Scheduled push
timing and retry behavior still need live observation across their first runs.
