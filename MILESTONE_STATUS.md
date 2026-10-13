# HNF build gates

The [PRD](PRD.md) is authoritative. Do not advance a milestone because code or a screen exists; its acceptance checks must pass together.

## 1. Account, routine and scheduled checkoff foundation — locally verified; live gate open

Implemented locally: Google sign-in, private two-person access schema, one-time invitations, atomic first-run routine setup, monthly goal and schedule locks, routine notes, unique due-date checkoffs and corrections, next-day archive, audit and outbox tables, responsive shell, and browser push subscription control.

Verified locally: all six migrations pass in PGlite; anonymous RPC denial, outsider isolation, partner read and owner-only write, setup rollback/retry, invitation use, current-month date rules, rest-day denial, reward/schedule locks, duplicate/version checks, correction recalculation, and next-day archive. TypeScript and Vite build pass.

Verified in the authorized production Supabase project: four migration scripts reported success; 12 public tables have row level security enabled; checked RPC grants deny `anon` and allow `authenticated`; the signed-in app reads the new schema. No group, routine, or other HNF test record was created there.

Still required before this gate passes: run two-account and outsider checks in the separate test project; verify routine notes survive refresh/sign-out/another device; exercise save failure and conflict behavior in the browser; test push subscription and delivery on an actual iPhone Home Screen install using an HTTPS preview. A real notification send requires separate authorization.

## 2. Reward engine and correction-aware calendar — locally verified; live gate open

The local database includes reward reconciliation and a usable calendar. Passing PGlite checks cover the $33.60/$78.40 daily example, the M/W/F $14.40/$33.60 example, rest-day qualification, duplicate/version handling, month locks, correction recalculation and prior-month rejection. Live concurrent-device, DST, February and real account acceptance checks remain open.

## 3. Wallet, Goals and complete data mirror — implemented locally; external gate open

Implemented locally: wallet ledger UI, idempotent purchases, linked wishlist purchase reversals, seven categories, allocation events, CSV insights export, audit/outbox expansion and mirror/backup metadata. Passing PGlite checks cover ownership, linked-purchase reversal and allocation behavior. A private Sheet/API identity and backup destination are still required; the worker remains safe and does not claim any live sync or restore.

## 4. Templates and Weekly Insights — implemented locally; external gate open

Implemented locally: template save/version history, week-to-date scheduled denominators, base/bonus totals, report-preference validation and CSV generation. PGlite covers template ownership and pending report preferences. Copy-library UX, recipient verification, Resend delivery, and complete cross-month correction scenarios remain open.

## 5. Notifications, weekly reports and release — prepared, not release-ready

Added private push-subscription storage, nonsecret notification/report metadata, a 366-day original-message source, service-worker display behavior and a guarded Edge Worker entry point. The Resend sandbox handler is configured for `onboarding@resend.dev` and restricts delivery to `basineni.nikhit@gmail.com`; a custom sender domain is no longer a sandbox-test prerequisite. The handler passed a local request/allowlist test. Scheduled report generation, worker job processing, recipient verification in the app, Google Sheets mirroring, push delivery, iPhone delivery, backup restore and production deployment remain unverified release work. The earlier one-off Resend onboarding message was sent successfully; the HNF worker has not sent a report.
