'use strict';
const L = require('./_lib');
// POST /api/tts {text, rate} -> natural-sounding speech (Google Cloud Text-to-Speech, en-GB Neural2) as base64 mp3.
module.exports = async (req, res, deps) => {
  const f = (deps && deps.fetch) || fetch; res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  const key = process.env.GOOGLE_API_KEY || ''; if (!key) return res.status(501).json({ ok: false, error: 'not_configured' });
  const b = await L.body(req);
  if (!(deps && deps.skipPass) && !L.checkPass(L.cfg().secret, b.pass)) return res.status(401).json({ ok: false, error: 'login' });
  const text = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 600); if (!text) return res.status(400).json({ ok: false, error: 'No text.' });
  if (L.limited('tts:' + (req.headers && (req.headers['x-forwarded-for'] || '')), 200, 10 * 60000)) return res.status(429).json({ ok: false, error: 'Too many requests.' });
  const rate = Math.max(0.7, Math.min(1.4, Number(b.rate) || 1)), name = process.env.TTS_VOICE || 'en-GB-Neural2-A';
  try {
    const r = await f('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(key), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { text }, voice: { languageCode: name.split('-').slice(0, 2).join('-'), name }, audioConfig: { audioEncoding: 'MP3', speakingRate: rate } }) });
    if (!r.ok) return res.status(502).json({ ok: false, error: 'voice_failed' });
    const j = await r.json(); res.status(200).json({ ok: !!j.audioContent, audio: j.audioContent || '' });
  } catch (e) { res.status(502).json({ ok: false, error: 'voice_failed' }); }
};
