(async function () {
  const { Server, esc } = USL;
  const ctx = await USL.boot({ page: 'library' }); const u = ctx.user, main = document.getElementById('main');
  const db = Server.data(), q = new URLSearchParams(location.search);
  let cls = q.get('cls') || u.classId || 'S1', subj = q.get('subject') || '';
  if (!db.classes.find(c => c.id === cls)) cls = db.classes[0].id;
  const progress = Server.progress(); const a = Server.access(u); const open = USL.allowed(a);

  function render() {
    const c = db.classes.find(x => x.id === cls), subs = db.subjects.filter(s => s.classes.includes(cls));
    if (subj && !subs.find(s => s.id === subj)) subj = '';
    const lessons = db.lessons.filter(l => l.status === 'published' && l.cls === cls);
    const doneN = lessons.filter(l => (progress[l.id] || {}).completed).length;
    let html = `<h1>Class library</h1>
      <div class="tabs" role="tablist" aria-label="Class">${db.classes.map(k => '<button class="tab" role="tab" data-c="' + esc(k.id) + '" aria-selected="' + (k.id === cls) + '">' + esc(k.id) + (k.id === u.classId ? ' ★' : '') + '</button>').join('')}</div>
      <div class="card accent"><div class="row between"><div><h2 class="mb0">${esc(c.id)} · ${esc(c.name)}</h2><p class="mb0 muted">${esc(c.focus)}</p></div><div class="right"><b>${doneN}/${lessons.length}</b><br><span class="small muted">lessons completed</span></div></div></div>
      ${!open ? '<div class="alert warn mt" role="status">' + (a.state === 'trial_ready' ? 'You can browse the syllabus freely. To open lessons, <a href="subscription.html">start your free 15-minute trial</a>.' : 'Your access has ended. <a href="subscription.html">Subscribe</a> to open lessons.') + '</div>' : ''}
      <h2 class="mt2">Subjects</h2><div class="grid auto">${subs.map(s => { const n = lessons.filter(l => l.subject === s.id).length; return '<button class="subject-card" data-s="' + s.id + '" aria-pressed="' + (s.id === subj) + '"><b>' + esc(s.name) + '</b><br><span class="muted small">' + n + ' lesson' + (n === 1 ? '' : 's') + '</span></button>'; }).join('') || '<p class="muted">No subjects have been set up for this class.</p>'}</div>`;
    if (subj) {
      const s = subs.find(x => x.id === subj), sy = db.syllabus.find(x => x.classId === cls && x.subjectId === subj) || {};
      const ls = lessons.filter(l => l.subject === subj), topics = [...new Set(ls.map(l => l.topic))];
      html += `<h2 class="mt2">${esc(s.name)} · ${esc(cls)}</h2>
        <div class="card soft"><p class="small mb0"><b>Syllabus reference:</b> ${sy.ref ? esc(sy.ref) + (sy.version ? ' · version ' + esc(sy.version) : '') : '<span class="muted">Official NCDC reference not entered yet. An administrator adds it under Admin → Catalogue.</span>'}${sy.note ? '<br>' + esc(sy.note) : ''}</p></div>
        <div class="stack mt">${topics.map(t => '<div class="card"><h3>' + esc(t) + '</h3><ul class="list">' + ls.filter(l => l.topic === t).map(l => { const p = progress[l.id] || {}; return '<li class="item"><span><a href="lesson.html?id=' + encodeURIComponent(l.id) + '"><b>' + esc(l.title) + '</b></a><br><span class="muted small">' + esc(l.subtopic || '') + '</span> ' + (l.review === 'sample' ? '<span class="badge warn">Sample notes</span>' : l.review === 'reviewed' ? '<span class="badge ok">Reviewed</span>' : '') + '</span><span>' + (p.completed ? '<span class="badge ok">Done' + (p.quiz ? ' · ' + p.quiz.score + '/' + p.quiz.total : '') + '</span>' : open ? '<span class="badge">Not started</span>' : '<span class="badge">🔒</span>') + '</span></li>'; }).join('') + '</ul></div>').join('') || '<div class="card"><p class="muted mb0">No lessons have been published for this subject yet. Content is added by teachers and approved by a reviewer before students can see it.</p></div>'}</div>`;
    }
    main.innerHTML = html;
    main.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cls = b.dataset.c; subj = ''; history.replaceState(null, '', '?cls=' + cls); render(); });
    main.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { subj = b.dataset.s; history.replaceState(null, '', '?cls=' + cls + '&subject=' + subj); render() });
  }
  render();
})();
