# Guided Routines — first-version build notes

Built on branch `feature/guided-routines` from the approved plan (behavior, UI, technical and
release-gate drafts dated October 21, 2026). The live app is this repository: React/Vite on
GitHub Pages, Supabase for data, and the `hnf-worker` edge function for push.

## What was built

- **Database** `supabase/migrations/202610220025_guided_routines.sql`: owner-only routines,
  categories, steps, runs (with a start-of-run snapshot) and step results; one run per routine per
  start date; Done/Skip retry-safe; Undo removes only a checkoff the routine created; key steps use
  the same completion write + wallet reconciliation as a manual checkoff (`app.apply_completion`);
  off-schedule key steps are Done without a checkoff; Sheets receive only local date, routine ID,
  total steps, Done, Skipped and finished; Start over removes routine data.
- **Screens** `src/pages/Routines.tsx`: list (today first, Start/Resume/summary, off-day start
  notice), focused runner (category/step numbers, category and overall counts, Done/Skip, timer
  with Time is up, Pause/Resume, Undo, expandable category and full routine, End for today),
  finish summary (Done vs Skipped, wake time, category durations, linked habits), builder
  (drag-and-drop with Move up/down, weekday steps, timers, key-habit links with off-schedule
  warning, record-time steps, weekday preview, start time, reminder opt-in, archive).
- **Navigation**: phone tabs are Home, Calendar, Routines, Insights, Goals, Rewards; Profile stays
  in the account menu and sidebar.
- **Reminders** `supabase/functions/hnf-worker/routine-reminders.mjs`, job `?job=routine-reminders`:
  one generic "Time for your routine" push per routine per active day at its quarter-hour start
  time, suppressed once that day's run has started or finished, gated by `ENABLE_ROUTINE_REMINDERS=1`.

## Acceptance checks

| # | Check | Status |
|---|---|---|
| 1 | Build, reorder (touch + keyboard), weekday steps, timers, preview, save/reload order | Passed in browser test (mocked backend) and DB tests |
| 2 | Runner shows category/step numbers, counts, Done/Skip | Passed in browser test |
| 3 | Done/Skip saved once; retries and double taps don't duplicate; failed save keeps step + Retry | DB tests pass; Retry UI present |
| 4 | Key step checkoff = one normal reward; off-schedule/already/Skip give none | DB tests pass |
| 5 | Close/reopen resumes; timer recalculated from timestamps; no auto-advance | Implemented; not tested on a real iPhone |
| 6 | Finish with skips; summary separates Done/Skipped; no second run that day | DB + browser tests pass |
| 7 | Partner/outsider can't read or change routines; Sheet gets six fields only | DB tests pass |
| 8 | Corrections, calendar, wallet and streaks stay accurate | Uses the existing write path; covered indirectly |
| 9 | Reminder opt-in/opt-out, one send, started-run suppression, generic copy | Unit tests pass; live delivery not verified |

## Before release

- Run the migration in Supabase, deploy the worker, set `ENABLE_ROUTINE_REMINDERS=1`, and add a
  cron that POSTs `hnf-worker?job=routine-reminders` every 15 minutes (like `custom-reminders`).
- Try a full routine on an iPhone installed to the Home Screen, including closing the app mid-timer
  and receiving a reminder.
- The release-gate items in the plan (privacy text, FAQ, contrast audit, etc.) remain open.
