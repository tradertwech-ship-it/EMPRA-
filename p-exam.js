(async function () {
  const { Server, Speech, esc, toast, fmtMs, fmtDate, confirmBox } = USL;
  const ctx = await USL.boot({ page: 'papers', paid: true }); const main = document.getElementById('main');
  const qs = new URLSearchParams(location.search), db = Server.data(), L = 'ABCDEF';
  const subName = id => (db.subjects.find(s => s.id === id) || {}).name || id;
  const aiNote = p => p.category === 'AI-generated practice' ? '<div class="alert warn" style="margin-bottom:12px"><b>AI-generated practice paper.</b> Questions and answers were produced for practice and have not been officially verified. This is not a UNEB paper.</div>' : '';
  const fail = m => { main.innerHTML = '<div class="card"><h2>Not available</h2><p>' + esc(m) + '</p><a class="btn" href="papers.html">Back to the exam centre</a></div>'; };

  if (qs.get('attempt')) return results(qs.get('attempt'));
  const pid = qs.get('paper'); if (!pid) return fail('No paper selected.');
  const pr = Server.getPaper(pid); if (!pr.ok) return fail(pr.error); const paper = pr.paper;
  const existing = Server.myAttempts().find(a => a.paperId === pid && a.status === 'in_progress' && a.startedAt + a.durationMs > Date.now());
  const marks = paper.questions.reduce((s, q) => s + q.marks, 0);

  main.innerHTML = `<p class="crumbs"><a href="papers.html">Exam centre</a> › ${esc(subName(paper.subject))}</p><h1>${esc(paper.title)}</h1>${aiNote(paper)}
    <div class="card"><div class="grid g4 g-keep2"><div class="stat"><b>${paper.duration} min</b><span>Time allowed</span></div><div class="stat"><b>${paper.questions.length}</b><span>Questions</span></div><div class="stat"><b>${marks}</b><span>Total marks</span></div><div class="stat"><b>Paper ${paper.paperNo}</b><span>${paper.year} · ${esc(paper.cls)}</span></div></div>
      <h3 class="mt">Instructions</h3><ul><li>${esc(paper.instructions)}</li><li>The timer starts when you press Start and keeps running even if you close the page.</li><li>Your answers are saved automatically. When time ends, the paper is submitted for you.</li><li>${paper.hasGuide ? 'Objective questions are marked automatically. For written questions you compare with the model answer and give yourself marks.' : 'This paper has no marking guide, so it cannot be scored here.'}</li><li>Scores here are for practice only — they are not UNEB results.</li></ul>
      <button class="btn orange" id="start">${existing ? 'Resume exam' : 'I understand — start exam'}</button> <a class="btn ghost" href="papers.html">Cancel</a></div>`;
  document.getElementById('start').onclick = () => { const r = Server.startAttempt(pid); if (!r.ok) return toast(r.error, 'bad'); run(r.attempt); };

  function run(att) {
    const qsn = paper.questions; let cur = 0, dirty = false, submitted = false; const ans = Object.assign({}, att.answers), flags = Object.assign({}, att.flags);
    const end = att.startedAt + att.durationMs;
    main.innerHTML = `<div class="examtop"><div><b>${esc(paper.title)}</b><br><span class="small muted" id="saved">Not saved yet</span></div><div class="row"><span class="timer" id="timer" role="timer" aria-label="Time remaining">--:--</span><button class="btn orange sm" id="submit">Submit</button></div></div>
      <div class="exam-layout"><div class="card" id="q"></div><aside class="card flat"><h3>Questions</h3><div class="qgrid" id="nav"></div><p class="hint">Orange = answered · outlined = flagged for review</p></aside></div>`;
    const isDone = i => { const q = qsn[i], a = ans[q.id]; return q.type === 'mcq' ? typeof a === 'number' : !!(a && String(a).trim()); };
    function draw() {
      const q = qsn[cur];
      document.getElementById('q').innerHTML = `<div class="row between"><span class="badge info">Question ${cur + 1} of ${qsn.length}</span><span class="small muted">${q.marks} mark${q.marks > 1 ? 's' : ''} · ${esc(q.topic)}</span></div>
        <h2 style="margin-top:12px">${esc(q.text)}</h2>
        ${q.type === 'mcq' ? q.o.map((o, i) => '<label class="opt' + (ans[q.id] === i ? ' sel' : '') + '"><input type="radio" name="o" value="' + i + '"' + (ans[q.id] === i ? ' checked' : '') + '><span><b>' + L[i] + '.</b> ' + esc(o) + '</span></label>').join('') : '<label for="w" class="small muted">Write your answer. Show your working where needed.</label><textarea id="w" rows="8">' + esc(ans[q.id] || '') + '</textarea>'}
        <div class="row between mt"><label class="check" style="margin:0"><input type="checkbox" id="fl"${flags[q.id] ? ' checked' : ''}><span>Flag for review</span></label><button class="btn ghost sm" id="rd">🔊 Read question aloud</button></div>
        <div class="row mt"><button class="btn ghost" id="prev"${cur === 0 ? ' disabled' : ''}>← Previous</button><button class="btn" id="next"${cur === qsn.length - 1 ? ' disabled' : ''}>Next →</button></div>`;
      document.getElementById('nav').innerHTML = qsn.map((x, i) => '<button class="qn' + (isDone(i) ? ' done' : '') + (i === cur ? ' cur' : '') + (flags[x.id] ? ' flag' : '') + '" data-i="' + i + '" aria-label="Question ' + (i + 1) + (isDone(i) ? ', answered' : '') + '">' + (i + 1) + '</button>').join('');
      document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { cur = +b.dataset.i; draw(); });
      document.querySelectorAll('input[name=o]').forEach(r => r.onchange = () => { ans[q.id] = +r.value; mark(); draw(); });
      const w = document.getElementById('w'); if (w) w.oninput = () => { ans[q.id] = w.value; mark(true); };
      document.getElementById('fl').onchange = e => { flags[q.id] = e.target.checked; mark(); draw(); };
      document.getElementById('prev').onclick = () => { cur--; draw(); }; document.getElementById('next').onclick = () => { cur++; draw(); };
      document.getElementById('rd').onclick = () => Speech.supported() ? Speech.speak('Question ' + (cur + 1) + '. ' + q.text + ' ' + (q.o || []).map((o, i) => 'Option ' + L[i] + ': ' + o + '.').join(' ')) : toast('Read-aloud is not supported in this browser.', 'bad');
    }
    let t0; const mark = soft => { dirty = true; clearTimeout(t0); t0 = setTimeout(save, 600); if (soft) { const n = document.querySelectorAll('#nav button'); n.forEach((b, i) => b.classList.toggle('done', isDone(i))); } };
    function save() { if (!dirty || submitted) return; const r = Server.saveAnswers(att.id, ans, flags); if (r.ok) { dirty = false; document.getElementById('saved').textContent = 'Saved ' + new Date(r.savedAt).toLocaleTimeString(); } else if (!/Time is up/.test(r.error)) document.getElementById('saved').textContent = r.error; }
    setInterval(save, 15000); window.addEventListener('beforeunload', () => { dirty = true; save(); Speech.stop(); }); window.addEventListener('usl:locked', () => { dirty = true; save(); });
    function finish(auto) { if (submitted) return; submitted = true; Speech.stop(); const r = Server.submitAttempt(att.id, ans, flags); if (!r.ok) { submitted = false; return toast(r.error, 'bad'); } if (auto) toast('Time is up — your paper was submitted.', 'ok'); location.href = 'exam.html?attempt=' + encodeURIComponent(att.id); }
    const tm = document.getElementById('timer'); const tick = () => { const left = end - Date.now(); tm.textContent = fmtMs(left); tm.classList.toggle('low', left < 5 * 60000 || left < att.durationMs * .1); if (left <= 0) finish(true); }; tick(); setInterval(tick, 1000);
    document.getElementById('submit').onclick = async () => {
      const un = qsn.filter((_, i) => !isDone(i)).length, fl = Object.values(flags).filter(Boolean).length;
      if (await confirmBox((un ? '<b>' + un + ' unanswered</b> question' + (un > 1 ? 's' : '') + '. ' : 'All questions answered. ') + (fl ? fl + ' flagged. ' : '') + 'After submitting you cannot change your answers.', { title: 'Submit your paper?', ok: 'Submit now' })) { dirty = true; save(); finish(false); }
    };
    draw(); save();
  }

  function results(aid) {
    const ar = Server.getAttempt(aid); if (!ar.ok) return fail(ar.error); let a = ar.attempt;
    if (a.status === 'in_progress') { location.replace('exam.html?paper=' + encodeURIComponent(a.paperId)); return; }
    const pr = Server.getPaper(a.paperId); if (!pr.ok) return fail('This paper is no longer available. ' + pr.error); const p = pr.paper;
    function draw() {
      const o = a.objective || {}, structs = p.questions.filter(q => q.type === 'struct'), sm = a.selfMarks || {};
      const structMax = p.hasGuide ? structs.reduce((s, q) => s + q.marks, 0) : 0, structGot = structs.reduce((s, q) => s + (sm[q.id] || 0), 0), markedAll = structs.every(q => sm[q.id] != null);
      const total = (o.got || 0) + structGot, max = (o.max || 0) + structMax;
      const topics = Object.entries(a.topicStats || {}).map(([k, v]) => ({ subject: k.split('|')[0], topic: k.split('|')[1], got: v.got, max: v.max, pct: v.max ? Math.round(v.got / v.max * 100) : 0 })).sort((x, y) => x.pct - y.pct);
      const weak = topics.filter(t => t.pct < 50);
      main.innerHTML = `<p class="crumbs"><a href="papers.html">Exam centre</a> › Results</p><h1>${esc(p.title)}</h1>${aiNote(p)}
        <div class="card ${o.scored || structMax ? 'accent' : ''}"><p class="mb0 muted small">Submitted ${fmtDate(a.submittedAt)}</p>
          ${p.hasGuide && (o.scored || structMax) ? '<h2 style="margin:6px 0">' + (markedAll || !structMax ? total + ' / ' + max + ' (' + Math.round(total / max * 100) + '%)' : 'Objective: ' + o.got + ' / ' + o.max) + '</h2><div class="progress ' + (total / max >= .5 ? 'ok' : 'bad') + '"><i style="width:' + Math.round(total / max * 100) + '%"></i></div>' + (!markedAll && structMax ? '<p class="small mt mb0">Written questions (' + structMax + ' marks) are not counted yet. Compare with the model answers below and enter your own marks.</p>' : '') : '<h2 style="margin:6px 0">Answers saved</h2><p class="mb0">This paper has no marking guide, so it cannot be scored here. Check your answers with your teacher.</p>'}
          <p class="hint mt mb0">Practice score only — not an official UNEB result.</p></div>
        ${topics.length ? '<h2 class="mt2">Performance by topic</h2><div class="card">' + topics.map(t => '<div class="bar"><span>' + esc(t.topic) + '</span><div class="progress ' + (t.pct < 50 ? 'bad' : t.pct >= 75 ? 'ok' : '') + '"><i style="width:' + t.pct + '%"></i></div><b>' + t.pct + '%</b></div>').join('') + '</div>' : ''}
        ${weak.length ? '<div class="card accent mt"><h3>Revise next</h3><ul class="list">' + weak.map(t => { const l = db.lessons.find(x => x.status === 'published' && x.subject === t.subject && x.topic.toLowerCase() === t.topic.toLowerCase()); return '<li class="item"><span><b>' + esc(t.topic) + '</b> <span class="muted small">(' + t.pct + '%)</span></span>' + (l ? '<a class="btn sm orange" href="lesson.html?id=' + encodeURIComponent(l.id) + '">Open lesson</a>' : '<a class="btn sm ghost" href="tutor.html?cls=' + esc(p.cls) + '&subject=' + esc(p.subject) + '&q=' + encodeURIComponent(t.topic) + '">Ask the tutor</a>') + '</li>'; }).join('') + '</ul></div>' : ''}
        <h2 class="mt2">Review your answers</h2><p class="small muted">${esc(p.hasGuide ? (p.verified ? 'Marking guide supplied by the source.' : p.category === 'AI-generated practice' ? 'Model answers are AI-generated and not officially verified.' : 'Marking guide not yet verified.') : '')}</p>
        <div class="stack" id="review">${p.questions.map((q, i) => {
          const ans = a.answers[q.id];
          if (q.type === 'mcq') return '<div class="card"><b>' + (i + 1) + '. ' + esc(q.text) + '</b> <span class="muted small">[' + q.marks + ']</span><div class="mt">' + q.o.map((x, k) => { let c = 'opt'; if (typeof q.a === 'number') { if (k === q.a) c += ' right'; else if (ans === k) c += ' wrong'; } else if (ans === k) c += ' sel'; return '<div class="' + c + '"><b>' + L[k] + '.</b> ' + esc(x) + (ans === k ? ' <span class="badge">your answer</span>' : '') + '</div>'; }).join('') + '</div>' + (ans == null ? '<p class="small muted mb0">You did not answer this question.</p>' : '') + '</div>';
          return '<div class="card"><b>' + (i + 1) + '. ' + esc(q.text) + '</b> <span class="muted small">[' + q.marks + ']</span><p class="small muted mt mb0">Your answer</p><div class="card soft" style="white-space:pre-wrap">' + (ans ? esc(ans) : '<i class="muted">No answer written.</i>') + '</div>' + (p.hasGuide && q.model ? '<div class="model small"><b>Model answer</b><br>' + esc(q.model).replace(/\n/g, '<br>') + '</div><div class="row mt"><label class="small" style="margin:0" for="m' + q.id + '">Your marks (0–' + q.marks + ')</label><input id="m' + q.id + '" data-q="' + q.id + '" type="number" min="0" max="' + q.marks + '" step="0.5" style="width:90px" value="' + (sm[q.id] != null ? sm[q.id] : '') + '"></div>' : '') + '</div>';
        }).join('')}</div>
        <div class="row mt">${structMax ? '<button class="btn orange" id="sm">Save my marks</button>' : ''}<a class="btn" href="exam.html?paper=${encodeURIComponent(p.id)}">Try again</a><a class="btn ghost" href="papers.html">More papers</a></div>`;
      const b = document.getElementById('sm'); if (b) b.onclick = () => { const m = {}; document.querySelectorAll('[data-q]').forEach(i => { m[i.dataset.q] = i.value; }); const r = Server.selfMark(a.id, m); if (!r.ok) return toast(r.error, 'bad'); a = r.attempt; toast('Marks saved.', 'ok'); draw(); window.scrollTo(0, 0); };
    }
    draw();
  }
})();
