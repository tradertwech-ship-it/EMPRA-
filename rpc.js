'use strict';
// POST /api/rpc {m, a, d, t, nv} -> runs one app action on the server and returns {result, view, token, pass}.
const L = require('./_lib'), E = require('./_engine');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const ip = String((req.headers && (req.headers['x-forwarded-for'] || '')) || '').split(',')[0].trim() || 'x';
  if (L.limited('rpc:' + ip, 240, 60000)) return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  const b = await L.body(req); const r = await E.handle(b);
  res.status(r.status).json(r.json);
};
