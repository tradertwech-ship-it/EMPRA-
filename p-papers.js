(async function () {
  const { Server, esc, modal } = USL;
  const ctx = await USL.boot({ page: 'papers' }); const u = ctx.user, main = document.getElementById('main');
  const db = Server.data(); const open = USL.allowed(Server.access(u));
  const pubs = db.papers.filter(p => p.status === 'published');
  const subName = id => (db.subjects.find(s => s.id === id) || {}).name || id;
  const verLabel = p => p.verified ? ['ok', 'Verified'] : p.category === 'AI-generated practice' ? ['warn', 'AI-generated practice · unverified'] : ['warn', 'Unverified'];
  const guideLabel = p => p.category === 'Official UNEB past paper' && p.verified ? 'Official marking scheme' : p.category === 'AI-generated practice' ? 'AI-generated answers — NOT officially verified' : p.verified ? 'Guide supplied by the source and checked by a platform reviewer' : 'Unverified guide';
  const uniq = (f, sort) => { const v = [...new Set(pubs.map(f))]; return sort ? v.sort(sort) : v.sort(); };
  const F = { q: '', level: '', cls: '', subject: '', year: '', paperNo: '', org: '', category: '', guide: '', ver: '' };
  const sel = (id, label, opts) => '<div><label for="f-' + id + '">' + label + '</label><select id="f-' + id + '" data-k="' + id + '"><option value="">Any</option>' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (F[id] === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></div>';

  main.innerHTML = `<h1>Candidate exam centre</h1>
    <p class="muted">Practise UCE (S4) and UACE (S6) style papers. Only papers that exist and are approved for publishing are listed. Always check the label: <b>AI-generated practice is not an official UNEB paper.</b></p>
    <div class="card"><div class="field"><label for="f-q">Search</label><input id="f-q" data-k="q" type="search" placeholder="Title or subject…"></div>
      <div class="grid g4" id="filters"></div><div class="row mt"><button class="btn sm ghost" id="clear">Clear filters</button><span class="muted small" id="count"></span></div></div>
    <div id="list" class="grid auto mt" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))"></div>`;

  function filters() {
    document.getElementById('filters').innerHTML =
      sel('level', 'Level', uniq(p => p.level).map(v => [v, v === 'UCE' || v === 'UACE' ? v : v])) +
      sel('cls', 'Class', uniq(p => p.cls).map(v => [v, v])) +
      sel('subject', 'Subject', uniq(p => p.subject).map(v => [v, subName(v)])) +
      sel('year', 'Year', uniq(p => p.year, (a, b) => b - a).map(v => [v, v])) +
      sel('paperNo', 'Paper number', uniq(p => p.paperNo, (a, b) => a - b).map(v => [v, 'Paper ' + v])) +
      sel('org', 'Source organisation', uniq(p => p.org).map(v => [v, v])) +
      sel('category', 'Category', uniq(p => p.category).map(v => [v, v])) +
      sel('guide', 'Marking guide', [['yes', 'Available'], ['no', 'Not available']]) +
      sel('ver', 'Verification', [['verified', 'Verified'], ['unverified', 'Unverified'], ['ai', 'AI-generated practice']]);
    document.querySelectorAll('#filters select').forEach(s => s.onchange = () => { F[s.dataset.k] = s.value; list(); });
  }
  function match(p) {
    const q = F.q.trim().toLowerCase(); if (q && !(p.title + ' ' + subName(p.subject)).toLowerCase().includes(q)) return false;
    if (F.level && p.level !== F.level) return false; if (F.cls && p.cls !== F.cls) return false; if (F.subject && p.subject !== F.subject) return false;
    if (F.year && String(p.year) !== F.year) return false; if (F.paperNo && String(p.paperNo) !== F.paperNo) return false; if (F.org && p.org !== F.org) return false; if (F.category && p.category !== F.category) return false;
    if (F.guide === 'yes' && !p.hasGuide) return false; if (F.guide === 'no' && p.hasGuide) return false;
    if (F.ver === 'verified' && !p.verified) return false; if (F.ver === 'unverified' && (p.verified || p.category === 'AI-generated practice')) return false; if (F.ver === 'ai' && p.category !== 'AI-generated practice') return false;
    return true;
  }
  function list() {
    const rows = pubs.filter(match).sort((a, b) => b.year - a.year || a.cls.localeCompare(b.cls) || a.paperNo - b.paperNo);
    document.getElementById('count').textContent = rows.length + ' of ' + pubs.length + ' papers';
    const inprog = new Set(Server.myAttempts().filter(a => a.status === 'in_progress').map(a => a.paperId));
    document.getElementById('list').innerHTML = rows.map(p => {
      const [vc, vt] = verLabel(p), marks = p.questions.reduce((s, q) => s + q.marks, 0);
      return `<article class="card"><div class="row" style="gap:6px;margin-bottom:8px"><span class="badge info">${esc(p.level || p.cls)}</span><span class="badge">${esc(p.cls)}</span><span class="badge">Paper ${p.paperNo}</span><span class="badge">${p.year}</span></div>
        <h3>${esc(p.title)}</h3><p class="small muted mb0">${esc(subName(p.subject))} · ${p.questions.length} questions · ${marks} marks · ${p.duration} min</p>
        <p class="small muted">${esc(p.category)} · ${esc(p.org)}</p>
        <p><span class="badge ${vc}">${vt}</span> <span class="badge ${p.hasGuide ? 'ok' : ''}">${p.hasGuide ? 'Marking guide' : 'No marking guide'}</span></p>
        <div class="row"><a class="btn orange sm" href="exam.html?paper=${encodeURIComponent(p.id)}">${inprog.has(p.id) ? 'Resume exam' : '⏱ Start timed exam'}</a><button class="btn ghost sm" data-g="${esc(p.id)}" ${p.hasGuide ? '' : 'disabled'}>Marking guide</button></div></article>`;
    }).join('') || '<div class="card"><p class="muted mb0">No papers match these filters. Papers are only listed once an administrator has confirmed the platform may distribute them.</p></div>';
    document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => guide(b.dataset.g));
  }
  function guide(id) {
    const r = Server.getPaper(id); if (!r.ok) return modal('<h3>Marking guide</h3><p>' + (open ? esc(r.error) : 'Marking guides are paid content. <a href="subscription.html">Start your free trial or subscribe</a> to view them.') + '</p><button class="btn" onclick="this.closest(\'.overlay\').remove()">Close</button>');
    const p = r.paper; const L = 'ABCDEF';
    modal('<h3>' + esc(p.title) + ' — marking guide</h3><div class="alert ' + (p.verified ? 'ok' : 'warn') + '" style="margin-bottom:12px"><b>' + esc(guideLabel(p)) + '</b></div>' + p.questions.map((q, i) => '<div class="card flat" style="margin-bottom:10px"><b>' + (i + 1) + '. ' + esc(q.text) + '</b> <span class="muted small">[' + q.marks + ' mark' + (q.marks > 1 ? 's' : '') + ' · ' + esc(q.topic) + ']</span><div class="model small">' + (q.type === 'mcq' ? (typeof q.a === 'number' ? 'Answer: <b>' + L[q.a] + '. ' + esc(q.o[q.a]) + '</b>' : 'No key supplied.') : (q.model ? esc(q.model).replace(/\n/g, '<br>') : 'No model answer supplied.')) + '</div></div>').join('') + '<button class="btn" onclick="this.closest(\'.overlay\').remove()">Close</button>', { wide: true });
  }
  filters(); list();
  document.getElementById('f-q').oninput = e => { F.q = e.target.value; list(); };
  document.getElementById('clear').onclick = () => { Object.keys(F).forEach(k => F[k] = ''); document.getElementById('f-q').value = ''; filters(); list(); };
})();
