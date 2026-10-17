'use strict';
// Shared helpers for the OTP functions. Files starting with "_" are not exposed as routes by Vercel.
const crypto = require('crypto');

const cfg = () => ({
  secret: process.env.OTP_SECRET || '',
  atUser: process.env.AT_USERNAME || '', atKey: process.env.AT_API_KEY || '', atSender: process.env.AT_SENDER_ID || '',
  resendKey: process.env.RESEND_API_KEY || '', resendFrom: process.env.RESEND_FROM || '',
  appName: process.env.APP_NAME || 'Uganda Smart Learning'
});
const smsReady = c => !!(c.secret && c.atUser && c.atKey);
const emailReady = c => !!(c.secret && c.resendKey && c.resendFrom);

function normContact(v) {
  v = String(v || '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return v;
  const d = v.replace(/[\s\-()]/g, ''); const m = d.match(/^(?:\+?256|0)(7\d{8})$/);
  return m ? '+256' + m[1] : null;
}
const b64 = s => Buffer.from(s).toString('base64url');
const sign = (secret, c, p, e, code) => crypto.createHmac('sha256', secret).update([c, p, e, code].join('|')).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// best-effort in-memory limiter (resets when the function instance recycles; use a real store for strict limits)
const hits = new Map();
function limited(key, max, windowMs) {
  const t = Date.now(), arr = (hits.get(key) || []).filter(x => t - x < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(t); hits.set(key, arr); return false;
}

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { return {}; }
}

async function sendSms(c, to, text, fetchImpl) {
  const host = c.atUser === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  const form = new URLSearchParams({ username: c.atUser, to, message: text }); if (c.atSender) form.set('from', c.atSender);
  const r = await fetchImpl('https://' + host + '/version1/messaging', { method: 'POST', headers: { apiKey: c.atKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  if (!r.ok) throw new Error('sms provider ' + r.status);
  const j = await r.json().catch(() => ({})); const rec = j && j.SMSMessageData && j.SMSMessageData.Recipients && j.SMSMessageData.Recipients[0];
  if (rec && !/success/i.test(rec.status || '')) throw new Error('sms not accepted: ' + rec.status);
}
async function sendEmail(c, to, subject, text, fetchImpl) {
  const r = await fetchImpl('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + c.resendKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: c.resendFrom, to: [to], subject, text }) });
  if (!r.ok) throw new Error('email provider ' + r.status);
}
module.exports = { cfg, smsReady, emailReady, normContact, b64, sign, safeEq, limited, body, sendSms, sendEmail };
