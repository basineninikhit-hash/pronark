# Pronark — implementation status

The approved product requirements are in [PRD.md](PRD.md). This folder contains the React/Vite app, PostgreSQL migrations, local tests, and scheduled-worker code. The existing `broken-dream-9579` Cloudflare Worker was last deployed on October 7, 2026 (version `12d62e89-e3ce-424b-bbfe-5e0caf62740b`). The purchase-popup and activity-KPI changes are live. A fresh signed-in Home check and live write-path smoke test are still pending.

## Local run

1. Use Node.js 20.19+ and install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local`, then set the Supabase project URL and **publishable/anon** key. Do not place database passwords, service-role keys, OAuth client secrets, or Google Sheets credentials in `VITE_` variables.
3. Apply the migrations in `supabase/migrations/` in lexical order to a new project. Do not rerun them in the current project without checking its schema and migration history first.
4. Start with `pnpm dev --host 127.0.0.1`, then open `http://127.0.0.1:5173/`. Opening `index.html` as a `file://` URL will not run the app.
4. For Google sign-in, add `https://<project-ref>.supabase.co/auth/v1/callback` to the Google OAuth client's authorized redirect URIs. In Supabase Auth → URL Configuration, set the Site URL to `http://127.0.0.1:5173/` for local work and add that exact URL to Redirect URLs. After a failed or expired attempt, start a fresh sign-in from the app; do not reload an old callback URL.

For isolated live tests, put the test project's public URL and publishable/anon key in ignored `.env.test.local` using the same variable names. Run `pnpm dev:test` and open `http://127.0.0.1:5174/`. Add that exact URL to the test project's allowed Auth redirect URLs and the test project's Supabase callback to the Google OAuth client. Vite's test mode overrides `.env.local` with `.env.test.local`, so verify the test project reference before creating records.

The local verification command is `npm test`; the production build check is `npm run build`. The test suite uses PGlite to exercise all migrations and transaction functions. Its pgcrypto functions are test shims; live Supabase still needs permission and integration checks.

## Activity KPI update

The owner ran [202610070014_activity_kpis.sql](supabase/migrations/202610070014_activity_kpis.sql) in the current Supabase project's SQL Editor, and read-only API checks returned 200 for both new tables. It adds optional per-activity targets and daily measurements, protected by owner-only writes and partner-readable policies; changes enter the existing Sheets mirror queue. Users can set a target and unit when adding or editing an activity, then log numbers from Home or Calendar. Measurements do not automatically check off activities or award money; the existing checkoff remains explicit. The wallet's Record purchase button now opens a modal instead of an inline form.

## Rewards update release gate

The local build includes additive category-and-item savings targets, item-level assignments, purchase accounting that leaves unused savings in the category, negative in-app wallet warnings, and bonus-progress pauses while a wallet is non-positive. `npm test` and `npm run build` pass. The built static files are live on the existing Cloudflare Worker, using `wrangler.jsonc`; no local secrets were uploaded. Before broader release, refresh the signed-in app and exercise a small category target, item assignment, and purchase/reversal on disposable test data. Do not upload `.env.local`, `.env.push.local`, service-account JSON, or the repository root.

For the early Web Push capability check, run `node scripts/generate-vapid.mjs` once in a development checkout. It puts the public subscription key in ignored `.env.local` and the private key in ignored `.env.push.local`. Restart Vite after adding the key. The Settings button can then request permission and create a browser subscription; it does not store the subscription in Supabase or send a notification. A real iPhone check requires an HTTPS test URL installed to the Home Screen. Keep the private key out of browser variables and source control.

## Verification boundary

Local tests cover private-group reads, owner writes, setup and invitation redemption, scheduled rewards, corrections, wallet purchases, allocations, category/item target accounting, negative-balance bonus pauses, Sheets mirror behavior, email guards, and push scheduling. Earlier owner-led checks covered Google sign-in, a second account, and closed-app push. The new Worker bundle and signed-in Rewards page were verified live; the bonus view now exists, but bonus progress and live write paths remain unverified. Local passing tests do not prove all live behavior.

The current Supabase project's branch is labeled `main PRODUCTION`. SQL Editor execution may not register these scripts in Supabase CLI migration history; reconcile migration tracking before automated migration deployment. A staging project remains preferable for broader live test data.

## Security and operations

The app uses Google for sign-in and a service account for its Sheets mirror. The front end uses the public Supabase key; the OAuth client secret belongs only in Supabase Auth settings. If any client secret was shared in chat, rotate it. The Sheets mirror previously passed a live write/read-back; see [worker notes](supabase/functions/hnf-worker/README.md). One closed-app iPhone push test previously succeeded. Recheck scheduled delivery, weekly reports, and backup/restore before calling the whole service released. Resend sandbox email is limited to its verified test recipient.

## External setup still required

Keep all private keys and service-account material outside browser variables and deploy artifacts. Before a broader release, confirm the owner-selected Google Sheet and service identity, a private backup destination/executor, Resend configuration, scheduled workers, and an HTTPS/iPhone delivery check. Resend's sandbox sender removes the custom-domain DNS requirement for the verified test recipient; it does not support arbitrary recipients.
