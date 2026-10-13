# HNF technology proposal and setup guide

Technology plan approved September 21, 2026. No services have been provisioned by the assistant. PRD.md remains authoritative. The final planning package is approved; setup dependencies below are resolved during the authorized build.

## Approved technology plan

| Responsibility | Proposal | Reason |
|---|---|---|
| Phone/computer interface | React + TypeScript + Vite, installable web app | One responsive interface; Home Screen installation supports phone push |
| Accounts | Supabase Auth with Google sign-in | Separate identities without managing app passwords or progress-email delivery |
| Data | Supabase-managed PostgreSQL | User-approved SQL choice, relational records and transaction-safe reward updates |
| Rules | PostgreSQL transaction functions with row-level permissions | Validate ownership, month locks and recalculation together |
| External calls | Supabase Edge Functions | Keep Google Sheets credentials and push private keys off devices |
| Scheduled work | Supabase Cron invoking workers | Notifications and sync retries run when the app is closed |
| Phone notifications | Standard Web Push, service worker and VAPID keys | Daily updates at 6 AM/6 PM Eastern; iPhone installation and permission |
| Weekly email | Resend | Monday 6 AM Eastern report to saved verified address |
| Data copy | Google Sheets API | Mirror all application records and revisions; separate user-owned analysis tabs |
| Hosting | Cloudflare Pages free tier and supplied HTTPS address | Static app deployment without a custom domain requirement |
| Images/files | Bundled design assets; routine notes are text in PostgreSQL | No user file uploads required in this release |
| Recovery | Sheets data snapshots plus separate PostgreSQL logical exports | A mirror alone cannot undo accidental deletion or restore database structure |

The user approved this stack. Supabase hosts the real PostgreSQL database and supporting backend services. Account login is independent of Google Sheets access; logging in with Google must not silently request Drive access.

## Alternative

PostgreSQL hosted elsewhere plus a separate authentication service and scheduled server would also work. Supabase is recommended because it groups those responsibilities for this small app. The prior Sheets-plus-Apps-Script option was compared in backend-architecture.md; the user has now chosen PostgreSQL. No need to re-request the database choice.

## Cost and maintenance

For two people, modest text records and roughly four notifications daily, free service tiers are plausible. Supabase Free currently includes a 500 MB database; it lacks automatic backups and can pause after inactivity. Cloudflare Pages Free includes 500 builds per month. Exact Web Push library compatibility with the selected Edge Function runtime must be tested before committing to delivery. Browser/OS delivery is not guaranteed at an exact minute.

Daily notifications use Web Push. Weekly email uses Resend, so a verified sender domain is required; the user approved the technology but not a domain purchase. Resend Free currently lists 3,000 emails/month and 100/day. At two users weekly reports consume 8–10 emails/month plus verification messages. A custom website domain is optional and separate from the email sender domain. No paid AI service is needed for a curated original daily quote library. No purchased plans or guaranteed total cost have been authorized. The project owner retains service accounts, and the coding maintainer must monitor job failures, access, backup retention and dependencies.

## How to create the proposed PostgreSQL project

1. Open https://supabase.com/dashboard and create/sign into your account.
2. Create a Free organization if needed, then choose New project.
3. Name it HNF Incentive Program. Choose a US region near the users.
4. Generate a strong database password and store it in your password manager. Do not paste it into the conversation or a shared sheet.
5. Wait for the project to finish provisioning. Stop here during planning; application tables and permissions should be created from reviewed HNF migrations during the authorized build, rather than manually copying generic example tables.
6. During implementation, use the project's Connect panel for its URL and publishable key. Secret/service keys and the database password belong in protected backend configuration, never frontend files or Google Sheets.

Tell the coding assistant when the project exists. Setup of the schema, permissions and connected app still requires the separate implementation handoff. Do not use the public-read sample policy from a generic tutorial for HNF's private records.

## How to create the Cloudflare account

1. Visit https://dash.cloudflare.com/sign-up and create your account.
2. Verify your email if prompted, then sign in to the dashboard.
3. Find Workers & Pages. This is where HNF's website project will live.
4. Stop at the account stage for now. You do not need to buy a domain or add an existing website to create a Pages app; it can use Cloudflare's supplied pages.dev address.
5. During authorized deployment, choose the build/upload workflow and create the Pages project using built assets. Direct Upload cannot later be converted in place to Git integration; choose the intended workflow before creating the project. Git integration and repository creation are not assumed authorized by this setup guide.

Official account guide: https://developers.cloudflare.com/fundamentals/account/create-account/
Official Pages upload guide: https://developers.cloudflare.com/pages/get-started/direct-upload/

## Google Sheets connection, during implementation

Create or select a private HNF data spreadsheet. Create a Google Cloud project, enable the Sheets API, and configure backend access to that specific sheet through a dedicated service identity. Share only the intended sheet with that identity and the two intended users. Keep its private credential in backend secrets; avoid public link access.

Export profiles/group app records, tasks, routine descriptions, templates, monthly rates/goals/schedules, completions, earnings, purchases, savings items/allocations, audit history, weekly report snapshots and nonsecret notification/report history/preferences. Add stable IDs, schema version, revisions, export timestamps and deletion markers. Do not export passwords, login tokens, push subscription keys or service credentials. Those are operational secrets, not reportable app records.

Persist app changes to SQL first, then queue the sheet update in the same database transaction. Target syncing within one minute under normal conditions; show pending/failed/last-success status. Preserve pending jobs through outages. Never pretend the two independent systems were saved atomically.

Use current-state raw tabs, append-only change history and dated snapshots to recover data after accidental changes. Proposed retention: 30 daily snapshots, then monthly snapshots for 12 months; confirm storage growth before launch. Export logical PostgreSQL backups separately to a private owner-controlled destination, proposed daily with seven retained copies. The destination remains unresolved. Test restoration of notes, financial history and permissions; Sheets alone does not preserve database schema, functions, authentication or infrastructure.

## Phone setup — confirmed target: iPhone

For the approved iPhone target: a supported device (Web Push introduced in iOS/iPadOS 16.4), install the web app on the Home Screen, open it there, then tap Enable notifications and grant permission. For Android: test the actual browser/device, then enable notifications through the app's explicit permission control. A declined permission leaves the app usable and shows instructions for enabling it later; it must not silently turn on emails.

Save each device subscription privately with its owner, handle replacement/expiry, and provide a test-notification action during authorized setup. Schedules and daily/monthly accounting use America/New_York with daylight saving. Morning is 6 AM; evening is around 6 PM. Clicking a morning notification opens the full previous-day summary, today's plan and quote; clicking the evening notification opens current outstanding goals. Lock-screen notification text is necessarily brief, so the full daily update is also stored in an in-app update history.

## Sources checked September 21, 2026

- https://supabase.com/docs/guides/getting-started/quickstarts/reactjs
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/functions
- https://supabase.com/docs/guides/cron
- https://resend.com/pricing
- https://resend.com/docs/dashboard/domains/introduction
- https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/
- https://developers.cloudflare.com/pages/platform/limits/
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

## Setup gates and next step

Technology approval is recorded. Before milestone 1 live integration, finish Supabase project and Google OAuth client setup. Create the Cloudflare account now; a Pages project/deployment can wait until built assets exist. Before milestone 3 choose the private Sheet and backup destination/executor. Before milestone 5 configure and verify the Resend sender domain and recipient; test actual iPhone notification behavior.

Final approval covers the PRD and visual package; a separate build request starts coding. Planning approval is not deployment or purchase authorization.
