(async function () {
  const { Server, AI, Speech, esc, toast } = USL;
  const ctx = await USL.boot({ page: 'tutor', paid: true }); const u = ctx.user, main = document.getElementById('main');
  const db = Server.data(), qs = new URLSearchParams(location.search);
  let cls = qs.get('cls') || u.classId || 'S4', subj = qs.get('subject') || '';
  if (!db.classes.find(c => c.id === cls)) cls = db.classes[0].id;
  let lastLesson = null, lastBot = '', quiz = null, rec = null;
  const subName = id => (db.subjects.find(s => s.id === id) || {}).name || id;

  main.innerHTML = `<h1>AI voice tutor</h1>
    <p class="muted">Answers come from the approved notes for the class and subject you choose. If the notes don't cover your question, the tutor says so instead of guessing.</p>
    <div class="grid g3" style="margin-bottom:12px">
      <div><label for="cls">Class</label><select id="cls">${db.classes.map(c => '<option value="' + c.id + '"' + (c.id === cls ? ' selected' : '') + '>' + esc(c.id + ' – ' + c.name) + '</option>').join('')}</select></div>
      <div><label for="sub">Subject</label><select id="sub"></select></div>
      <div><label class="check" style="margin-top:28px"><input type="checkbox" id="spk"><span>Speak the answers</span></label></div>
    </div>
    <div id="chat" class="chat" role="log" aria-live="polite" aria-label="Conversation"></div>
    <div class="chips mt" aria-label="Quick actions"><button class="chip" data-a="simple">💡 Explain simply</button><button class="chip" data-a="example">🧮 Give an example</button><button class="chip" data-a="quiz">🎯 Quiz me (oral)</button><button class="chip" data-a="weak">🔁 Revise my weak topics</button></div>
    <form id="form" class="row mt" style="flex-wrap:nowrap"><button type="button" class="mic" id="mic" aria-label="Ask by voice" title="Ask by voice">🎤</button><input id="txt" placeholder="Type or speak your question…" aria-label="Your question" autocomplete="off"><button class="btn orange" type="submit">Send</button></form>
    <div class="card soft mt"><div id="speech"></div><p class="hint mb0" id="left"></p></div>
    <p class="hint">The tutor can make mistakes. Check important facts in your notes and with your teacher. Answers shown are taken from in-app lessons${'' /* production: LLM behind your server */}.</p>`;

  const chat = document.getElementById('chat'), txt = document.getElementById('txt'), spk = document.getElementById('spk');
  spk.checked = Speech.supported() && USL.LS.getItem('usl_spk') !== '0'; spk.disabled = !Speech.supported();
  spk.onchange = () => USL.LS.setItem('usl_spk', spk.checked ? '1' : '0');
  Speech.bar(document.getElementById('speech'), () => lastBot);
  const left = () => { document.getElementById('left').textContent = 'Tutor questions left today: ' + Server.aiLeft() + ' (limits keep the service affordable for everyone).'; }; left();

  function fillSubjects() {
    const subs = db.subjects.filter(s => s.classes.includes(cls)); if (subj && !subs.find(s => s.id === subj)) subj = '';
    document.getElementById('sub').innerHTML = '<option value="">All subjects</option>' + subs.map(s => '<option value="' + s.id + '"' + (s.id === subj ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('');
  }
  fillSubjects();
  document.getElementById('cls').onchange = e => { cls = e.target.value; subj = ''; lastLesson = null; quiz = null; fillSubjects(); };
  document.getElementById('sub').onchange = e => { subj = e.target.value; lastLesson = null; quiz = null; };

  function say(who, html, plainText) {
    const b = document.createElement('div'); b.className = 'bubble ' + who; b.innerHTML = html; chat.appendChild(b); chat.scrollTop = chat.scrollHeight;
    if (who === 'bot' && plainText) { lastBot = plainText; if (spk.checked) Speech.speak(plainText); }
  }
  const src = l => '<span class="src">Source: <a href="lesson.html?id=' + encodeURIComponent(l.id) + '">' + esc(l.title) + '</a> (' + esc(l.cls) + ' · ' + esc(subName(l.subject)) + ') — ' + (l.review === 'sample' ? 'sample notes, not official' : 'reviewed notes') + '.</span>';
  const bot = (text, l) => say('bot', esc(text) + (l ? src(l) : ''), text);
  const use = text => { const r = Server.aiUse(text.length); if (!r.ok) { say('bot', esc(r.error)); return false; } left(); return true; };

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  function askQuiz(weakOnly) {
    const weak = weakOnly ? Server.weakTopics() : []; if (weakOnly && !weak.length) say('bot', 'You have no weak topics yet, so here is a mixed question instead.');
    const pick = AI.quizQuestion(cls, subj, weak); if (!pick) return say('bot', 'There are no quiz questions for this class and subject yet.');
    if (!use('quiz')) return; quiz = pick;
    const t = 'Question: ' + pick.q.q + ' ' + pick.q.o.map((o, i) => 'Option ' + letters[i] + ': ' + o + '.').join(' ');
    say('bot', '<b>Question</b> (' + esc(pick.l.topic) + ')<br>' + esc(pick.q.q) + '<br>' + pick.q.o.map((o, i) => '<br><b>' + letters[i] + '.</b> ' + esc(o)).join('') + '<br><br><i>Say or type the letter, or "stop" to end.</i>', t);
  }
  function judge(text) {
    const t = text.trim().toLowerCase(); if (/^(stop|exit|quit|end)/.test(t)) { quiz = null; return bot('OK, quiz ended. Ask me anything or press "Quiz me" again.'); }
    if (/^(next|another|again)/.test(t)) return askQuiz(false);
    const { q, l } = quiz; let k = q.o.findIndex(o => t === o.toLowerCase() || t.includes(o.toLowerCase()));
    if (k < 0) { const say1 = { be: 'b', bee: 'b', see: 'c', sea: 'c', dee: 'd', ay: 'a' }; const m = t.replace(/[.,!?]/g, '').match(/^(?:it is |its |i think |option |answer |letter |number )*([a-f]|be|bee|see|sea|dee|ay|[1-6])$/); if (m) { const x = say1[m[1]] || m[1]; k = /\d/.test(x) ? +x - 1 : x.charCodeAt(0) - 97; } }
    if (k < 0 || k >= q.o.length) return bot('I did not catch an option. Say or type A, B, C or D — or "stop".');
    if (!use('judge')) return; const ok = k === q.a;
    const why = USL.plain(l.notes).match(/[^.!?]+[.!?]+/g) || []; const reply = (ok ? 'Correct! ' : 'Not quite. The correct answer is ' + letters[q.a] + ': ' + q.o[q.a] + '. ') + 'From the notes: ' + why.slice(0, 2).join(' ').trim() + ' Say "next" for another question, or "stop".';
    quiz.answered = true; bot(reply, l);
  }
  async function ask(text, mode) {
    text = text.trim(); if (!text) return; say('me', esc(text)); txt.value = '';
    if (/\b(suicide|kill myself|self.?harm|hurt myself|abuse|rape)\b/i.test(text)) return bot('I am sorry you are going through something hard. Please talk to a trusted adult, a teacher or a counsellor today. In Uganda you can call the Sauti Child Helpline on 116. I can only help with schoolwork here.');
    if (quiz && !mode) return judge(text);
    if (!mode && /\bquiz\b|test me/i.test(text)) return askQuiz(false);
    if (!mode && lastLesson && text.split(/\s+/).length <= 5) { if (/example/i.test(text)) mode = 'example'; else if (/simpl|easier|again/i.test(text)) mode = 'simple'; }
    if (!use(text)) return;
    const follow = mode && lastLesson && (mode === 'example' || mode === 'simple');
    const res = follow ? AI.answer(lastLesson.title + ' ' + lastLesson.topic, { classId: cls, subjectId: lastLesson.subject, mode }) : AI.answer(text, { classId: cls, subjectId: subj, mode });
    if (res.found) { lastLesson = res.lesson; bot(res.text, res.lesson); } else bot(res.text);
  }
  document.getElementById('form').onsubmit = e => { e.preventDefault(); ask(txt.value); };
  document.querySelector('.chips').onclick = e => {
    const a = e.target.closest('button') && e.target.closest('button').dataset.a; if (!a) return;
    if (a === 'quiz') { say('me', 'Quiz me'); return askQuiz(false); } if (a === 'weak') { say('me', 'Revise my weak topics'); return askQuiz(true); }
    if (!lastLesson) return say('bot', 'Ask a question about a topic first, then I can explain it simply or give an example.');
    quiz = null; ask(a === 'simple' ? 'Explain simply' : 'Give an example', a);
  };
  const mic = document.getElementById('mic');
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) { mic.disabled = true; mic.title = 'Voice input is not supported in this browser — use the text box.'; }
  mic.onclick = () => {
    if (rec) { rec.stop(); return; } Speech.stop(); mic.classList.add('on'); mic.setAttribute('aria-label', 'Stop listening');
    rec = Speech.listen(t => { txt.value = t; ask(t); }, () => { rec = null; mic.classList.remove('on'); mic.setAttribute('aria-label', 'Ask by voice'); }, er => toast(er === 'not-allowed' ? 'Microphone permission was denied. You can type instead.' : 'Voice input stopped (' + er + ').', 'bad'));
    if (!rec) mic.classList.remove('on');
  };

  bot('Hello ' + u.name.split(' ')[0] + '! Ask me about a topic in your notes, or press "Quiz me" and I will ask you questions aloud.');
  const q0 = qs.get('q'); if (q0) ask('Explain ' + q0);
  window.addEventListener('beforeunload', () => Speech.stop());
})();
