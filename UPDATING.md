# How to update the app (change one file, not everything)

The whole app now lives in **two files** at the top of your GitHub repository:

| File | What it holds | Changes how often |
|---|---|---|
| **`usl.js`** | all the app's logic and every page's behaviour (login, payments, lessons, exams, tutor, admin, teachers, chat, live lessons) — the same file also runs on the server | every update |
| **`usl.css`** | colours, layout, look | only for design changes |

The page files (`index.html`, `dashboard.html` …), the `api/` folder, `vercel.json` and the `.sql` files normally stay as they are.

## To install an update
1. You receive a new **`usl.js`** (and sometimes a new `usl.css`).
2. Open your repository on github.com → click **`usl.js`** → the pencil/**⋯** menu → **Delete file** is NOT needed. Instead use **Add file → Upload files**, drag the new `usl.js` in (same name replaces the old one), and press **Commit changes**.
3. Vercel redeploys by itself in about a minute. Reload the site (on a phone, close and reopen it).
4. Check **Admin → Settings → App version** shows the new version number.

## Things an update may also need (you will be told)
- **A new database table/column:** open Supabase → SQL Editor, paste the small `.sql` file you are given, press Run.
- **A new key:** add it in Vercel → Settings → Environment Variables, then Redeploy.
- **A new page:** you will get that one extra `.html` file to upload next to the others.
- Changes to the files inside `api/` (rare): upload those files the same way.

## Safety
- If an update misbehaves, in GitHub open **`usl.js` → History**, pick the previous version, copy it back (or in Vercel → Deployments → the older deployment → **Promote to Production**). Nothing in your database is touched by replacing `usl.js`.
- Keep a copy of every `usl.js` you are sent, named by its version.
- Never edit `usl.js` by hand; ask for a new one.
