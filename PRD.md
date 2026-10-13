# HNF Incentive Program

## 1. Project overview

### Planning status and approvals
- Approved planning baseline dated September 21, 2026. This is the one authoritative requirements document. Supporting design documents explain this plan; they do not independently change requirements.
- Stages 0–5: goal, scope, daily reward behavior, scheduled-habit revision, category goals, templates, weekly Monday 6 AM email and technology plan approved in conversation. React/TypeScript, Supabase, Cloudflare Pages, Web Push and Resend were explicitly approved during final preparation.
- Stage 6: visual references, screen specifications and current workflow are included in the approved planning handoff.
- Stages 7–8 complete: user approved the saved Markdown planning package and requested the final Codex implementation prompt. Planning is complete; implementation has not started.
- User authorized planning files and mockups in this folder and requested early visuals before technology selection. No application code, dependencies, repository setup or deployment has been performed. Technology approval does not authorize purchases.
- Resume from the approved handoff, not the interview. The supplied CODEX_PROMPT.md is intended for a separately authorized coding task.

### Goal and audience
Help people create consistency in daily health, nutrition, fitness, and personal routines through task rewards, streak bonuses, and visible progress.

Multiple people use the app and manage their own tasks. Both people can see everything, including balances and purchases. Initial release serves a private two-person group with separate accounts. Target launch is September 22, 2026 (tomorrow at time of request); feasibility is not yet verified. Existing workarounds and measurable success targets have not been supplied.

### Confirmed requirements
- Responsive web app accessible from phone and computer.
- Each person manages their own tasks; users can see each other's information. Visibility does not imply permission to edit another person's records.
- Home: fun interactive dollar tracker showing daily, weekly, and monthly earnings; upcoming attainable multipliers; checklist below.
- Checking an activity crosses it out and adds its reward to the relevant totals.
- Each activity has an editable title and a description accessible via an information button. Descriptions will be supplied later; do not invent them.
- Home provides add-item and edit-item controls.
- Separate interactive calendar for reviewing task consistency.
- Each activity earns bonuses independently. Follow its schedule consistently for 14 calendar days to earn a 20% bonus on that window’s base rewards; at 28 days total run bonuses become 40% of that window’s base rewards, including the earlier bonus rather than stacking multipliers. Everyday tasks retain the original daily calculation.
- Gym example: $28 base at day 14 becomes $33.60; $56 base at day 28 becomes $78.40 total.
- Missing a scheduled day restarts that activity's streak. Rest days do not break it. Already earned bonuses are retained after a later missed day.
- All streaks end at month-end; unspent earnings carry forward.
- Step goal is selectable between 10,000 and 15,000 and fixed for the month.
- Reward amounts and monthly step goal can be changed on the first calendar day of the month, with an exception for initial app setup. Do not substitute first visit of the month for the first calendar day.
- Users can correct only the current month. Show a reminder to be honest when correcting past days.
- Corrections must recalculate affected bonuses; keeping bonuses after a later missed day does not protect an invalidated bonus after correction.
- Newly added tasks can earn money immediately, including midmonth. Choosing an initial amount for a new task is permitted; changing an existing task's amount remains limited to the first calendar day.
- Spending is self-reported purchase recording and reduces the balance; no actual money transfer is requested.
- Preferred recurring cost is $0; necessary costs may be considered but are not approved.
- PostgreSQL is the authoritative database. Every saved application change, including routine descriptions, must be copied to Google Sheets.
- Daily progress updates use phone notifications only; weekly reports use the separately approved email channel. Morning notification at 6 AM and evening reminder around 6 PM, both America/New_York with daylight saving. This timezone also governs task days, weeks and month resets; it replaces the prior Chicago setting. Target phone is iPhone.

### Initial activities
| Activity | Daily reward |
|---|---:|
| Going to the gym | $2 |
| Meeting the monthly step goal | $2 |
| Healthy lunch | $1 |
| Healthy dinner | $1 |
| No sugar | $1 |
| Night skin care routine | $1 |
| Morning routine | $1 |
| Reaching water goal | $2 |

Base daily maximum for the initial list is $11. Water target and activity descriptions remain unspecified.

### Approved scope and journeys
1. Set up an account and monthly goals; configure personal tasks and rewards.
2. Check off today's tasks, see earnings update, and review per-activity bonus progress.
3. Review consistency in Calendar and correct current-month entries with an honesty reminder.
4. Record purchases and review the remaining balance and transaction history.
5. View the other person's progress and agreed shared information.

Approved baseline: simple completion animations, milestone celebrations, undo, activity filters, and historical task/reward snapshots.

Outside the approved first release: payment processing, automatic health-device verification, public leaderboards, native mobile apps, and elaborate animations. The user subsequently added reminders; the earlier reminder exclusion is superseded.

### Remaining decisions and resolution points
| Item | Resolution point | Status / recommended default |
|---|---|---|
| Final planning package approval | Complete | User approved the documents and requested the saved build prompt |
| Service accounts and US database region | Start of milestone 1 | Owner creates Supabase project; Cloudflare account instructions supplied; developer checks existing setup before provisioning |
| OAuth client and redirect addresses | Milestone 1 integration check | Use Google sign-in through Supabase; exact addresses depend on owner project and later hosting URL |
| Google spreadsheet identity and service access | Before milestone 3 live integration | One owner-selected private document, never a new primary document per week |
| Sender domain and verified report address | Before milestone 5 live weekly email | Owner-controlled domain for Resend; any registration purchase requires authorization |
| Backup destination, automation executor and retention | Resolve in milestone 3 before any production data | Propose owner-controlled private backup storage; daily SQL exports, 7 daily copies, plus Sheets 30 daily/12 monthly snapshots. Do not call backups ready before testing a restore |
| User-written routines and water target | First-run setup | Blank notes permitted; user supplies positive water quantity and unit |
| Quote library | Before milestone 5 | 365 distinct original HNF messages, replenish before exhaustion; no paid daily AI dependency |
| Launch date | After milestone 1 capability checks, then release review | September 22 is the requested target. Expanded scope has no reliable completion estimate yet; no silent scope reduction |

First milestone has a concrete specification and can begin after final plan approval and separate build authorization. External credentials are setup dependencies, not missing product decisions. If a service limitation invalidates the stack, report it with alternatives; do not silently swap providers or drop features.

## 2. Key features and milestones

### Approved release scope and operating defaults
For the September 22 target, the approved scope includes Home, Calendar, Weekly Insights, Goals, Wallet, personal routine templates, habit schedules, partner read-only views and settings. Keep all confirmed reward rules. Start with simple completion and milestone celebrations; defer elaborate animations. Morning and evening phone notifications were subsequently added by the user, replacing an intermediate email proposal. No feasibility or delivery guarantee has been established.

Use separate accounts linked in one private two-person group; each can read all group members' app information but modify only their own. Use America/New_York calendar time, Monday–Sunday weeks, and an internet connection required for saving. Failed saves should preserve input and provide retry; never display unconfirmed rewards as permanently saved.

Approved first-version outcomes: each person can complete a daily task, see accurate synchronized earnings on phone and computer, inspect shared progress, correct current-month records with correct recalculation, and record a purchase against a persistent balance. These are expected outcomes, not completed verification.

Milestone sequence (full gates below):
1. Account, routine and scheduled checkoff foundation.
2. Reward engine and correction-aware calendar.
3. Wallet, Goals and complete data mirror/recovery.
4. Templates and Weekly Insights.
5. Notifications, weekly reports and release verification.

### Approved reward schedule
Ordinary completions earn base rewards. Each uninterrupted streak awards a 20% bonus on its first 14 days upon reaching day 14. At day 28, total bonuses become 40% of the first 28 days' base earnings, less the bonus already awarded. Days 29–31 earn base rewards only. A later missed day retains already qualified bonuses. Every streak ends at month-end. User approved this schedule explicitly.

### Feature specification
Baseline behavior and the later schedule/template/category/report rules are approved. Operational defaults are included in this approved planning baseline; integration and recovery choices are resolved at the checkpoints above.

#### Accounts, setup, and shared views
- Separate sign-ins; a single-use invitation connects the second person to the private group. No public profiles or search. Sign-in method and recovery depend on stage 5 selection.
- Initial setup chooses task amounts, monthly step goal, and water target; once submitted, setup cannot be reopened to bypass the monthly lock. New tasks can still be added at any time.
- A person selector switches between one's own view and a clearly labeled read-only view of the other person's Home, Calendar, balance, and purchase history. Credentials and session tokens are never shared app information.
- Server permissions restrict reads to the private group and writes to the record owner. A third account cannot obtain group data by guessing identifiers.
- Expired or invalid invitations have a useful error and retry/reissue path; expired sessions return to sign-in without claiming a pending action was saved.
- Verify: both users can read each other's app records; neither can edit the other's; outsiders cannot read them; setup and invitation retries do not duplicate accounts or membership.

#### Home and task management
- Top area shows today's, this week's, and this month's earned amounts plus a distinct spendable balance. Purchases affect balance, not historical earned totals.
- One completion per task per local calendar day. Tap toggles completion, with pending feedback, a short celebration after success, and an undo action. Undo is a correction and recalculates rewards.
- Each row shows title, reward, completion state, and an accessible information button opening the saved routine details. Empty descriptions show “No description yet.”
- Routine details explicitly support storing multiline steps, product names and notes, such as the user’s Night skin care routine. Owner can edit and save anytime; partner can read. Checkbox toggles completion; title/info opens details, preventing accidental completion when reading. Routine content stays separate from daily checkoffs and monthly reward locks. Persist text in tasks.description, record revisions in the audit history, and sync both to Sheets. Proposed text limit: 10,000 characters with a visible validation message. No per-step dollar rewards or file uploads implied.
- Verify a routine edit survives refresh, sign-out/sign-in and another-device read; Sheets reflects the edit and revision; failed save retains draft; concurrent edits cannot silently overwrite; partner edit is rejected.
- Each task shows streak length, next milestone, additional bonus available, and days remaining. If the month ends first, explain that the milestone cannot be reached this month.
- Add/edit form: required nonblank title, optional description, nonnegative dollar reward with at most two decimal places. Save/cancel controls retain input after failure. New task rewards begin on creation day; no completions before creation.
- Titles and descriptions can change anytime. Reward edits are allowed throughout the first calendar day and affect that month's completions, including earlier completions that day. Prior months are unchanged. Otherwise amounts are locked until next month. If no change is made on day 1, previous settings carry forward.
- Archive instead of deleting tasks: remove from today's checklist starting the following day; preserve history and earned rewards. Historical current-month completions remain correctable. New tasks have distinct histories and never inherit old streaks.
- Verify: repeated taps and retries never double-credit; editing labels preserves history; first-day edits recalculate correctly; day-2 edits are rejected by the backend; new tasks earn immediately and cannot be backdated before creation.

#### Calendar and correction accounting
- Month grid shows completed/available task counts, with text or symbols as well as color. Tap a day for task detail, earnings, and bonuses. Optional activity filter focuses on one habit.
- Current-month past days and today can be corrected; future days and prior months are read-only. Display “Please remember to be honest.” before saving a past-day change.
- Recompute affected activity streaks and bonuses from the corrected dates. Adding a missed completion can qualify a bonus; removing a qualifying completion can remove it or move its qualification date.
- Attribute base rewards to completion dates and bonuses to the day the relevant milestone is reached, even if entered later. Daily/weekly/monthly totals reflect corrected earning dates.
- Correction recalculation replaces previously derived amounts; it does not add another copy. Preserve an audit record of old/new completion, actor, and timestamp.
- Compute money in integer cents; round each milestone bonus to nearest cent, half up. At day 28 subtract the already rounded day-14 bonus from the rounded 40% target.
- Date boundaries use America/New_York, including daylight saving. Weeks span Monday–Sunday, even across months. Streaks never cross month boundaries. Today is not a missed day before it ends.
- Verify $2 gym totals: day 14 $33.60, day 28 $78.40, day 31 $84.40. Verify missed-day restart, separate successive 14-day streaks, February rollover, correction-created/removed bonuses, repeated recalculation, and a week spanning months.

#### Wallet and purchases
- Show lifetime earned, recorded spending, and remaining balance; list dated earnings/bonus adjustments and purchases with clear labels.
- Purchase fields: required title, positive amount in cents, date (today or earlier), optional note. Save, edit, and delete one's own purchase with a confirmation before deletion. Purchase recording remains available for past dates, including earlier months; only task corrections are restricted to the current month.
- Allow a self-reported purchase to exceed the balance, showing an overspent amount explicitly. Likewise, if a correction reduces earnings below existing purchases, show the negative balance without erasing a purchase or preventing the correction.
- Failed saves preserve the form and provide retry. A repeated save/retry records one purchase, not two. Edits/deletions recalculate balance and retain audit history.
- Verify purchase add/edit/delete, repeated submission, invalid values, cross-user write rejection, and negative balances from both spending and corrections.

#### Shared interface behavior and accessibility
- Phone: stacked trackers, full-width checklist, bottom navigation for Home/Calendar/Insights/Goals/Wallet and a clearly accessible person selector/settings entry. Computer: wider tracker row, comfortable checklist width, persistent navigation.
- Keyboard-operable controls, visible focus, labeled inputs, screen-reader completion announcements, sufficient contrast, and reduced-motion support. Color is never the sole indication of progress.
- Loading placeholders avoid showing false $0 balances. Empty Home offers adding a task; empty Calendar explains there are no records; empty Wallet offers recording a purchase.
- No offline writes in version one. Connection errors show retry, retain drafts, and undo unconfirmed optimistic totals. Refresh/reconnection retrieves authoritative state; simultaneous edits on two devices either serialize or present a conflict requiring refresh, never silently double-credit.

#### Backend responsibilities and data
- User: identity reference, display name, setup completion. Group and membership: two linked users and access scope. Invitation: expiry and one-time redemption.
- Task: stable id, owner, title, description, created date, archived effective date. Monthly task settings: month, reward cents, applicable step/water settings and historical snapshots.
- Completion: task id, owner, local date, completion state, version; unique per task/date. Audit: actor, action, old/new values, timestamp.
- Derived earning entries: base or bonus, task, earned date, amount cents, stable qualification key. Purchase: id, owner, title, amount cents, date, note, version, audit trail.
- Trusted backend validates identity, ownership, dates, setting locks, cents, and request versions; clients cannot supply authoritative balances or bonus amounts. Completion changes and recalculation commit consistently, with idempotent retries.
- Backend operations cover setup/invitation, task and setting changes, completion/correction, month/day summaries, shared reads, and purchase mutations. Exact APIs follow the chosen stack.
- Use date-based month partitions and current date checks; do not depend on a browser being open at midnight. Preserve previous months and lifetime balance. No payment integrations required. Scheduled reminder jobs are now required by the scope addition below.

Milestone 1 is specified below. Execution waits for a separate build request; later milestones require their dependencies and checks to pass.

The future coding assistant must check agreed behavior before calling a milestone complete and report failed or unrun checks and limitations. Relevant verification will cover access isolation, authorized shared reads, duplicate checkoffs, month boundaries, reward locks, 14/28-day accounting, missed days, corrections, and purchase balances. A screen merely existing does not establish completion.

### PostgreSQL and Google Sheets — approved direction
PostgreSQL stores all app records. Google Sheets receives every persisted application change, including task titles/descriptions, routine notes, monthly settings, completions/corrections, earnings, purchases and nonsecret preferences/history. The requirement includes data backup, not just summary reporting.

Proposed mechanism: commit SQL changes, audit and a durable export job together, then mirror by stable IDs/revisions with retries and visible pending/last-sync status. Sheet syncing is eventual, not an atomic second database write. See [stack and setup](design/stack-and-setup.md) for full export coverage, dated snapshots, retention proposal and separate SQL recovery plan. Operational secrets and authentication credentials are excluded from the shared spreadsheet. No live database or sheet has been connected.

### Phone updates — latest requested scope
- Morning at 6 AM Eastern local time: previous-day progress, today’s plan, encouragement and a different daily inspirational quote.
- Around 6 PM: outstanding-goal reminder by phone notification. Daily progress emails are removed; there is no automatic email fallback. Weekly Insights automatically emails a report to the user’s saved address, as a separate channel from daily push updates.
- Proposed implementation: concise push notification opening a full in-app update, privately stored device subscriptions, unique user/date/type jobs, preference checks, retry cutoff, fresh goal check before evening delivery, and skipping when all goals are complete. Notifications may be delayed by device/OS conditions.
- Quotes proposed as a curated original library with distinct date assignments and replenishment monitoring. Delivery retry preserves the original quote. Morning summaries refer to the previous accounting day, using America/New_York.
- The user has not requested a Codex automation. No real notification has been scheduled or sent.

### Approved feature expansion

The user explicitly requested Weekly Insights with an email capability, savings categories and specific items, routine templates, habit schedules, and data export while keeping one continuously updated dataset. The user approved all three proposed rules (weekly delivery, category targets and scheduled streaks) and templates, and authorized completing the plan. The expanded visuals below now cover these journeys. No implementation has occurred. The September 22 launch target must be reassessed; no feature has been silently deferred or promised ready.

#### Navigation
Five phone navigation tabs: Home, Calendar, Insights, Goals, Wallet. Templates are available from Add activity and routine details; exports and report-address settings are available in Insights/Settings. The person switcher applies to Insights, Goals, templates and Wallet as well: read the partner's app information, edit only one's own. Stack the desktop sidebar accordingly. Provide accessible labels, pending states, retry and retained form input throughout.

#### Weekly Insights
- Purpose: show how reliably a person followed the routine they scheduled, and identify one practical next focus without shame or unsupported health advice.
- Screen: week selector (Monday–Sunday, Eastern), completion percentage, completed/scheduled count, earned base and bonus amounts, spending separately, per-habit consistency, strongest habit, most frequently missed scheduled habit, and comparison with the previous week. Display the numerator/denominator to avoid misleading rates when schedules differ.
- Calculate percentages from scheduled opportunities on finished local dates. For an in-progress week label results “Through yesterday” and show today's progress separately, rather than marking today's unfinished tasks missed. Final weekly report uses all seven finished days. Unscheduled days and dates before task creation/after archive are excluded; no eligible tasks means “No scheduled activities,” not 0% failure or 100% success.
- Read from authoritative completion/earnings/settings records; do not maintain another independent weekly ledger. Month resets do not split a Monday–Sunday reporting week. Historical schedule versions preserve historical denominators. Corrections update affected insights; display the latest revision/time. Ties show joint leaders or a clear stable ordering; new users see a useful empty state without invented comparisons.
- Confirmed by user: save an email address and automatically receive a weekly report. Approved delivery: Monday at 6 AM Eastern for the preceding Monday–Sunday. Insights settings provide a saved address, verification state, enable/disable weekly email and last delivery status. Changing the address requires verifying the replacement before sending reports there; stop using the old address when changed. A failed verification retains the unverified pending address and offers retry. The recipient is the user’s chosen verified address; group visibility does not authorize sending reports to arbitrary partners or outsiders. Email validation, opt-out, provider setup and delivery tracking are required. No messages are sent during planning. Daily reminders remain phone-only.
- Store a sent-report snapshot/date/revision for audit; later corrections update in-app insights but cannot change an already sent email. Manual resend must be an explicit action. Duplicate automatic jobs must not duplicate weekly reports.
- Verification: compare rates and totals against source records; cover rest days, midweek creation/archive, corrections, empty weeks, timezone/week/month boundaries, missing prior-week data, permissions, and email address verification, opt-out, changed address and repeated email-job retries.

#### Savings categories, goals and wishlist items
- Confirmed categories: Clothes, Tech, Jewelry, Home items, Experiences, Travel, Other. Each person has their own wishlist and goal amounts; partner may view.
- The approved category goal is the sum of estimated prices of its active, unpurchased wishlist items. This interprets the user's broader category goal as the total of its specific items. Example: Clothes contains Shoes $120 and Jacket $180, so its target is $300. There is no separately typed competing category target in version one.
- Each category card shows target, allocated savings, remaining to fund, and item count. Open a category to add/edit/remove items with required name and positive estimated price, optional product URL and notes. No shopping/payment integration or automatic price tracking. Validate safe HTTP(S) links; never execute user-entered content.
- Funding: manually assign existing wallet money to categories. Allocation earmarks dollars but does not create earnings or record spending. Total allocated cannot exceed max(available wallet balance, 0) when adding an allocation. Show unallocated = balance minus allocations. Moving money between categories is one atomic operation.
- The same dollar cannot count as fully saved in multiple categories. Example: $150 wallet, $100 Clothes allocation and $50 Travel allocation leaves $0 unallocated, not $150 available in each goal.
- Marking an item purchased opens the existing purchase form, prefilled with item/name/estimate; user confirms actual cost/date. Saving creates exactly one linked purchase, marks the item purchased, lowers wallet once, and consumes up to the actual cost from that category's allocation. Any remainder is funded from unallocated balance or produces the already-approved negative balance/over-allocation warning. Never charge the wallet simply for adding a desired item.
- Purchased items remain in history and leave the active target. If removal/price change makes allocation exceed the active target, show surplus explicitly; user can reassign it. Removing a desired item never deletes a real purchase or earns money.
- Purchase edits/deletions operate on the same linked purchase, not a duplicate Goals record. A deletion restores the item to unpurchased and restores only the allocation consumed by that purchase; subsequent conflicts are shown as overallocated. Purchase amount edits apply the difference with an audited allocation adjustment. Serialize transactions to prevent double effects.
- When earnings corrections or unrelated spending make existing allocations exceed balance, preserve the allocations and display “Reallocate $X” with the exact shortfall. Block additional funding until resolved; do not silently erase user plans. Negative balances remain supported.
- Empty categories prompt adding a first item. Failed saves retain drafts; conflicting edits prompt refresh. Archive goal items instead of erasing their history. Savings carry across months along with wallet balance.
- Verification: sums in cents, nonnegative allocation inputs, no double-allocation during concurrent requests, moves preserve total, buying changes wallet once, actual vs estimated price, purchase edit/delete, price edits, correction-induced shortfalls, archive history and cross-user writes.

#### Routine templates
- Save a task's title, multiline routine description and proposed schedule as a named reusable template. Include an optional suggested reward for creating a new task, not permission to overwrite a locked existing reward.
- Template library offers My templates and Partner templates (read-only source). Preview before Use template. Applying creates an independent personal task after confirming title, description, schedule and reward; earning begins on creation date as already agreed. Alternatively “Replace routine notes” updates only the description of an existing task after confirmation, preserving its completion history, reward and schedule.
- Template edits never silently alter tasks already made from it or the partner's original. Preserve source_template_id and source revision for provenance. A retry creates at most one new task. Archiving a template leaves existing tasks intact. No publicly shared template marketplace.
- Verification: save/preview/apply, copy independence, private-group permissions, empty library, duplicate retry, applying notes cannot bypass monthly reward locks, and all revisions mirror to Sheets.

#### Habit schedules and approved streak revision
- The approved first version offers Every day (default) or selected weekdays, such as Monday/Wednesday/Friday. At least one weekday is required. No arbitrary “three times whenever” goals in this version, because eligibility and missed-day rules would be ambiguous.
- Home and evening reminders include only today's scheduled activities. Calendar distinguishes completed, missed, pending and not scheduled. Rest days have no base reward and do not count as missed or as extra completions. Current-month corrections can only toggle dates that were scheduled under the settings then in effect.
- Approved schedule changes for existing tasks follow reward-change timing: first calendar day of the month; first setup and newly created tasks can choose immediately. This prevents removing a missed day retroactively to manufacture a streak. Keep historical schedule versions. The user approved this monthly schedule lock with the scheduled-habit rules.
- Approved reward revision: retain 14- and 28-calendar-day consistency windows, counting scheduled opportunities rather than requiring action on rest days. Anchor the window to the first completed scheduled occurrence after setup or a missed scheduled occurrence. Every scheduled occurrence through the milestone must be completed. Missing one scheduled occurrence ends that run; the next completed scheduled occurrence starts a new run. Month-end still ends all runs.
- At day 14 (inclusive of the anchor day), bonus is 20% of base rewards earned on scheduled days in days 1–14. At day 28, total run bonuses become 40% of base rewards on scheduled days in days 1–28, minus the bonus already awarded. Days after 28 earn base rewards only. A day-14/day-28 rest day can qualify without a checkoff: backend evaluates due milestones by local date, including via scheduled processing and read reconciliation. A milestone on a scheduled day qualifies only once that occurrence is completed. Stable qualification keys prevent repeat awards from repeated evaluation.
- Example: gym scheduled Monday/Wednesday/Friday, $2 each, first completed Monday. Completing all six scheduled visits through day 14 earns $12 base plus $2.40 bonus = $14.40. Completing all 12 through day 28 earns $24 base plus $9.60 total bonuses = $33.60; the additional day-28 bonus is $7.20. Everyday habits preserve the approved $33.60/$78.40 examples.
- A later missed scheduled day retains earlier earned bonuses; a correction that invalidates past qualification recalculates them, as already approved. A milestone falling after month-end is not earned. No off-day checkoff creates extra rewards. Recalculation processes all runs within the month, not only the current run.
- Verification: daily behavior unchanged; selected weekdays; first completion midweek; rest-day milestone; missed scheduled day vs rest day; schedule changes/locks; correction-created/removed bonuses; short months; local date boundaries; late scheduler; idempotent read reconciliation.
- This approved revision replaces the original daily-only eligibility rule for nondaily habits.

#### One dataset, Google Sheets and data export
- PostgreSQL remains authoritative for all records. Use the same configured Google Sheets document over time, updating app-managed tabs and rows by stable IDs/revisions. New features add tabs within that document; do not create a new primary spreadsheet each week. Backups are labeled snapshots, never competing live ledgers.
- Export buttons create read-only CSV downloads for selected person/date range/dataset. Downloads are snapshots and do not sync back, replace the live sheet or modify balances. Include a generated timestamp and Eastern timezone. Optional “Export all app data” packages the relevant CSVs together; secrets are never included.
- Extend sheet coverage to category goals, wishlist items, allocation movements, linked purchases, templates/revisions, schedule versions, insights report metadata, saved report preferences and delivery status. Keep only nonsecret operational data; existing two-person read visibility applies to application records.
- Escape quotes/newlines correctly and neutralize spreadsheet formula injection in text fields. Export empty datasets with headers and a clear no-records message. Consistent snapshot reads prevent mismatched totals while changes occur; stale or failed sheet sync does not change the authoritative export values.
- Verification: export totals agree with SQL; routine multiline notes survive round-trip; corrections/deletions are reflected; same live spreadsheet identity is retained; retries do not duplicate rows; correct owner/group authorization; new-feature tables are included; formula-like text remains text.

#### Storage and backend additions
- categories/category_goals: owner, stable category key, derived target and version. wishlist_items: id, category_id, owner, name, estimated_cents, URL, notes, status, linked_purchase_id, revision.
- allocation_events: owner, category, signed cents, reason, linked purchase/move id, timestamp. Derive category allocations from events; changes are audited and transaction-safe with purchases.
- routine_templates/template_versions: id, owner, name, title, description, schedule suggestion, optional reward suggestion, archive state. Applied tasks store source reference without live coupling.
- task_schedule_versions: task, month/effective date, weekday set, creator and revision; integrate with monthly settings and earning eligibility.
- weekly_reports: owner, week_start, source revision, generated_at, snapshot, report status. report_preferences store owner, saved verified email, enabled flag and weekly send schedule; recipient verification secrets stay outside exports. delivery_jobs use unique owner/week/report-type keys and preserve the sent snapshot. No new independent earnings ledger.
- Extend existing transaction functions, read permissions, durable sync jobs and tests. Weekly insights are calculated from underlying data; stored sent snapshots serve audit only. New report-generation/sync jobs are idempotent. Add routine/goal/insight views to final visual coverage.

### Build milestones and gates

A feature is complete only when the intended action works, permissions/business rules hold and meaningful verification passes. A milestone is complete only when its features work together. Report failed/unrun checks and remaining limitations. Mockups or screens alone are not completion.

| Milestone | User outcome and work | Dependencies / acceptance and verification |
|---|---|---|
| **1. Account, routine and scheduled checkoff foundation** | Two users can sign in, join their private group, configure tasks/routine notes/monthly schedule and check off a due task. Build the responsive shell, schema/migrations, identity/ownership policies, unique completions, audit/outbox foundation and server date validation. Run a small browser Web Push capability proof. | Owner project/OAuth setup; React/Supabase. Verify user A can edit A, user B reads A but cannot mutate, outsider reads fail; notes survive refresh/device change; rest days cannot earn; first-day/setup locks; duplicate submissions create one completion; failures preserve draft. Complete a documented real-device push proof or report a blocking compatibility issue. Reward/balance UI must say unavailable until milestone 2, not display fabricated earnings. No claim this milestone is a releasable app. |
| **2. Reward engine and correction-aware calendar** | Accurate base rewards, 14/28-day schedule bonuses, balances and historical calendar from persisted records. Add idempotent rest-day milestone reconciliation and correction transactions. | Milestone 1. Pass daily $33.60/$78.40 and M/W/F $14.40/$33.60 examples; mixed missing/rest days, multiple runs, February, month/week boundaries, cents rounding, simultaneous corrections, first-day edits, previous-month rejection and repeat evaluation. On failure rollback data and accounting together. |
| **3. Wallet, Goals and complete data mirror** | Record/edit/delete purchases; fund category wishlists without double counting; sync all current app records and history into one sheet; CSV exports and recovery. | Milestone 2 plus owner Sheet/API permissions and chosen backup executor/destination. Verify purchase-linked allocation reversals and concurrency, overspending/correction shortfalls, exports matching SQL, routine-note round-trip, sync outage/retry/stale-job behavior, formula-safe text, stable spreadsheet identity. Test SQL restore plus snapshot restoration before any production-data claim. Later milestone tables must join the same mirror. |
| **4. Templates and Weekly Insights** | Save/copy routine templates and inspect accurate weekly progress; save and verify weekly report address. Extend sheet/export coverage. | Milestones 1–3; Resend configuration needed for address verification. Verify copy independence, template lock enforcement, rate denominators/rest days/empty weeks, cross-month weeks, corrections, partner read-only, verification/opt-out and matching CSV. Never generate a second authoritative earnings ledger. |
| **5. Notifications, weekly reports and release** | 6 AM/6 PM iPhone pushes, Monday 6 AM weekly email, fresh quotes, full in-app updates, complete five-tab responsive app. Validate integrations and recovery. | Earlier gates plus verified sender domain, actual iPhone, hosting URL and named maintainer. Test closed-app push, permission denial, expired subscription, DST, late/repeated jobs, fresh pending-goal check, report snapshot/delivery status/opt-out, quote uniqueness, full sheet parity, backup restore and deployment smoke checks. All requested features must pass or release gaps are explicitly reported for user decision. |

A prerequisite capability failure changes the plan only after the issue and concrete alternative are presented. Keep live production data out of a partial, unverified build. Do not omit an approved feature to meet the requested date without approval.

## 3. Skills, frameworks, and technology

The user approved React/TypeScript/Vite, Supabase-managed PostgreSQL/Auth/backend jobs, Cloudflare Pages, Web Push for daily phone notifications and Resend for weekly email. Google Sheets receives a complete nonsecret app-data mirror. No provider accounts have been created by the assistant. No plans have been purchased.

| Responsibility | Selected technology | Implementation role |
|---|---|---|
| Interface | React, TypeScript, Vite | Responsive five-tab app; TypeScript compiles to browser JavaScript |
| Identity | Supabase Auth with Google sign-in | Separate users and sessions; private two-person membership |
| Data and business rules | PostgreSQL, RLS and transaction functions | Own-record writes, group reads, reliable rewards, allocations and audits |
| Integrations | Supabase Edge Functions | Sheets, Web Push and weekly email calls using backend-only credentials |
| Scheduling | Supabase Cron | Milestone reconciliation, 6 AM/6 PM notifications, Monday reports, retries |
| Hosting | Cloudflare Pages | HTTPS app assets; free supplied address initially |
| Phone delivery | Standard Web Push + service worker | iPhone Home Screen app and explicit permission; no extra phone app |
| Weekly report delivery | Resend | Verified saved recipient, owner-controlled sender domain, delivery feedback |
| External data copy | Google Sheets API | Same spreadsheet with stable row IDs, revisions and labeled snapshots |
| File storage | Bundled assets only | No user attachment uploads or automatic shopping image downloads |
| Recovery | SQL logical exports plus Sheets snapshots | Executor/destination selected before milestone 3 production use; restore tested |

Cost assumption: two people, text-only records, roughly four daily pushes plus 8–10 weekly emails per month. Published free tiers are suitable starting allowances; not an uptime or forever-free guarantee. Supabase Free includes 500 MB and can pause after inactivity; automated backups are not included. Cloudflare Pages Free includes 500 builds/month. Resend Free lists 3,000 emails/month and 100/day; a verified domain may entail registration cost. No automatic paid upgrade. Source links and owner setup are in [stack and setup](design/stack-and-setup.md).

Credible alternative considered: separate managed PostgreSQL, an authentication provider and a hosted server/scheduler. It offers more control but more maintenance and integration work for two users. Sheets plus Apps Script was considered earlier; SQL was chosen for transactions, constraints, access rules and auditability. No need for another backend framework for the selected architecture.

Compatibility: official React/Supabase, Vite/Pages, database/RLS/Cron and browser push documentation support the component choices. Actual Web Push cryptography/library compatibility in the Edge runtime must be proved in milestone 1; a native Expo push example does not prove browser Web Push. Dependency versions are pinned during the build, not invented here.

Ownership: the user owns service accounts, billing and recovery destinations. The future coding maintainer owns migrations, dependency updates, access policies, alert/error review, quote replenishment, job retries and restore checks. That responsibility must have an actual maintainer before release.

### Visual references and workflow
Green, mint, warm white and gold visual direction is approved. Expanded assets are included in the approved planning package. Mockups contain sample data, never production records; PRD behavior overrides decorative image artifacts.

| Asset | Purpose / status |
|---|---|
| [Home](design/home-phone-v1.png) | Approved direction; apply final five-tab navigation |
| [Calendar](design/calendar-desktop-v1.png) | Approved direction; apply schedule-aware rest-day state |
| [Wallet](design/wallet-phone-v1.png) | Balance and purchase form concept; approved package |
| [Task editor](design/task-editor-desktop-v1.png) | Notes and locked reward; add approved weekday selector |
| [Weekly Insights](design/insights-desktop-v1.png) | Weekly metrics/report/export screen |
| [Goals and category](design/goals-phone-v1.png) | Savings/wishlist flow |
| [Routine, templates, iPhone setup and error](design/routines-notifications-states-v1.png) | Details, partner copy and alternate states |
| [Screen specifications](design/screen-states.md) | Remaining forms, empty states, live sync status, purchase/permission failures |
| [Backend diagrams and storage map](design/backend-architecture.md) | Current complete service/data flow and entity relationships |
| [Initial workflow](design/backend-workflow.md) | Historical simple view; current backend document takes precedence |
| [Daily email concepts](design/daily-emails-v1.png) | Superseded; do not implement daily emails |

Prompts: [initial](design/generation-prompts.md), [additional](design/additional-mockup-prompts.md), [final round](design/final-mockup-prompts.md). Built-in image generation used; all selected project assets saved locally. The user-invoked planning skill is `/Users/nickbasineni/.codex/skills/vibe-coding-master/SKILL.md`. No unavailable stack-specific skill is assumed.

## 4. Checkpoints and version control

Future implementation only: inspect local history, remotes, and working changes before setup or edits. Preserve unrelated changes; use focused checkpoints and stage only relevant work. `git status` inspects changes, `git add` stages selected files, `git diff --staged` reviews the selection, `git commit` records a local checkpoint, `git log` inspects history, and `git push` uploads commits.

Create/connect a repository only when needed and authorized. Adding a remote establishes a connection; renaming a branch is not mandatory repository setup. Use the intended branch and remote. Choose recovery based on whether history is shared; prefer correcting commits or appropriate reverts over routine resets. Commits and pushes do not themselves deploy the app. PRD approval does not authorize these actions during planning.

## 5. Debugging and verification

Future implementation workflow: reproduce expected versus actual behavior; trace relevant code and data; explain evidence and the proposed fix; obtain approval only if edits are not already authorized; make the smallest complete change; verify the issue and relevant nearby behavior; report results and limitations.

Before handoff, audit contradictions, permissions, acceptance criteria, loading/empty/error states, cost assumptions, dependencies, visual consistency, and first-milestone blockers. Define deployment validation and recovery once a hosting approach is approved. Final PRD, designs, and actionable first milestone require explicit handoff approval. Planning approval alone is not build or publication authorization.

### Planning completion audit
- Requirements consistency reviewed: scheduled days supersede daily-only rules; Eastern time everywhere; daily push and weekly email separated; category targets sum active item prices; allocation does not spend money; one live dataset and one live Sheet.
- Scope and screen coverage reviewed: all requested features have user outcomes, permissions, failures and checks; additional states are specified in design/screen-states.md.
- Backend reviewed: schema relationships, identity boundaries, transaction/idempotency rules, jobs, corrections, exports, notification snapshots and recovery documented.
- Visual review: selected images inspected for amounts, labels and major layout; generated artifacts documented in prompt notes. Images and supporting screen specifications are included in the approved package.
- Cost/dependency review: official sources checked; free-tier/domain/backup constraints and real-device push proof are explicit. No functioning integration or runtime compatibility test is claimed.
- Schedule review: September 22 remains a requested target, not a commitment. Expanded scope cannot responsibly be promised before capability tests and implementation estimates.
- No application tests were run because no application has been built. Milestone 1 specification is actionable once final approval/build authorization and owner credentials are available. Nonblocking later setup decisions have resolution gates above.
- Final planning approval recorded. PRD, supporting documents, visual references and build handoff are saved. A separate implementation request remains required; CODEX_PROMPT.md provides it when submitted.
