# Uganda Smart Learning — deployable site

Every page is ONE self-contained .html file (styles, engine, sample data and page code are inside it). No css/js folders are needed.

## Deploy
**GitHub:** create a repo and upload everything in this folder at the top level (index.html must be in the repo root). Optional: turn on GitHub Pages (Settings → Pages → deploy from branch, root).
**Vercel:** Add New → Project → import the repo. Framework preset: *Other*. Build command: leave empty. Output directory: leave empty (root). Deploy.

Open the site URL (it loads index). Staff demo logins: admin@usl.demo / Admin@123, reviewer@usl.demo / Review@123, teacher@usl.demo / Teach@123.

## Notes
- Still a front-end prototype: data lives in each visitor's browser (localStorage). Not for real payments or real student data. Payments go to 0773014995 (change in Admin → Settings); WhatsApp messages are queued in Admin → WhatsApp outbox and sent with one tap.
- Edit the sources in the `usl` project (css/, js/), then run `python3 build.py` to regenerate this folder.
