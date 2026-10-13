# HNF screen and state reference

Approved planning screen specification. Complements the image mockups; PRD.md is authoritative. Use the approved warm-white/green/mint/gold direction, generous touch targets, readable text and restrained motion. No functioning application is included.

## Common layout

Phone bottom navigation: Home, Calendar, Insights, Goals, Wallet. Desktop sidebar has the same destinations plus Settings. Me/Partner selector appears on main pages. Partner pages show “Viewing partner · Read-only”; remove mutating controls rather than merely styling them disabled. Template “Use a copy” creates one's own copy and is permitted. Settings, update history and templates are accessible from header/task controls without adding a sixth phone tab.

## Onboarding and settings
- Google sign-in; loading indicator, cancel/back path and clear retry if sign-in fails. Expired sessions preserve unsaved text locally until reauthentication, without claiming server persistence.
- Create private group or redeem invitation. Expired/redeemed invite gives an explanation; owner can issue a replacement. No public group search.
- Initial checklist starts with the eight agreed activities, rates and blank descriptions. Choose 10k/15k steps, water amount/unit, and each habit's Every day/weekday pattern. Review then Save setup. At least one weekday must be selected. All initial choices take effect from creation date.
- Settings: profile, Eastern timezone explanation, phone notification on/off, Sheets last success/pending/error, export entry, verified weekly-report email, report on/off. Fixed 6 AM/6 PM and Monday 6 AM schedules in version one. Switching email replaces the previous recipient only after verification; sending remains disabled while the new address is unverified.
- iPhone setup: Add to Home Screen instructions; open installed app; explicit Enable notifications button invokes permission. Permission denied view links to instructions and offers Not now; no hidden email fallback. Provide a Test notification control during build/setup.

## Home and task details
- Hero: today's earned total, weekly/monthly earned and distinct wallet balance; due count excludes off days. Per-task next attainable milestone shows extra bonus and window progress. If month-end occurs first, explain it.
- Empty scheduled day: “Nothing scheduled today” with links to Calendar and routines; do not label a rest day failure. All done: show completion celebration once, leave earned amount and routine info accessible.
- Row checkbox toggles completion. Title/info opens description; clicking it must not also toggle. Detail panel: title, current reward, weekday schedule, saved multiline notes, Edit routine, Save as template. No automatic clinical instructions or prefilled invented routine text.
- Editor: title, multiline notes, cents reward, Every day/weekday controls; first-day locks have “Changes reopen [date].” Titles/notes remain editable anytime. Cancel returns without saving; warn before discarding a changed draft.
- Failure: “Could not save. Your draft is safe.” Retry/Cancel. A failed SQL save must not display saved earnings or imply the draft is queued to Sheets. A successful SQL save with delayed Sheets sync displays “Saved · Sheets update pending.” These are different states.

## Calendar
- Monthly grid with completed/missed/pending/rest/bonus symbols and labels; activity filter optional. Day detail lists due activities, rewards and bonus event. Current-month past edit shows “Please remember to be honest.” before saving.
- Past months read-only; future days not selectable for completion. Rest day detail: “Not scheduled” without a checkoff. Correcting a day previews revised earnings/bonus/balance before confirmation; a later failure leaves authoritative totals unchanged.
- Negative resulting balance is clearly displayed; correction is still allowed. Version conflict: “This day changed on another device. Review the latest version.” Preserve proposed input separately.

## Wallet and purchase-linked goals
- Wallet balance can be negative, shown in text rather than color alone. Earnings/spending are separate totals; chronological list distinguishes purchase, base reward, bonus and correction.
- Record purchase opens an empty form; edit preloads an existing purchase and labels itself Edit. Fields: name, amount, date, note, optional linked wishlist item. Saving a linked item must not also create an unrelated second purchase.
- Delete confirmation states that the purchase will be removed from spending and the linked item restored; show any allocation shortfall afterward. Failed saves keep draft; repeated submissions are disabled while pending.

## Goals
- Seven category cards; wallet, allocated and unallocated shown once. Empty category: “Add your first item.” A nonempty card shows sum of active item prices and funds assigned.
- Category detail lists items with estimated cost, optional external link, notes, edit/archive and Record purchase. Add item form has clear validation and Cancel/Save.
- Assign savings dialog shows available unallocated dollars and category balance. Move between categories in one action. No payment is implied. Conflicting requests refetch current allocations rather than overassign funds.
- Overallocated after correction/spending: “Reallocate $X” with links to category funding controls. Surplus over a reduced target is “$X more than this goal needs,” not lost money. Purchased items live in a separate history section.

## Insights and weekly email
- Previous/next week selector; label partial week Through yesterday and separate Today. Completed/scheduled numerator and denominator, base/bonus/total, per-habit rates and previous-week comparison. Missing comparison data is explicit.
- No tasks: “No scheduled activities this week.” Never render a meaningless success percentage. Refresh while loading does not show fake zero balances.
- Weekly report card: saved address, verified/unverified state, Monday 6 AM Eastern schedule, toggle, last delivery status. Never show provider accepted as definitely read. Form errors, resend verification and opt-out have clear recovery.
- Actual weekly email is a compact version of the selected complete-week report, with dates, base/bonus totals, encouragement, link to Insights and preference/unsubscribe control. It does not reuse the obsolete daily email content.

## Templates and update history
- My templates / Partner templates; empty states offer saving an existing routine. Preview shows title, notes, schedule, suggested reward and source revision. Use a copy opens a new-task confirmation form. Replace routine notes on an existing task explicitly confirms text replacement only.
- 6 AM update: concise push opens a saved full daily summary, today's plan and dated quote. 6 PM update opens the live outstanding checklist. History shows created time and “Based on records at [time]”; past sent content is not silently rewritten after corrections.
- Weekday schedule preview and ordinary/rest/missed calendar states must be included in implementation review even though early raster mockups show daily-only tasks.

## Export and accessibility
- Export controls: person, dataset, date range, Generate CSV/Download all. Show preparing, ready with generated time, no records or retry error. Export is read-only; no import/overwrite control in version one.
- Keyboard navigation, visible focus, labeled inputs, polite save/result announcements, non-color status cues, reduced-motion support and no horizontal overflow at phone widths. Do not copy tiny decorative image text or image-generated branding into product requirements.
