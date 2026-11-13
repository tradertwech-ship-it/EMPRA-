'use strict';
// POST /api/pay-webhook <- Flutterwave. Set the same secret as FLW_SECRET_HASH in Flutterwave (Settings -> Webhooks).
// The webhook body is never trusted: we only take the reference and ask Flutterwave directly what happened.
const L = require('./_lib'), E = require('./_engine');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const c = L.cfg(), sig = (req.headers && (req.headers['verif-hash'] || '')) || '';
  if (!c.flwHash || !L.safeEq(sig, c.flwHash)) return res.status(401).json({ ok: false });
  const b = await L.body(req), ref = b && b.data && (b.data.tx_ref || b.data.txRef) || b.txRef;
  if (ref) { try { await E.gatewayEvent(ref); } catch (e) { return res.status(500).json({ ok: false }); } }
  res.status(200).json({ ok: true });
};
