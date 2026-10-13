(async function () {
  const { Server, Gateway, esc, fmtMs, fmtUGX, fmtDate, toast } = USL;
  const ctx = await USL.boot({ page: 'subscription' }); const u = ctx.user, main = document.getElementById('main');
  const qs = new URLSearchParams(location.search); const from = qs.get('from');
  if (u.role !== 'student') { main.innerHTML = '<h1>Subscription</h1><div class="card"><p class="mb0">Staff accounts do not need a subscription.</p></div>'; return; }
  let lastSig = '';
  const sigOf = () => JSON.stringify([Server.access(u).state, Server.myPayments().map(p => p.status)]);
  const statusBadge = s => ({ success: '<span class="badge ok">Paid</span>', pending: '<span class="badge warn">Waiting for confirmation</span>', failed: '<span class="badge bad">Failed</span>', reversed: '<span class="badge bad">Reversed</span>' }[s] || esc(s));

  function render() {
    const cfg = Server.cfg(), a = Server.access(u), pays = Server.myPayments(), pending = pays.find(p => p.status === 'pending');
    const dest = from ? { dashboard: 'dashboard.html', library: 'library.html', papers: 'papers.html', tutor: 'tutor.html' }[from] || 'dashboard.html' : 'dashboard.html';
    let status;
    if (a.state === 'paid') status = '<div class="card"><span class="badge ok">Subscribed</span><h2 style="margin-top:8px">You are all set</h2><p>Access is active until <b>' + fmtDate(a.expires) + '</b> (' + fmtMs(a.msLeft) + ' left). You can renew early — extra days are added after your current period.</p><a class="btn orange" href="' + dest + '">Continue learning</a></div>';
    else if (a.state === 'trial') status = '<div class="card accent"><span class="badge warn">Free trial running</span><h2 style="margin-top:8px"><span id="cd">' + fmtMs(a.msLeft) + '</span> left</h2><p class="mb0">Subscribe now so you don\'t lose access when the timer ends.</p></div>';
    else if (a.state === 'trial_ready') status = '<div class="card accent"><span class="badge orange">One free trial</span><h2 style="margin-top:8px">Try it free for ' + cfg.trialMinutes + ' minutes</h2><p>Full access to lessons, papers, exams and the tutor. The timer starts when you press the button and cannot be reset.</p><button class="btn orange" id="trial">Start my free trial</button></div>';
    else status = '<div class="card accent"><span class="badge bad">' + (a.hadSub ? 'Subscription ended' : 'Free trial used') + '</span><h2 style="margin-top:8px">Subscribe to keep learning</h2><p class="mb0">Your progress and history are saved and will be here when you subscribe.</p></div>';

    main.innerHTML = `<h1>Subscription</h1>
      ${qs.get('need') && !USL.allowed(a) ? '<div class="alert warn" role="status" style="margin-bottom:14px">That page needs an active trial or subscription.</div>' : ''}
      <div class="grid g2">${status}
        <div class="card"><h3>Student plan</h3><p style="font-size:2rem;font-weight:800;margin:0">${fmtUGX(cfg.price)}<span class="muted" style="font-size:1rem;font-weight:600"> / ${cfg.days} days</span></p>
          <ul><li>All S1–S6 lessons, notes and quizzes</li><li>Exam centre and timed simulator</li><li>AI voice tutor (up to ${cfg.aiDailyLimit} questions a day)</li><li>One registered device per account</li></ul></div></div>
      <div class="card mt"><h2>Pay with Mobile Money</h2>
        ${pending ? `<div class="alert warn" role="status"><b>Waiting for confirmation</b> — reference <code>${esc(pending.ref)}</code>, ${esc(pending.provider)} ${esc(pending.phone)}.<br>Approve the payment prompt on your phone. Your plan switches on only after the provider's confirmation reaches our server. A screenshot or SMS forward cannot activate it.</div>` : `
        <form id="pay" novalidate><div class="grid g2"><div class="field"><label for="prov">Provider</label><select id="prov"><option>MTN Mobile Money</option><option>Airtel Money</option></select></div>
          <div class="field"><label for="ph">Mobile money number</label><input id="ph" inputmode="tel" placeholder="0772 123456" value="${u.contact.startsWith('+') ? esc(u.contact) : ''}"></div></div>
          <p class="small" style="background:#eaf1ff;border-radius:12px;padding:10px 12px">Payments are received on <b>${esc(cfg.payNumber)}</b> (${esc(cfg.currency)} ${cfg.price.toLocaleString('en-US')}).</p><button class="btn orange" type="submit">Pay ${fmtUGX(cfg.price)}</button>
          <p class="hint">You will get a prompt on your phone to approve the payment. Prices and duration are set by the administrator.</p></form>`}
      </div>
      ${cfg.sandbox && pending ? `<div class="demo-box mt" id="sandbox"><b>Payment sandbox (prototype only)</b><p class="small">No real money moves here. This box stands in for your Mobile Money provider's server-to-server callback so you can test each outcome. In production, only the provider can send this and the buttons do not exist.</p>
        <div class="row"><button class="btn sm orange" data-s="success">Provider: success</button><button class="btn sm ghost" data-s="failed">Provider: failed</button><button class="btn sm ghost" data-s="dup">Send success again (duplicate)</button><button class="btn sm ghost" data-s="reversed">Provider: reversed</button><button class="btn sm ghost" data-s="forged">Try a fake “screenshot”</button></div></div>` : ''}
      ${cfg.sandbox && !pending && pays.some(p => p.status === 'success') ? '<div class="demo-box mt small"><b>Sandbox:</b> you can also test a reversal on a completed payment: <button class="btn sm ghost" id="revlast">Reverse latest payment</button></div>' : ''}
      <h2 class="mt2">Payment history</h2><div class="tablewrap"><table><thead><tr><th>Date</th><th>Reference</th><th>Provider</th><th>Amount</th><th>Status</th><th>Receipt</th></tr></thead><tbody>${pays.map(p => '<tr><td>' + fmtDate(p.createdAt) + '</td><td><code>' + esc(p.ref) + '</code></td><td>' + esc(p.provider) + '</td><td>' + fmtUGX(p.amount) + '</td><td>' + statusBadge(p.status) + '</td><td>' + (p.status === 'success' ? '<a class="btn sm ghost" target="_blank" rel="noopener" href="' + esc(USL.waLink(USL.normContact(cfg.whatsappNumber), 'Hello, I have paid ' + fmtUGX(p.amount) + ' for Uganda Smart Learning. Name: ' + u.name + '. Reference: ' + p.ref + '.')) + '">Send on WhatsApp</a>' : '') + '</td></tr>').join('') || '<tr><td colspan="6" class="muted">No payments yet.</td></tr>'}</tbody></table></div>`;

    const t = document.getElementById('trial'); if (t) t.onclick = () => { const r = Server.startTrial(); if (!r.ok) return toast(r.error, 'bad'); toast('Trial started — enjoy!', 'ok'); setTimeout(() => { location.href = USL.allowed(Server.access(u)) ? dest : 'dashboard.html'; }, 500); };
    const f = document.getElementById('pay'); if (f) f.onsubmit = e => { e.preventDefault(); const r = Server.initiatePayment(document.getElementById('prov').value, document.getElementById('ph').value); if (!r.ok) return toast(r.error, 'bad'); toast('Payment request created. Approve it on your phone.', 'ok'); lastSig = ''; };
    const sb = document.getElementById('sandbox'); if (sb) sb.onclick = async e => {
      const s = e.target.closest('button') && e.target.closest('button').dataset.s; if (!s) return; const ref = pending.ref; let r;
      if (s === 'forged') r = await Gateway.forged(ref); else if (s === 'dup') { r = await Gateway.simulate(ref, 'success'); if (r.ok && !r.duplicate) { r = await Gateway.simulate(ref, 'success'); } } else r = await Gateway.simulate(ref, s);
      toast(r.ok ? (r.message || 'Done') : r.error, r.ok ? 'ok' : 'bad'); lastSig = '';
    };
    const rv = document.getElementById('revlast'); if (rv) rv.onclick = async () => { const p = Server.myPayments().find(x => x.status === 'success'); const r = await Gateway.simulate(p.ref, 'reversed'); toast(r.ok ? r.message : r.error, r.ok ? 'ok' : 'bad'); lastSig = ''; };
  }
  render(); lastSig = sigOf();
  setInterval(() => { const s = sigOf(); if (s !== lastSig) { lastSig = s; render(); } const cd = document.getElementById('cd'); if (cd) { const a = Server.access(u); if (a.state === 'trial') cd.textContent = fmtMs(a.msLeft); } }, 1000);
})();
