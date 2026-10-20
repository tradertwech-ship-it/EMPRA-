// api/rpc.js
const fs = require('fs');
const path = require('path');

// 1. Tell USL engine that we are running in Server mode
globalThis.USL_SERVER = true;
globalThis.USL_DEV_EMAIL = process.env.USL_DEV_EMAIL || 'tradertwech@gmail.com';

// 2. Load the main HTML file to extract and execute the embedded USL server logic
let USL;
try {
  const htmlPath = path.join(process.cwd(), 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    // Evaluate the first script tag where the engine is defined
    const scriptCode = scriptMatch[1];
    const runScript = new Function('root', scriptCode);
    runScript(globalThis);
    USL = globalThis.USL;
  }
} catch (e) {
  console.error('Failed to initialize USL engine on server:', e);
}

export default async function handler(req, res) {
  // Set CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!USL || !USL.Server) {
      return res.status(500).json({ error: 'USL Server Engine failed to initialize.' });
    }

    // Initialize/Seed DB if empty
    await USL.Server.init();

    const { m, a } = req.body || {};

    // 1. Handle view sync request
    if (m === 'sync' || !m) {
      const view = USL.Server._view();
      const pass = USL.Server._pass();
      return res.status(200).json({ ok: true, view, pass });
    }

    // 2. Execute requested RPC action
    if (typeof USL.Server[m] === 'function') {
      const result = await USL.Server[m].apply(USL.Server, a || []);
      const view = USL.Server._view();
      const pass = USL.Server._pass();
      return res.status(200).json({ ok: true, result, view, pass });
    }

    return res.status(400).json({ error: 'Unknown server function: ' + m });
  } catch (err) {
    console.error('RPC Error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
