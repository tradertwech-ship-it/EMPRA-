(async function () {
  const { Server, esc, fmtDate, fmtUGX, toast } = USL;
  const ctx = await USL.boot({ page: 'profile' }); let u = ctx.user; const main = document.getElementById('main'); const db = Server.data();
  const student = u.role === 'student';
  const a = Server.access(u), prog = Server.progress(), atts = Server.myAttempts().filter(x => x.status === 'submitted'), notes = Server.notifications();
  const subName = id => (db.subjects.find(s => s.id === id) || {}).name || id;
  const roleName = { student: 'Student', contributor: 'Teacher / contributor', reviewer: 'Content reviewer', admin: 'Administrator' }[u.role];
  const classSubs = () => db.subjects.filter(s => s.classes.includes(u.classId));
  const accessText = a.state === 'paid' ? 'Subscribed until ' + fmtDate(a.expires) : a.state === 'trial' ? 'Free trial running' : a.state === 'trial_ready' ? 'Free trial not started' : a.state === 'staff' ? 'Staff access' : 'No active plan';

  main.innerHTML = `<h1>My account</h1>
    <div class="grid g2">
      <div class="card"><h3>Details</h3><form id="f" class="stack">
        <div class="field"><label for="n">Name</label><input id="n" value="${esc(u.name)}"></div>
        <p class="small mb0"><b>${esc(u.contact)}</b> · ${esc(roleName)}</p>
        ${student ? `<div class="field"><label for="c">Class</label><select id="c">${db.classes.map(c => '<option value="' + c.id + '"' + (c.id === u.classId ? ' selected' : '') + '>' + esc(c.id + ' – ' + c.name) + '</option>').join('')}</select></div>
        <div class="field"><label for="g">Daily goal (lessons)</label><input id="g" type="number" min="1" max="10" value="${u.dailyGoal || 2}"></div>
        <fieldset style="border:0;padding:0;margin:0"><legend class="small"><b>My subjects</b></legend><div id="subs"></div><p class="hint">Leave all unticked to see every subject for your class.</p></fieldset>` : ''}
        <button class="btn orange" type="submit">Save changes</button></form></div>
      <div class="stack">
        <div class="card"><h3>Registered device</h3><p class="mb0">This account is tied to <b>one device</b>: <code>${esc((u.deviceId || '').slice(-8))}</code>, registered ${fmtDate(u.deviceSince)}.</p>
          <p class="small muted">To use another phone or laptop you must log in there and verify with a one-time code. That signs this device out. If you did not request this, change your password.</p>
          <details class="small"><summary>Demo tool</summary><p>Pretend this browser is a new device (you will be signed out and must log in again to see the device check).</p><button class="btn sm ghost" id="newdev">Simulate another device</button></details></div>
        <div class="card"><h3>Subscription</h3><p>${esc(accessText)}</p><a class="btn ghost" href="subscription.html">${student ? 'Manage subscription' : 'View plans'}</a></div>
        <div class="card"><h3>Privacy</h3><p class="small mb0">We store your name, contact, class, device and learning activity to run the app${u.consentAt ? ' (consent recorded ' + fmtDate(u.consentAt) + ')' : ''}. If you are under 18, a parent or guardian must agree to your use of this app.</p></div>
      </div></div>
    ${student ? `<h2 class="mt2">Learning history</h2><div class="grid g2"><div class="card"><h3>Lessons</h3><ul class="list">${Object.entries(prog).filter(([, p]) => p.completed || p.quiz).map(([id, p]) => { const l = db.lessons.find(x => x.id === id); return l ? '<li class="item"><span><a href="lesson.html?id=' + encodeURIComponent(id) + '">' + esc(l.title) + '</a><br><span class="muted small">' + esc(subName(l.subject)) + '</span></span><span>' + (p.quiz ? '<span class="badge ok">' + p.quiz.score + '/' + p.quiz.total + '</span>' : '<span class="badge">Done</span>') + '</span></li>' : ''; }).join('') || '<li class="muted">No lessons completed yet.</li>'}</ul></div>
      <div class="card"><h3>Exam attempts</h3><ul class="list">${atts.slice(0, 10).map(x => { const p = db.papers.find(y => y.id === x.paperId); const o = x.objective || {}; return p ? '<li class="item"><span>' + esc(p.title) + '<br><span class="muted small">' + fmtDate(x.submittedAt) + '</span></span><a class="btn sm ghost" href="exam.html?attempt=' + encodeURIComponent(x.id) + '">' + (o.scored ? o.got + '/' + o.max : 'View') + '</a></li>' : ''; }).join('') || '<li class="muted">No papers submitted yet.</li>'}</ul></div></div>` : ''}
    <h2 class="mt2">Notifications</h2><div class="card"><ul class="list">${notes.map(n => '<li><span class="small muted">' + fmtDate(n.at) + '</span><br>' + esc(n.msg) + '</li>').join('') || '<li class="muted">Nothing new.</li>'}</ul></div>
    <div class="row mt2"><button class="btn danger" id="out">Log out</button></div>`;

  if (student) {
    const draw = () => { document.getElementById('subs').innerHTML = classSubs().map(s => '<label class="check"><input type="checkbox" value="' + s.id + '"' + (u.subjects.includes(s.id) ? ' checked' : '') + '><span>' + esc(s.name) + '</span></label>').join(''); };
    draw(); document.getElementById('c').onchange = e => { u = Object.assign({}, u, { classId: e.target.value, subjects: [] }); draw(); };
  }
  document.getElementById('f').onsubmit = e => {
    e.preventDefault(); const p = { name: document.getElementById('n').value };
    if (student) { p.classId = document.getElementById('c').value; p.dailyGoal = document.getElementById('g').value; p.subjects = [...document.querySelectorAll('#subs input:checked')].map(i => i.value); }
    const r = Server.updateProfile(p); toast(r.ok ? 'Saved.' : r.error, r.ok ? 'ok' : 'bad'); if (r.ok) setTimeout(() => location.reload(), 500);
  };
  document.getElementById('out').onclick = () => { Server.logout(); location.href = 'index.html'; };
  document.getElementById('newdev').onclick = () => { USL.newDevice(); location.href = 'index.html?msg=' + encodeURIComponent('You are now on a "new device". Log in to see the device verification step.'); };
})();
