(async function () {
  const { Server, esc, toast, Speech } = USL;
  const ctx = await USL.boot({ page: 'library', paid: true }); const main = document.getElementById('main');
  const id = new URLSearchParams(location.search).get('id'); const r = Server.getLesson(id);
  if (!r.ok) { main.innerHTML = '<div class="card"><h2>Lesson unavailable</h2><p>' + esc(r.error) + '</p><a class="btn" href="library.html">Back to library</a></div>'; return; }
  const l = r.lesson, db = Server.data(), c = db.classes.find(x => x.id === l.cls), s = db.subjects.find(x => x.id === l.subject);
  Server.touchLesson(l.id);
  const prog = Server.progress()[l.id] || {};
  const siblings = db.lessons.filter(x => x.status === 'published' && x.cls === l.cls && x.subject === l.subject); const idx = siblings.findIndex(x => x.id === l.id), nxt = siblings[idx + 1];
  const readText = () => [l.title + '.', 'Learning outcomes. ' + (l.objectives || []).join('. ') + '.', USL.plain(l.notes), 'Worked example. ' + USL.plain(l.example)].join(' ');
  const badge = l.review === 'sample' ? '<span class="badge warn">Sample notes – not official NCDC text</span>' : l.review === 'reviewed' ? '<span class="badge ok">Reviewed by a teacher/reviewer</span>' : '<span class="badge">Awaiting review</span>';

  main.innerHTML = `<p class="crumbs"><a href="library.html?cls=${esc(l.cls)}">${esc(l.cls)}</a> › <a href="library.html?cls=${esc(l.cls)}&subject=${esc(l.subject)}">${esc(s ? s.name : l.subject)}</a> › ${esc(l.topic)}${l.subtopic ? ' › ' + esc(l.subtopic) : ''}</p>
    <h1>${esc(l.title)}</h1><p>${badge} <span class="badge">Source: ${esc(l.source)}</span></p>
    <div class="card soft" id="speech" aria-label="Listen to this lesson"></div>
    <div class="card mt"><h3>Learning outcomes</h3><ul>${(l.objectives || []).map(o => '<li>' + esc(o) + '</li>').join('')}</ul></div>
    <article class="card mt notes"><h2>Notes</h2>${l.notes}<h3>Worked example</h3><div class="box">${esc(l.example)}</div></article>
    <div class="card mt" id="quizcard"><div class="row between"><h2 class="mb0">Quick quiz</h2><span class="muted small">${(l.quiz || []).length} questions</span></div><div id="quiz" class="mt"></div></div>
    <div class="row mt"><a class="btn orange" href="tutor.html?cls=${esc(l.cls)}&subject=${esc(l.subject)}&q=${encodeURIComponent(l.topic)}">🎙️ Ask the tutor about this</a>${nxt ? '<a class="btn ghost" href="lesson.html?id=' + encodeURIComponent(nxt.id) + '">Next lesson →</a>' : ''}<button class="btn ghost" id="mark">${prog.completed ? '✓ Completed' : 'Mark as complete'}</button></div>`;
  Speech.bar(document.getElementById('speech'), readText);

  const quizEl = document.getElementById('quiz'); const answers = {};
  function renderQuiz(done) {
    quizEl.innerHTML = (l.quiz || []).map((q, i) => '<fieldset style="border:0;padding:0;margin:0 0 16px"><legend><b>' + (i + 1) + '. ' + esc(q.q) + '</b></legend>' + q.o.map((o, k) => {
      let cl = 'opt'; if (done) { if (k === q.a) cl += ' right'; else if (answers[i] === k) cl += ' wrong'; } else if (answers[i] === k) cl += ' sel';
      return '<label class="' + cl + '"><input type="radio" name="q' + i + '" value="' + k + '"' + (answers[i] === k ? ' checked' : '') + (done ? ' disabled' : '') + '><span>' + esc(o) + '</span></label>';
    }).join('') + '</fieldset>').join('') + (done ? '' : '<button class="btn orange" id="sub">Check my answers</button>');
    if (!done) { quizEl.querySelectorAll('input').forEach(inp => inp.onchange = () => { answers[+inp.name.slice(1)] = +inp.value; renderQuiz(false); }); const sb = document.getElementById('sub'); sb.onclick = submit; }
  }
  function submit() {
    const n = (l.quiz || []).length; if (Object.keys(answers).length < n) return toast('Answer all ' + n + ' questions first.', 'bad');
    const score = l.quiz.filter((q, i) => answers[i] === q.a).length; const r = Server.saveQuiz(l.id, score, n); if (!r.ok) return toast(r.error, 'bad');
    renderQuiz(true); const pct = Math.round(score / n * 100);
    quizEl.insertAdjacentHTML('afterbegin', '<div class="alert ' + (pct >= 67 ? 'ok' : 'warn') + '" role="status" style="margin-bottom:14px"><b>You scored ' + score + ' out of ' + n + ' (' + pct + '%).</b> ' + (pct >= 67 ? 'Great work!' : 'Re-read the notes or ask the tutor to explain.') + '</div>');
    document.getElementById('mark').textContent = '✓ Completed';
  }
  if (!(l.quiz || []).length) quizEl.innerHTML = '<p class="muted">No quiz for this lesson yet.</p>'; else renderQuiz(false);
  document.getElementById('mark').onclick = e => { const now = !(Server.progress()[l.id] || {}).completed; Server.markComplete(l.id, now); e.target.textContent = now ? '✓ Completed' : 'Mark as complete'; toast(now ? 'Lesson marked complete.' : 'Marked as not complete.', 'ok'); };
  window.addEventListener('beforeunload', () => Speech.stop());
})();
