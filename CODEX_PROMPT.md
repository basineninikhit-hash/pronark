# Codex implementation prompt

Build HNF Incentive Program in `/Users/nickbasineni/Desktop/HNF App` using the approved planning package. This is an implementation task; do not restart the planning interview.

First inspect project instructions and existing work. Read `PRD.md`, `HANDOFF.md`, and every Markdown file under `design/`. Inspect the referenced mockup images. Treat `PRD.md` as authoritative: historical workflow drafts and image-generation prompts must not override its final requirements. Use `design/backend-architecture.md`, `design/screen-states.md`, and `design/stack-and-setup.md` for supporting details.

Implement the approved app using React/TypeScript, Supabase PostgreSQL/Auth/backend functions and scheduled jobs, Cloudflare Pages hosting, Web Push for daily notifications, Resend for weekly email, and one continuously updated Google Sheets data mirror.

Start with milestone 1, “Account, routine and scheduled checkoff foundation,” then work through all five PRD milestones in order. Verify each milestone's acceptance criteria before advancing; report progress and continue when checks pass. Do not claim completion based only on screens or mock data.

Preserve all approved rules, including scheduled-day streaks, month-end resets, correction recalculation, separate personal records with partner read access, savings allocations without double-counting money, reusable routine templates, CSV exports, and every nonsecret application change syncing to the same Google Sheets document. Use Eastern local time throughout, daily phone updates at 6 AM and 6 PM, and weekly email reports Monday at 6 AM. Follow the PRD for exact behavior.

Preserve unrelated files and existing changes. Match the approved visual direction while following the final five-tab navigation and screen-state specifications. Keep secrets out of frontend code, shared spreadsheets and chat. Ask only for genuinely missing account access, credentials through a secure setup method, or decisions that block the next step; continue independent work while waiting. Never invent credentials, fake live integrations, or silently substitute providers or drop features.

Run meaningful checks for permissions, financial calculations, concurrent/duplicate requests, scheduled habits, corrections, notifications, exports, Sheets synchronization and recovery. Report what passed, failed or could not be tested, and resolve failures within scope. Reassess the historical launch target based on actual progress.

This request authorizes implementation and local verification of the approved scope. It does not authorize paid purchases, production deployment, or sending real report/reminder messages. Prepare those actions for review and request authorization when ready. Finish with run instructions, completed milestones, verification results, remaining setup and release blockers.
