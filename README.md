# Uganda Smart Learning — go-live guide

Everything the app does for real (accounts, one-time codes, subscriptions, payments, WhatsApp notices, content, teacher access) runs on **your server** (Vercel functions + a Supabase database). The browser only shows what each person is allowed to see. There are **no demo accounts, no demo codes and no sandbox payments**.

**Only the developer email `tradertwech@gmail.com` can be the administrator** and it needs no subscription. Teachers and reviewers are created by that administrator and are free. Students must verify their account and pay (after the one free trial) to use lessons, exams, tutor and class rooms.

## Step 1 — Put the files online (10 minutes)
1. Create a GitHub repository and upload **everything in the site folder** (the pages, `api/`, `vercel.json`, the `.sql` files).
2. On vercel.com choose **Add New → Project**, import that repository, **Deploy**. (GitHub Pages cannot run the server functions; use Vercel.)

## Step 2 — Create the database (Supabase, free tier is enough)
1. supabase.com → New project. Open **SQL Editor**, paste all of `supabase.sql`, **Run**. (Already ran an older version? Run `supabase-upgrade.sql` instead.)
2. **Project Settings → API**: copy the *Project URL*, the *anon public* key and the *service_role* key.
   The service key is a secret: it goes only into Vercel, never into a page.

## Step 3 — Add the settings in Vercel
Vercel → your project → **Settings → Environment Variables**, add these, then **Deployments → Redeploy**.

| Name | What to put | Needed for |
|---|---|---|
| `APP_SECRET` | any long random text (40+ characters) | everything (signs tutor passes) |
| `SUPABASE_URL` | Project URL | everything |
| `SUPABASE_SERVICE_KEY` | service_role key | accounts, payments, content |
| `SUPABASE_ANON_KEY` | anon public key | class chat, voice notes, calls |
| `DEV_EMAIL` | `tradertwech@gmail.com` (default) | the only administrator |
| `RESEND_API_KEY`, `RESEND_FROM` | from resend.com | codes sent by **email** |
| `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` (optional) | from africastalking.com (a **live** app, not the sandbox) | codes sent by **SMS** to phone numbers |
| `FLW_SECRET_KEY`, `FLW_SECRET_HASH` | from flutterwave.com | **automatic** MTN/Airtel payment prompts |
| `WA_TOKEN`+`WA_PHONE_ID` (+`WA_TEMPLATE`), or `TWILIO_SID`+`TWILIO_TOKEN`+`TWILIO_WA_FROM`, or `CALLMEBOT_KEY` | see Step 5 | **automatic WhatsApp** notices to 0773014995 |
| `GOOGLE_API_KEY`, `GOOGLE_CSE_ID`, `ANTHROPIC_API_KEY` | optional | Google search / better voice / written tutor answers |
| `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | optional | calls across strict networks |

Check **`/api/status`** on your site: it shows which services are connected (true/false, no secrets). The same list is in **Admin → Settings**.

## Step 4 — Create the administrator (once)
Open your site → **Sign up** → name, **`tradertwech@gmail.com`**, a strong password → tick the box → a 6-digit code is emailed to you → enter it. You are now the administrator. (No class is needed.) Nobody else can become administrator, even if they register with another email.
Then in **Admin → Staff** add reviewers and teachers (email + password you give them) and tick each teacher's classes and subjects. Teachers sign in at `/teacher`.

## Step 5 — Payments and WhatsApp
**Payments work from day one without any provider:** the student sends UGX 20,000 to **0773014995**, types the transaction ID from the MTN/Airtel message, you see it in **Admin → Payments → Confirm**, and their plan switches on. You also get a WhatsApp message for each one.

**Automatic payments (optional, recommended):** create a Flutterwave account, complete their business verification, set your payout/settlement to 0773014995, add `FLW_SECRET_KEY`. In Flutterwave → Settings → Webhooks set URL `https://YOUR-SITE/api/pay-webhook` and a secret hash; use the same value as `FLW_SECRET_HASH`. Students then get a PIN prompt on their phone and the plan activates automatically. The server always asks Flutterwave directly before activating; a forged webhook or screenshot cannot activate anything.

**WhatsApp to 0773014995 — pick one:**
- *Easiest (free, your own number):* from 0773014995 send the message `I allow callmebot to send me messages` to **+34 644 51 95 23** on WhatsApp, it replies with an API key → set `CALLMEBOT_KEY`.
- *Official:* Meta WhatsApp Cloud API → `WA_TOKEN`, `WA_PHONE_ID` (and `WA_TEMPLATE` if Meta requires an approved template).
- *Twilio WhatsApp:* `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_WA_FROM`.
Until one is set, **Admin → WhatsApp outbox** shows every message with a one-tap "Send on WhatsApp" button.

## Step 6 — Codes (SMS and email)
- Email via Resend: for testing, `RESEND_FROM=onboarding@resend.dev` only delivers to the email you registered at Resend (use the developer email). For students, verify your own domain in Resend and use e.g. `Uganda Smart Learning <noreply@yourdomain.com>`.
- SMS via Africa's Talking: the **sandbox does not deliver real SMS**. Use a live account/app and top up airtime. If a student gets "SMS sending is not set up", `AT_USERNAME`/`AT_API_KEY` are missing.
- Codes last 10 minutes, 5 tries, one new code per 45 seconds, 5 per hour. They are never shown on screen.

## What is protected, and what is not
- Passwords are hashed; accounts, sessions, the one-device rule, trial, subscriptions and payments are decided only by the server.
- Lesson notes, quizzes and paper questions are **not sent to a browser** until the account is allowed (trial/paid/staff). Exam answer keys never reach students until they submit.
- The tutor and voice functions need a short-lived pass the server gives only to allowed accounts.
- **Class chat, voice notes and calls** use the public Supabase key (`SUPABASE_ANON_KEY`) with open table rules. They are not secret-grade: anyone who knows the project key could read or post. Keep them for class chat only, do not share the anon key, and treat this as the next thing to harden (Supabase Auth).
- Teacher uploads still need a reviewer's approval; the starter lessons/papers are samples, not official NCDC/UNEB material. Replace them via the Admin pages.
- Backups: Supabase → Database → Backups (paid) or export the `usl_state` table regularly.

## Everyday use
- New payment to confirm → WhatsApp message + **Admin → Payments**. Wrong/missing money → **Not received** (the student is told why). Mistakes → **Reverse**.
- Student lost their phone → **Admin → Students → Reset device**.
- Forgot password → "Forgot your password?" on the log-in box (code by SMS/email).
- Teachers: **Admin → Staff → Assign** to change their classes/subjects at any time.

## Rebuild (only if you edit the source)
`python3 build.py` (in the source folder) rebuilds the site folder. `node tests/server.test.js` runs the rule tests.
