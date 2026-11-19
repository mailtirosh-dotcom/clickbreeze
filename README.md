# ClickBreeze

A hyperlocal photography reverse-bid marketplace for India. Customers post a requirement for their town, district or state. Verified photographers and studios bid. When the customer confirms a bid, contact numbers are revealed.

## What is in this repository

| Folder | What it holds | Status |
|---|---|---|
| `admin-site/` | Super admin web panel (static HTML and JavaScript, Supabase backend, password plus authenticator 2FA) | Built and wired to live data |
| `database/` | Supabase SQL. Run `clickbreeze-all.sql` once; it is safe to run again | Built |
| `docs/` | `ClickBreeze_Admin_Panel_Guide.pdf`: features, rules and how the pages connect | Written |
| `design/` | Design sources for the admin pages, the customer app screens and the photographer app screens (`*.dc.html`, `canvas.json`) | Designs only |
| `tests/` | Browser tests for the admin site with a mocked Supabase (Playwright) | Passing |

The customer and photographer Android apps are **designs only** (`design/C*.dc.html` and `design/P*.dc.html`). They are not built yet.

## Set up the admin panel

1. Create a Supabase project. In Authentication, Users, add your admin user with **Auto Confirm User** ticked.
2. In `database/clickbreeze-all.sql`, replace `YOUR_EMAIL_HERE` with that email. Paste the whole file into the Supabase SQL Editor and run it.
3. Put your project URL and **publishable** key in `admin-site/config.js`. Never put a secret or service-role key in this repository.
4. Deploy the `admin-site/` folder to a static host (Netlify). Restrict the site to your team and keep `netlify.toml` (it sets no-index and blocks framing).
5. Open the site, sign in, scan the QR code with an authenticator app, and enter the code.

## Rules worth knowing

- Roles are Super admin, Verifier and Support. They are enforced in the database, not only on screen.
- The database returns admin data only to sessions that passed the authenticator step.
- The audit log cannot be edited or deleted.
- ID proof and portfolio uploads are switched off until Supabase Storage is set up. Do not store ID numbers.

## Run the tests

```
node tests/cbtest.js    # sign-in and 2FA flow
node tests/cbtest2.js   # all admin pages with mock data
```
Both need Playwright and expect the admin site at the path set at the top of each file.
