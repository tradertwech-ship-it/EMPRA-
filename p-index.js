(async function () {
  const { Server, esc, toast } = USL;
  await USL.ready; const main = document.getElementById('main');
  document.body.classList.add('land'); main.className = '';
  const db = Server.data(), cu = Server.currentUser(), cfg = Server.cfg();
  const msg = new URLSearchParams(location.search).get('msg');
  const classOpts = db.classes.map(c => '<option value="' + c.id + '">' + esc(c.id + ' – ' + c.name) + '</option>').join('');
  const home = u => (u.role === 'student' ? 'dashboard.html' : 'admin.html');
  const lessons = db.lessons.filter(l => l.status === 'published');
  const subName = id => (db.subjects.find(s => s.id === id) || {}).name || id;
  const icons = { S1: '🌱', S2: '🔬', S3: '🧭', S4: '🎯', S5: '🚀', S6: '🏆' };

  main.innerHTML = `<div class="sheet">
  <nav class="l-nav" aria-label="Main"><a class="brand" href="index.html"><span class="logo" aria-hidden="true">🎓</span><span>Uganda Smart Learning</span></a>
    <div class="links"><a href="#classes">Classes</a><a href="#why">Features</a><a href="#how">How it works</a><a href="#join">Pricing</a></div>
    <div class="btns">${cu.user ? '<a class="btn orange sm pillbtn" href="' + home(cu.user) + '">Continue →</a>' : '<button class="btn ghost sm pillbtn" data-go="in">Log in</button><button class="btn orange sm pillbtn" data-go="up">Sign up free</button>'}</div></nav>
  <section class="l-hero">
    <div><p><span class="badge orange">S1 – S6 · UCE &amp; UACE</span></p>
      <h1>Develop your marks in a <span>smarter way</span></h1>
      <p class="lead">Notes for every class, past-paper style practice for candidates, timed exams, and a voice tutor that explains topics from approved notes. Light on data and made for phones.</p>
      <div class="row" style="margin-top:20px"><button class="btn orange pillbtn" data-go="up">Start free 15-minute trial</button><a class="btn ghost pillbtn" href="#why">See what's inside</a></div>
      <p class="small muted" style="margin-top:14px">No payment needed to try. Then UGX ${cfg.price.toLocaleString('en-US')} per month.</p></div>
    <div class="l-art" aria-hidden="true"><div class="blob">🎓</div><div class="fl a">🎙️ Voice tutor</div><div class="fl b">📝 Past-paper practice</div><div class="fl c">📚 S1 – S6 notes</div></div>
  </section>
  <div class="band" aria-label="Subjects">${db.subjects.slice(0, 8).map(s => '<span>' + esc(s.name) + '</span>').join('')}</div>

  <section class="l-sec"><h2>Search lessons</h2><p class="sub">See what's available. Create a free account to open a lesson.</p>
    <div class="searchbar" role="search"><input id="q" type="search" placeholder="Try “quadratic”, “cell”, “Ohm”…" aria-label="Search lessons"><button class="btn orange pillbtn" id="qb">Search</button></div>
    <div class="grid auto" id="results" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))"></div></section>

  <section class="l-sec" id="why"><div class="benefit"><div class="artgrid" aria-hidden="true"><div>📚</div><div>🎙️</div><div>📝</div><div>📈</div></div>
    <div><h2 style="text-align:left">Benefits from our learning platform</h2>
      <div class="feature"><div class="ico" aria-hidden="true">📚</div><div><h3>S1–S6 Learning Centre</h3><p>Topic notes, worked examples, quizzes and progress tracking for each class.</p></div></div>
      <div class="feature"><div class="ico" aria-hidden="true">📝</div><div><h3>Candidate Exam Centre</h3><p>Filter papers by level, subject, year, paper number and source. Timed simulator with topic reports.</p></div></div>
      <div class="feature"><div class="ico" aria-hidden="true">🎙️</div><div><h3>AI Voice Teacher</h3><p>Listen to lessons, ask by voice, and hear explanations with pause, replay and speed control.</p></div></div>
      <div class="feature"><div class="ico" aria-hidden="true">🔒</div><div><h3>Simple, secure access</h3><p>One registered device per account and payments confirmed by your Mobile Money provider.</p></div></div></div></div></section>

  <section class="l-sec" id="classes"><h2>Choose your class</h2><p class="sub">Every class has its own subjects, notes and revision.</p>
    <div class="grid auto" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${db.classes.map(c => '<div class="ccard"><div class="thumb" aria-hidden="true">' + (icons[c.id] || '📘') + ' ' + esc(c.id) + '</div><h3>' + esc(c.name) + '</h3><p class="small muted">' + esc(c.focus) + '</p><p class="mb0"><span class="badge info">' + esc(c.level) + '</span> <span class="badge">' + lessons.filter(l => l.cls === c.id).length + ' sample lessons</span></p></div>').join('')}</div></section>

  <section class="l-sec" id="how"><h2>How it works</h2><p class="sub">From sign-up to exam practice in a few minutes.</p>
    <div class="grid g4 steps" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))"><div class="step"><h3>Create your account</h3><p>Use your phone or email and pick your class.</p></div><div class="step"><h3>Try it free</h3><p>One ${cfg.trialMinutes}-minute trial of everything.</p></div><div class="step"><h3>Learn and practise</h3><p>Lessons, quizzes, timed papers and the voice tutor.</p></div><div class="step"><h3>Subscribe</h3><p>Pay with MTN Mobile Money or Airtel Money to keep going.</p></div></div></section>

  <section class="l-sec" id="join" style="padding-bottom:44px"><h2>Join today</h2><p class="sub">Create your account and start your free trial.</p>
    <div class="grid g2" style="align-items:start;max-width:920px;margin:0 auto">
      <div class="price"><span class="badge orange">Student plan</span><b class="big">UGX ${cfg.price.toLocaleString('en-US')}</b><span class="muted">per ${cfg.days} days</span><br>
        <ul><li>All S1–S6 lessons, notes and quizzes</li><li>Exam centre and timed simulator</li><li>AI voice tutor (${cfg.aiDailyLimit} questions a day)</li><li>One free ${cfg.trialMinutes}-minute trial first</li></ul><p class="small muted mb0">Pay by MTN Mobile Money or Airtel Money. Your plan switches on only after the payment is confirmed.</p></div>
      <div class="card" id="authcard">${msg ? '<div class="alert warn" role="alert" style="margin-bottom:12px">' + esc(msg) + '</div>' : ''}
        <div class="tabs" role="tablist" aria-label="Account"><button class="tab" role="tab" id="t-up" aria-selected="true">Sign up</button><button class="tab" role="tab" id="t-in" aria-selected="false">Log in</button></div><div id="panel"></div></div></div></section>

  <div class="cta"><div><h2>Are you a teacher?</h2><p>Contribute notes and practice papers. Everything you submit is checked by a reviewer before students see it, and only material you are allowed to share is published.</p><button class="btn ghost pillbtn" data-go="in">Staff log in</button></div>
    <ul><li>Share your own lessons and quizzes</li><li>Add papers you are authorised to distribute</li><li>Reviewed before publishing</li></ul></div>

  <section class="l-sec" style="padding-top:0"><div class="card soft"><details><summary><b>Demo tools</b> <span class="muted small">(prototype only)</span></summary><div class="stack small" style="margin-top:10px">
    <p class="mb0">This prototype runs in your browser and stands in for a real server. One-time codes appear on screen instead of SMS/email. Staff demo logins:</p>
    <ul><li>Administrator: <code>admin@usl.demo</code> / <code>Admin@123</code></li><li>Reviewer: <code>reviewer@usl.demo</code> / <code>Review@123</code></li><li>Teacher (contributor): <code>teacher@usl.demo</code> / <code>Teach@123</code></li></ul>
    <div class="row"><button class="btn sm ghost" id="newdev">Pretend this is a different device</button><button class="btn sm ghost" id="reset">Reset all demo data</button></div></div></details></div></section>
  <footer class="l-foot">Sample learning content only — not official NCDC syllabus text or UNEB papers. © Uganda Smart Learning</footer></div>`;

  const panel = document.getElementById('panel');
  const tabs = { up: document.getElementById('t-up'), in: document.getElementById('t-in') };
  const sel = k => { Object.entries(tabs).forEach(([n, b]) => b.setAttribute('aria-selected', n === k)); k === 'up' ? signup() : login(); };
  tabs.up.onclick = () => sel('up'); tabs.in.onclick = () => sel('in');
  main.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { sel(b.dataset.go); document.getElementById('join').scrollIntoView({ behavior: 'smooth' }); });

  const results = document.getElementById('results');
  function search() {
    const q = document.getElementById('q').value.trim().toLowerCase();
    const rows = (q ? lessons.filter(l => (l.title + ' ' + l.topic + ' ' + l.subtopic + ' ' + subName(l.subject)).toLowerCase().includes(q)) : lessons).slice(0, 6);
    results.innerHTML = rows.map(l => '<div class="ccard"><span class="badge info">' + esc(l.cls) + '</span> <span class="badge">' + esc(subName(l.subject)) + '</span><h3 style="margin-top:8px">' + esc(l.title) + '</h3><p class="small muted">' + esc(l.topic) + '</p><button class="btn sm orange pillbtn" data-open>Open lesson</button></div>').join('') || '<p class="muted center" style="grid-column:1/-1">No lesson matches yet.</p>';
    results.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { toast(cu.user ? 'Opening your dashboard…' : 'Create a free account to open lessons.', 'ok'); if (cu.user) location.href = 'library.html'; else { sel('up'); document.getElementById('join').scrollIntoView({ behavior: 'smooth' }); } });
  }
  document.getElementById('qb').onclick = search; document.getElementById('q').oninput = search; search();

  const demoCode = (code, why) => '<div class="demo-box small" style="margin-bottom:12px"><b>DEMO CODE: ' + esc(code) + '</b><br>In the real app this ' + esc(why) + ' is sent by SMS/email and never shown here.</div>';
  const errBox = m => '<div class="alert bad" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>';
  const val = id => document.getElementById(id).value;

  function signup(e) {
    panel.innerHTML = `${e ? errBox(e) : ''}<form id="f" novalidate>
      <div class="field"><label for="n">Full name</label><input id="n" autocomplete="name" required></div>
      <div class="field"><label for="c">Class</label><select id="c">${classOpts}</select></div>
      <div class="field"><label for="k">Phone number or email</label><input id="k" autocomplete="username" inputmode="email" placeholder="0772 123456 or you@example.com" required></div>
      <div class="field"><label for="p">Password</label><input id="p" type="password" autocomplete="new-password" required><div class="hint">At least 8 characters, with letters and numbers.</div></div>
      <div class="field"><label for="s">School code <span class="muted">(optional)</span></label><input id="s" placeholder="If your school gave you one"><div class="hint">A phone number or email does not prove who you are; schools can verify students with this code.</div></div>
      <div class="field"><label class="check"><input type="checkbox" id="cs"><span>I am 18 or older, or my parent/guardian agrees that I may use this app and that my name, class and learning activity are stored to run it.</span></label></div>
      <button class="btn orange block" type="submit">Create account</button></form>`;
    document.getElementById('f').onsubmit = async ev => {
      ev.preventDefault(); ev.target.querySelector('button').disabled = true;
      const r = await Server.register({ name: val('n'), classId: val('c'), contact: val('k'), password: val('p'), schoolCode: val('s'), consent: document.getElementById('cs').checked });
      if (!r.ok) return signup(r.error); otp('verify', r.contact, r.demoOtp);
    };
  }
  function otp(kind, contact, code, e) {
    const t = kind === 'verify' ? ['Verify your account', 'Enter the 6-digit code sent to ' + contact + '.'] : ['Verify this new device', 'This account is registered to another device. Enter the 6-digit code sent to ' + contact + ' to move it here. The old device will be signed out.'];
    panel.innerHTML = `${e ? errBox(e) : ''}<h2 style="text-align:left">${t[0]}</h2><p class="muted">${esc(t[1])}</p>${code ? demoCode(code, 'code') : ''}
      <form id="o"><div class="field"><label for="code">6-digit code</label><input id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></div>
      <button class="btn orange block" type="submit">Continue</button></form><p class="center small"><a href="#" id="again">Send a new code</a> · <a href="#" id="back">Back</a></p>`;
    document.getElementById('o').onsubmit = async ev => {
      ev.preventDefault(); const c = val('code');
      const r = kind === 'verify' ? await Server.verifyRegistration(contact, c) : await Server.completeTransfer(contact, c);
      if (!r.ok) return otp(kind, contact, null, r.error); location.href = r.role === 'student' ? 'dashboard.html' : 'admin.html';
    };
    document.getElementById('again').onclick = async ev => { ev.preventDefault(); const r = await Server.resendCode(contact, kind); otp(kind, contact, r.demoOtp); };
    document.getElementById('back').onclick = ev => { ev.preventDefault(); sel('in'); };
  }
  function login(e) {
    panel.innerHTML = `${e ? errBox(e) : ''}<form id="f" novalidate>
      <div class="field"><label for="k">Phone number or email</label><input id="k" autocomplete="username" inputmode="email" required></div>
      <div class="field"><label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required></div>
      <button class="btn orange block" type="submit">Log in</button></form>`;
    document.getElementById('f').onsubmit = async ev => {
      ev.preventDefault(); const r = await Server.login(val('k'), val('p'));
      if (!r.ok) return login(r.error);
      if (r.needsVerify) return otp('verify', r.contact, r.demoOtp);
      if (r.needsTransfer) return otp('transfer', r.contact, r.demoOtp);
      location.href = r.role === 'student' ? 'dashboard.html' : 'admin.html';
    };
  }
  signup();
  document.getElementById('newdev').onclick = () => { USL.newDevice(); toast('This browser now acts as a new device. Log in to see the device check.', 'ok'); };
  document.getElementById('reset').onclick = async () => { if (await USL.confirmBox('This deletes every account, payment and attempt stored in this browser and restores the sample content.', { danger: true, ok: 'Reset everything' })) { await Server.resetDemo(); location.href = 'index.html'; } };
})();
