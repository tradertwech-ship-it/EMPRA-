# Uganda Smart Learning — deployable site

Every page is one self-contained .html file (styles, engine, sample data and page code are inside it). The `api/` folder holds three small serverless functions that Vercel runs for you (they send the 6-digit codes).

## Deploy
**GitHub:** create a repo and upload everything in this folder at the top level (`index.html` and `api/` in the repo root).
**Vercel:** Add New → Project → import the repo. Framework: *Other*. Leave build and output settings empty. Deploy.
GitHub Pages alone can host the pages, but it cannot run `api/`, so codes stay in demo mode (shown on screen) there.

## Make the 6-digit code really arrive (Vercel only)
In Vercel → your project → Settings → Environment Variables, add these, then redeploy:

| Name | Value |
|---|---|
| `OTP_SECRET` | any long random text (32+ characters). Keep it private. |
| `AT_USERNAME` | your Africa's Talking username |
| `AT_API_KEY` | your Africa's Talking API key |
| `AT_SENDER_ID` | optional approved sender name |
| `RESEND_API_KEY`, `RESEND_FROM` | optional, only if you also want codes sent to email addresses |
| `APP_NAME` | optional, shown in the message (default: Uganda Smart Learning) |

Notes
- Africa's Talking username `sandbox` is their test mode: it does not deliver real SMS to real phones. Use your live app, with airtime credit loaded, to reach students. Check their current rules for Uganda sender IDs.
- If the keys are missing, or the page runs somewhere without `api/`, the app falls back to showing the code on screen (marked DEMO).
- The code is generated and checked on the server. The browser never receives it.
- Test it: sign up with your own number; the SMS should arrive within a minute.

## Class discussion rooms
Each class has its own room (chat, voice notes, group voice/video calls), colour-coded per class. Students see only their own class; staff can open any room and delete, mute and review reports under Admin → Chat moderation. There are no private messages.

IMPORTANT: in this prototype messages live in each visitor's own browser, and calls only connect tabs of the same browser. So two different students on two different phones will NOT see each other yet. That needs a shared realtime service (for example Supabase or Firebase for messages and file storage, plus a signalling channel and a TURN server for calls). The chat and call screens are ready for that: see `Transport` in `js/p-discuss.js` and the `Server` methods in `js/app.js`.
Because children use this app, keep rooms moderated, get parental consent, and decide your safeguarding rules before opening them to real students.

## Other limits
Still a front-end prototype: data lives in each visitor's browser, payments are a sandbox, content is sample only. Payments go to 0773014995 (Admin → Settings); WhatsApp messages are queued in Admin → WhatsApp outbox.

## Rebuild
Edit the sources (`css/`, `js/`, `api/`), then run `python3 build.py` to regenerate the `site` folder. Rule tests: `node tests/server.test.js` and `node tests/otp.test.js`.
