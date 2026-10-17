'use strict';
const L = require('./_lib');
// POST /api/verify-otp {contact, purpose, code, token} -> {ok:true} only if the code matches the signed token and has not expired.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  const c = L.cfg(), b = await L.body(req), contact = L.normContact(b.contact), purpose = b.purpose === 'transfer' ? 'transfer' : 'verify';
  if (!c.secret || !contact || !/^\d{6}$/.test(String(b.code || '').trim()) || typeof b.token !== 'string') return res.status(400).json({ ok: false, error: 'That code is not correct.' });
  if (L.limited('v:' + contact, 10, 10 * 60000)) return res.status(429).json({ ok: false, error: 'Too many attempts. Request a new code.' });
  const [p64, sig] = b.token.split('.'); let p; try { p = JSON.parse(Buffer.from(p64 || '', 'base64url').toString()); } catch (e) { p = null; }
  if (!p || p.c !== contact || p.p !== purpose) return res.status(400).json({ ok: false, error: 'That code is not correct.' });
  if (Date.now() > p.e) return res.status(400).json({ ok: false, error: 'The code has expired. Request a new one.' });
  if (!sig || !L.safeEq(sig, L.sign(c.secret, contact, purpose, p.e, String(b.code).trim()))) return res.status(400).json({ ok: false, error: 'That code is not correct.' });
  res.status(200).json({ ok: true });
};
