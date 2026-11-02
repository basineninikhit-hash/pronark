# Pronark Health (iPhone companion)

A small SwiftUI app that reads daily step counts and workout minutes from Apple Health and
uploads them to Pronark as **suggested check-ins**. The web app can't read HealthKit, so this
app does it. Nothing is checked off or earned until the member taps **Confirm check-in** in Pronark.

## How it works

1. In Pronark → Settings → Apple Health, the member links activities to **Step count** or
   **Workouts** and sets a target (steps, or workout minutes with optional workout kinds).
2. The member signs in to this app with the same Google account (Supabase Auth, same project).
3. The app asks Health for read access to **only** the data types the linked activities need.
   It never asks for location, routes, heart rate or write access.
4. On open, on "Sync now" and when Health reports a change (about hourly, in the background),
   it reads one total per **New York day** for the current month and uploads them with
   `submit_health_values`. Days with no data upload as 0, so deleted Health data clears its
   suggestion.
5. The database creates a suggestion when a total meets a linked activity's target on a scheduled
   day. Confirming uses the same write as a manual check-off, so a day can never earn twice.

Uploads go through a queue on disk with a batch id. If the phone is offline, the batch waits and
retries later; the server ignores a batch it has already seen, and an older reading never
replaces a newer one.

## Setup on your Mac

1. Install **Xcode** (App Store) and **XcodeGen**: `brew install xcodegen`.
2. In `ios/PronarkHealth`, copy `Config.example.xcconfig` to `Config.xcconfig` (ignored by git) and fill in:
   - `PRONARK_TEAM_ID`: your Apple Developer team ID (Xcode → Settings → Accounts).
   - `PRONARK_BUNDLE_ID`: a bundle ID you own, e.g. `com.yourname.pronark.health`.
   - `PRONARK_SUPABASE_HOST` and `PRONARK_SUPABASE_ANON_KEY`: the same project and **public** key
     as the web app's `VITE_` values. Never a service-role key.
3. In `ios/PronarkHealth`, run `xcodegen`, then open `PronarkHealth.xcodeproj`.
4. Plug in your iPhone, pick it as the run destination and press Run. HealthKit doesn't work in
   the simulator in a useful way; use a real iPhone.

## One-time account setup

- **Supabase:** run `supabase/migrations/202610290029_apple_health.sql` in the project (SQL
  Editor). Then add `pronark://login-callback` under Authentication → URL Configuration →
  Redirect URLs. The Google provider itself needs no change.
- **Apple Developer:** the HealthKit capability (with background delivery) is in the
  entitlements file; Xcode turns it on for your App ID when it signs the app. A free personal
  team can run it on your own phone for 7 days at a time; a paid membership ($99/year) is needed
  for TestFlight or the App Store.
- **App Store review (later):** HealthKit apps need a privacy policy URL and must not use Health
  data for advertising. Pronark's rules already match that; the policy page still needs writing.

## Not yet verified

This code was written without Xcode, so it has not been compiled against the iOS SDK or run on a
phone. The Swift files pass a syntax check, and the New York day logic passed a test on macOS.
Check on a real iPhone: sign-in, the permission sheet, a sync, a background update after a new
workout, an offline upload that retries, and deleting a workout in Health.
