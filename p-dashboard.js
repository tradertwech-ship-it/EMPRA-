(async function () {
  const { Server, esc, fmtMs, fmtUGX, fmtDate, toast } = USL;
  const ctx = await USL.boot({ page: 'dashboard' }); const u = ctx.user, main = document.getElementById('main');
  const db = Server.data();
  if (u.role !== 'student') {
    main.innerHTML = '<h1>Hello, ' + esc(u.name) + '</h1><div class="card"><p>You are signed in as <b>' + esc(u.role) + '</b>.</p><a class="btn orange" href="admin.html">Open the admin area</a></div>'; return;
  }
  const cls = db.classes.find(c => c.id === u.classId) || db.classes[0];
  const subjects = db.subjects.filter(s => s.classes.includes(cls.id) && (!u.subjects.length || u.subjects.includes(s.id)));
  const progress = Server.progress(), attempts = Server.myAttempts(), weak = Server.weakTopics();
  const lessonsFor = db.lessons.filter(l => l.status === 'published' && l.cls === cls.id);
  const done = Object.entries(progress).filter(([, p]) => p.completed).length;
  const quizzes = Object.values(progress).filter(p => p.quiz); const avg = quizzes.length ? Math.round(quizzes.reduce((s, p) => s + p.quiz.score / p.quiz.total, 0) / quizzes.length * 100) : null;
  const sameDay = t => t && new Date(t).toDateString() === new Date().toDateString();
  const todayDone = Object.values(progress).filter(p => p.completed && sameDay(p.updatedAt)).length;
  const recent = Object.entries(progress).filter(([, p]) => p.lastOpen || p.updatedAt).sort((a, b) => (b[1].lastOpen || b[1].updatedAt) - (a[1].lastOpen || a[1].updatedAt)).map(([id]) => db.lessons.find(l => l.id === id)).filter(l => l && l.status === 'published').slice(0, 5);
  const next = recent[0] ? (lessonsFor.find(l => !(progress[l.id] || {}).completed) || recent[0]) : lessonsFor[0];
  const notes = Server.notifications().filter(n => !n.read);
  const subName = id => (db.subjects.find(s => s.id === id) || {}).name || id;

  function accessCard() {
    const a = Server.access(u), cfg = Server.cfg();
    if (a.state === 'paid') return '<div class="card"><span class="badge ok">Subscribed</span><h3 style="margin-top:8px">Your plan is active</h3><p class="muted mb0">Access until <b>' + fmtDate(a.expires) + '</b> (' + fmtMs(a.msLeft) + ' left).</p></div>';
    if (a.state === 'trial') return '<div class="card accent"><span class="badge warn">Free trial running</span><h3 style="margin-top:8px"><span id="cd">' + fmtMs(a.msLeft) + '</span> left</h3><p class="mb0 small">After the trial, subscribe for ' + fmtUGX(cfg.price) + ' per month to keep going.</p></div>';
    if (a.state === 'trial_ready') return '<div class="card accent"><span class="badge orange">Free trial available</span><h3 style="margin-top:8px">Try everything for ' + cfg.trialMinutes + ' minutes</h3><p class="small">The timer starts when you press the button and cannot be reset or restarted.</p><button class="btn orange" id="trial">Start my free trial</button></div>';
    return '<div class="card accent"><span class="badge bad">' + (a.hadSub ? 'Subscription ended' : 'Trial ended') + '</span><h3 style="margin-top:8px">Subscribe to continue</h3><p class="small">' + fmtUGX(cfg.price) + ' for ' + cfg.days + ' days. Your progress is saved.</p><a class="btn orange" href="subscription.html">Subscribe now</a></div>';
  }

  main.innerHTML = `
    <div class="row between"><div><p class="muted mb0">Welcome back</p><h1 class="mb0">${esc(u.name.split(' ')[0])}</h1></div><span class="badge info">${esc(cls.id)} · ${esc(cls.name)}</span></div>
    <p class="muted">${esc(cls.focus)}</p>
    ${notes.length ? '<div class="alert info" role="status" style="margin-bottom:14px">' + notes.slice(0, 3).map(n => '• ' + esc(n.msg)).join('<br>') + ' <a href="#" id="dismiss">Dismiss</a></div>' : ''}
    <div class="grid g2" style="margin-bottom:14px">
      <div id="access">${accessCard()}</div>
      <div class="card"><div class="row between"><h3 class="mb0">Daily goal</h3><span class="small muted">${Math.min(todayDone, u.dailyGoal)} / ${u.dailyGoal} lessons today</span></div>
        <div class="progress mt" role="progressbar" aria-valuemin="0" aria-valuemax="${u.dailyGoal}" aria-valuenow="${Math.min(todayDone, u.dailyGoal)}"><i style="width:${Math.min(100, todayDone / u.dailyGoal * 100)}%"></i></div>
        <p class="small muted mt mb0">${todayDone >= u.dailyGoal ? 'Goal reached — well done! 🎉' : 'Finish a lesson quiz to count it. Change your goal in Account.'}</p></div>
    </div>
    <div class="grid g4 g-keep2" style="margin-bottom:14px">
      <div class="stat"><b>${done}</b><span>Topics completed</span></div><div class="stat"><b>${avg == null ? '—' : avg + '%'}</b><span>Average quiz score</span></div>
      <div class="stat"><b>${attempts.filter(a => a.status === 'submitted').length}</b><span>Papers practised</span></div><div class="stat"><b>${Server.aiLeft()}</b><span>Tutor questions left today</span></div>
    </div>
    <div class="grid g2">
      <div class="card"><h3>Continue learning</h3>${next ? '<p class="mb0"><b>' + esc(next.title) + '</b><br><span class="muted small">' + esc(subName(next.subject)) + ' · ' + esc(next.topic) + '</span></p><a class="btn orange mt" href="lesson.html?id=' + encodeURIComponent(next.id) + '">' + (progress[next.id] ? 'Resume' : 'Start') + ' lesson</a>' : '<p class="muted mb0">No lessons have been published for your class yet.</p>'}</div>
      <div class="card"><h3>AI voice tutor</h3><p class="muted">Ask a question by voice or text and hear the explanation, using your class notes.</p><a class="btn" href="tutor.html">🎙️ Talk to the tutor</a></div>
    </div>
    <h2 class="mt2">Your subjects</h2>
    <div class="grid auto">${subjects.map(s => { const n = lessonsFor.filter(l => l.subject === s.id).length; return '<a class="subject-card" href="library.html?cls=' + cls.id + '&subject=' + s.id + '"><b>' + esc(s.name) + '</b><br><span class="muted small">' + n + ' lesson' + (n === 1 ? '' : 's') + ' available</span></a>'; }).join('') || '<p class="muted">No subjects set up for this class.</p>'}</div>
    <div class="grid g2 mt2">
      <div><h2>Recent lessons</h2><div class="card"><ul class="list">${recent.map(l => '<li class="item"><span><a href="lesson.html?id=' + encodeURIComponent(l.id) + '">' + esc(l.title) + '</a><br><span class="muted small">' + esc(subName(l.subject)) + '</span></span>' + (progress[l.id] && progress[l.id].completed ? '<span class="badge ok">Done</span>' : '<span class="badge">Open</span>') + '</li>').join('') || '<li class="muted">Nothing yet — open a lesson from the Library.</li>'}</ul></div></div>
      <div><h2>Weak topics</h2><div class="card">${weak.length ? '<ul class="list">' + weak.slice(0, 5).map(w => { const l = db.lessons.find(x => x.topic === w.topic && x.subject === w.subject && x.status === 'published'); return '<li><div class="item"><span><b>' + esc(w.topic) + '</b><br><span class="muted small">' + esc(subName(w.subject)) + ' · ' + w.pct + '% (' + w.got + '/' + w.max + ')</span></span>' + (l ? '<a class="btn sm ghost" href="lesson.html?id=' + encodeURIComponent(l.id) + '">Revise</a>' : '') + '</div></li>'; }).join('') + '</ul>' : '<p class="muted mb0">Take lesson quizzes or practise papers and your weakest topics will appear here.</p>'}</div></div>
    </div>
    <h2 class="mt2">Past-paper practice</h2>
    <div class="card"><ul class="list">${attempts.slice(0, 5).map(a => { const p = db.papers.find(x => x.id === a.paperId); if (!p) return ''; const o = a.objective; return '<li class="item"><span><b>' + esc(p.title) + '</b><br><span class="muted small">' + fmtDate(a.startedAt) + '</span></span>' + (a.status === 'in_progress' ? '<a class="btn sm orange" href="exam.html?paper=' + encodeURIComponent(p.id) + '">Resume</a>' : '<a class="btn sm ghost" href="exam.html?attempt=' + encodeURIComponent(a.id) + '">' + (o && o.scored ? o.got + '/' + o.max + ' · ' : '') + 'Results</a>') + '</li>'; }).join('') || '<li class="muted">You have not tried a paper yet. <a href="papers.html">Open the Exam centre</a>.</li>'}</ul></div>`;

  const t = document.getElementById('trial');
  if (t) t.onclick = () => { const r = Server.startTrial(); if (!r.ok) return toast(r.error, 'bad'); toast('Your free trial has started. Make the most of it!', 'ok'); setTimeout(() => location.reload(), 600); };
  const d = document.getElementById('dismiss'); if (d) d.onclick = e => { e.preventDefault(); Server.markNotificationsRead(); location.reload(); };
  window.addEventListener('usl:tick', e => { const cd = document.getElementById('cd'); if (cd && e.detail.state === 'trial') cd.textContent = fmtMs(e.detail.msLeft); if (e.detail.state === 'expired' && cd) location.reload(); });
})();
