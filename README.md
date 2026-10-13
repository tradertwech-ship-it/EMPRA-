# Uganda Smart Learning — working prototype

A multi-page web app (plain linked HTML files) for S1–S6 learning, candidate exam practice, an AI voice tutor and a UGX 20,000/month subscription. Works on laptops and phones.

## Run it
Open `index.html` in a browser, or serve the folder: `python3 -m http.server 8000` then visit http://localhost:8000.
Run the rule tests: `node tests/server.test.js` (72 checks).

## IMPORTANT: what this is and is not
This is a **front-end prototype**. There is no real backend: `js/app.js` contains a `Server` object that simulates one in the browser (localStorage) so every rule can be seen working. Consequences:
- Anyone with browser dev tools can read or edit the data, so **it is not secure and must not be used to take real payments or hold real student data.**
- One-time codes are shown on screen (marked DEMO) instead of sent by SMS/email.
- Payments use a clearly labelled sandbox that stands in for the Mobile Money provider's server callback. No real gateway is connected.
- The AI tutor retrieves answers from the in-app notes (no LLM). Voice uses the browser's built-in speech features.
- All lessons and papers are **sample content written for the demo**. They are not NCDC syllabus text, UNEB papers or official marking schemes. Syllabus references are blank until an administrator enters real ones.

## Payment number and WhatsApp
- Payments are directed to **0773014995** (shown on the subscription page; change it in Admin → Settings). In production this must be the settlement number of your Mobile Money merchant account with a licensed gateway; a real gateway must still send the payment confirmation to your server.
- Each verified subscription (and each reversal) queues a WhatsApp message for 0773014995 containing the student's name, class, contact, amount, reference and expiry. **A web page cannot send WhatsApp messages by itself.** Here the Admin → WhatsApp outbox shows the queue with a "Send on WhatsApp" button that opens the message ready to send, and students get a "Send on WhatsApp" receipt link. For truly automatic sending, a backend job must call the WhatsApp Business Cloud API (needs a Meta business account, an approved message template and an access token kept on the server).

## Demo logins
Students register themselves (OTP shown on screen). Staff: `admin@usl.demo / Admin@123`, `reviewer@usl.demo / Review@123`, `teacher@usl.demo / Teach@123`.

## Pages
index (welcome, sign-up, login) · dashboard · library · lesson · tutor · papers (exam centre) · exam (simulator and results) · subscription · profile · admin

## Rules that are implemented (and tested)
One free trial per account (timer fixed at first start, survives logout) · access gated on trial/subscription · subscription activated only by a verified callback; failed, duplicate, reversed and forged callbacks handled · one active device per account with OTP device transfer and alerts · login lockout after 5 failures · roles (student, contributor, reviewer, admin) · contributors cannot publish; reviewers cannot approve their own work or material with permission pending · autosaving timed exams, objective marking, self-marking for written answers, topic reports · tutor daily limits and usage monitoring · audit log.

## Going to production
Replace each `Server` method with an API call to a real backend (FastAPI/NestJS + PostgreSQL), keep secrets and payment verification server-side, send OTPs by SMS/email, hash passwords with Argon2/bcrypt, use httpOnly session cookies, store files in object storage, connect a licensed Mobile Money gateway and an LLM behind your server, and build the Flutter app on the same API. Then add the real, authorised content: the app is only as useful as its verified papers and notes.
