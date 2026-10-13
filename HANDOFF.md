# HNF Incentive Program — planning handoff

Prepared September 21, 2026. The user approved the final planning package and requested the saved implementation prompt. The product scope, revised schedule rules, templates, category targets, weekly-report timing and technology plan are approved. No application has been implemented or deployed.

## Read in this order

1. [PRD.md](PRD.md): authoritative requirements, decisions, acceptance criteria and five build milestones.
2. [Backend architecture](design/backend-architecture.md): service flow, database relationships, jobs, Sheets sync and recovery.
3. [Screen states](design/screen-states.md): main actions, alternate/empty/error states and permissions.
4. [Stack and account setup](design/stack-and-setup.md): approved services, setup instructions, costs and release gates.
5. Visual references in PRD section 3: expanded Insights, Goals, routine/template/notification states plus original Home/Calendar/Wallet direction.

## Final review summary

One private two-person web app, five tabs (Home, Calendar, Insights, Goals, Wallet), personal routines/templates/schedules, correction-aware dollar rewards and streak bonuses, purchases, category savings and wishlists, weekly insights, full data mirror into one Google Sheets document and CSV exports. Daily pushes at 6 AM/6 PM Eastern; saved-address weekly email Monday 6 AM Eastern. Daily notifications remain push-only.

First build milestone: **Account, routine and scheduled checkoff foundation**. It establishes identity, group permissions, schema, editable routine notes, monthly settings/schedules, unique daily completions, audit/outbox foundation, responsive shell and an early browser Web Push capability proof. It is not a release and must not display invented reward results before milestone 2.

The next milestones cover accounting/corrections, Wallet/Goals/mirroring/recovery, templates/insights, then delivery/release verification. Follow PRD gates; do not silently omit features to meet September 22. At each milestone report passed, failed and unrun checks and limitations.

## Conditional build prompt

Planning is approved. Submit [CODEX_PROMPT.md](CODEX_PROMPT.md) as a separate coding request to implement the approved release in milestone order. For a deliberately smaller task, the following prompt authorizes milestone 1 only:

> Read `PRD.md`, `design/backend-architecture.md`, `design/screen-states.md`, `design/stack-and-setup.md` and the approved visual references. Implement milestone 1, “Account, routine and scheduled checkoff foundation,” within its stated scope. Preserve existing project work, follow private-group permissions and monthly schedule locks, verify the milestone acceptance criteria, and report results and limitations before proceeding beyond this milestone. Identify missing owner service configuration without inventing credentials or claiming integrations work. This task does not authorize paid purchases or production deployment.

## Owner setup now

- Supabase: create account, Free organization and `HNF Incentive Program` project in a nearby US region; save the database password privately. No manual table creation needed now.
- Cloudflare: create account, verify email, locate Workers & Pages. No domain purchase or upload is needed yet.
- Later gates: choose the private Sheet and backup destination/executor before milestone 3; verify the weekly-email sender domain before milestone 5. These are documented setup dependencies, not completed integrations.

## Approval state

Final planning approval is recorded. The consolidated PRD, design references, workflow, completion checks and setup gates are saved. Planning is complete. Providing a build prompt does not execute it; no implementation, purchases or deployment were performed.
