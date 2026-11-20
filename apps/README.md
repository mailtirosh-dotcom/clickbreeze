# ClickBreeze apps (customer + photographer)

Plain JavaScript web apps wrapped as Android apps with Capacitor.

- Map: MapLibre GL JS 4.7.1, bundled in `apps/*/public/vendor` (no CDN).
- Map tiles: OpenFreeMap (free, no key). Place search: Photon, limited to Tamil Nadu.
- Google Maps is used only for the "Directions" link after a booking is confirmed.
- Backend: Supabase. Run `database/clickbreeze-all.sql` once (includes `apps.sql`).

## Get the APKs
GitHub > Actions > "Build Android APKs" > Run workflow. When it finishes, download the
`clickbreeze-customer-debug-apk` and `clickbreeze-photographer-debug-apk` artifacts.

## Before first use
1. Supabase: enable Phone sign-in with an SMS provider, or add test phone numbers.
2. Admin panel: enroll the photographer with the same mobile number and verify them.
3. Payment is in test mode (no real money moves).

## Local checks
`npm install` in an app folder, `node scripts/build.js customer`, then `node tests/apps.test.js` (needs Playwright).

## SMS login with MSG91 (login: "msg91")
`shared/config.js` holds the MSG91 widget id and token (public values). The secret `MSG91_AUTHKEY` lives only in Supabase
(Edge Functions > Secrets). Deploy `supabase/functions/msg91-login` with "Verify JWT" OFF. After login works, run
`update public.settings set value='"otp"' where key='login_mode';` to close the no-login shortcut, then turn off anonymous sign-ins.
