// Run: node tests/server.test.js   — exercises the simulated server rules (no browser needed).
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
require('../js/data.js');
const USL = require('../js/app.js');
const S = USL.Server, G = USL.Gateway;
let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name, extra || ''); } };
const db = () => S.data();
const tweak = fn => { const d = JSON.parse(store.usl_db_v1); fn(d); store.usl_db_v1 = JSON.stringify(d); };
const as = async (contact, pw) => { const r = await S.login(contact, pw); if (!r.ok) throw new Error('login ' + r.error); return r; };

(async () => {
  await USL.ready;
  console.log('Registration & verification');
  let r = await S.register({ name: 'Amina K', contact: '0772 123456', password: 'weak', classId: 'S4', consent: true });
  t('weak password rejected', !r.ok);
  r = await S.register({ name: 'Amina K', contact: '0772 123456', password: 'Strong123', classId: 'S4', consent: false });
  t('consent required', !r.ok);
  r = await S.register({ name: 'Amina K', contact: '0772 123456', password: 'Strong123', classId: 'S4', consent: true });
  t('registers with phone', r.ok && r.demoOtp);
  t('duplicate contact rejected', !(await S.register({ name: 'X Y', contact: '+256772123456', password: 'Strong123', classId: 'S4', consent: true })).ok);
  t('wrong OTP rejected', !(await S.verifyRegistration('0772123456', '000000')).ok);
  r = await S.verifyRegistration('0772123456', db().otps['+256772123456|verify'].code);
  t('verifies and logs in', r.ok && S.currentUser().user);
  const me = S.currentUser().user;

  console.log('Trial');
  t('starts as trial_ready', S.access(me).state === 'trial_ready');
  t('paid content blocked before trial', !S.getLesson('s4-math-quad').ok);
  r = S.startTrial(); t('trial starts once', r.ok);
  t('trial gives access', S.getLesson('s4-math-quad').ok && S.access(S.currentUser().user).state === 'trial');
  t('second trial refused', !S.startTrial().ok);
  S.logout(); await as('0772123456', 'Strong123');
  t('trial not reset by logout/login', !S.startTrial().ok);
  tweak(d => { d.users.find(u => u.id === me.id).trialEndsAt = Date.now() - 1; }); // force expiry
  t('expired trial blocks lessons', !S.getLesson('s4-math-quad').ok && S.access(S.currentUser().user).state === 'expired');
  t('expired trial blocks starting exams', !S.startAttempt('p-s4-math-1').ok);
  t('expired user cannot use AI tutor', !S.aiUse(10).ok);

  console.log('Payments');
  t('bad phone rejected', !S.initiatePayment('MTN Mobile Money', 'abc').ok);
  r = S.initiatePayment('MTN Mobile Money', '0772123456'); const ref = r.payment.ref;
  t('payment pending, no access yet', r.ok && r.payment.status === 'pending' && !S.getLesson('s4-math-quad').ok);
  t('forged "screenshot" callback rejected', !(await G.forged(ref)).ok && S.access(S.currentUser().user).state === 'expired');
  r = await G.simulate(ref, 'failed'); t('failed payment gives no access', r.ok && db().payments.find(p => p.ref === ref).status === 'failed' && !S.getLesson('s4-math-quad').ok);
  r = S.initiatePayment('Airtel Money', '0752123456'); const ref2 = r.payment.ref;
  r = await G.simulate(ref2, 'success'); t('verified success activates', r.ok && S.access(S.currentUser().user).state === 'paid' && S.getLesson('s4-math-quad').ok);
  const exp1 = S.access(S.currentUser().user).expires;
  r = await G.simulate(ref2, 'success'); t('duplicate callback adds nothing', r.duplicate && S.access(S.currentUser().user).expires === exp1);
  t('expiry ≈ 30 days', Math.abs((exp1 - Date.now()) / 864e5 - 30) < 0.01);
  r = await G.simulate(ref2, 'reversed'); t('reversal removes access', r.ok && S.access(S.currentUser().user).state === 'expired');
  r = await G.simulate(ref2, 'success'); t('success after reversal ignored', !r.ok && S.access(S.currentUser().user).state === 'expired');

  console.log('WhatsApp notification queue & pay number');
  const ob = () => JSON.parse(store.usl_db_v1).outbox;
  t('payments are directed to 0773014995', db().payments.every(p => p.payTo === '+256773014995'));
  t('verified success queued a WhatsApp message to the number', ob().some(m => m.kind === 'subscription' && m.to === '+256773014995' && /Amina K/.test(m.text) && /USL-/.test(m.text) && m.status === 'queued'));
  t('duplicate callback queued nothing extra', ob().filter(m => m.kind === 'subscription').length === 1);
  t('reversal queued a warning message', ob().some(m => m.kind === 'reversal'));
  t('failed/forged payments queued nothing', !ob().some(m => /fake|FAKE/i.test(m.text)));

  console.log('Subscription expiry');
  r = S.initiatePayment('MTN Mobile Money', '0772123456'); await G.simulate(r.payment.ref, 'success');
  t('renewed', S.access(S.currentUser().user).state === 'paid');
  tweak(d => d.subs.filter(s => s.userId === me.id && s.status === 'active').forEach(s => { s.expires = Date.now() - 1000; }));
  t('expired subscription loses access', S.access(S.currentUser().user).state === 'expired' && !S.getLesson('s4-math-quad').ok);
  r = S.initiatePayment('MTN Mobile Money', '0772123456'); await G.simulate(r.payment.ref, 'success');

  console.log('Device lock');
  const dev1 = USL.deviceId(); USL.newDevice();
  t('old session invalid on other device', !S.currentUser().user);
  r = await S.login('0772123456', 'Strong123'); t('new device must verify', r.needsTransfer && r.demoOtp);
  t('no session until verified', !S.currentUser().user);
  t('wrong transfer code rejected', !(await S.completeTransfer('0772123456', '111111')).ok);
  r = await S.completeTransfer('0772123456', db().otps['+256772123456|transfer'].code); t('transfer succeeds', r.ok && S.currentUser().user);
  localStorage.setItem('usl_device', dev1); // go back to old device
  t('old device now locked out', !S.currentUser().user);
  r = await S.login('0772123456', 'Strong123'); t('old device must verify too', r.needsTransfer);
  const alerts = db().notifications.filter(n => n.userId === me.id && /new device/i.test(n.msg)); t('suspicious-login alert created', alerts.length >= 2);
  await S.completeTransfer('0772123456', db().otps['+256772123456|transfer'].code);

  console.log('Rate limiting');
  S.logout(); let last;
  for (let i = 0; i < 5; i++) last = await S.login('0772123456', 'Wrong1234');
  r = await S.login('0772123456', 'Strong123'); t('account locks after 5 failures', !r.ok && /Too many/.test(r.error));
  tweak(d => { d.users.find(u => u.id === me.id).lockUntil = 0; });
  await as('0772123456', 'Strong123');

  console.log('Roles & permissions');
  t('student cannot open admin stats', !S.adminStats().ok);
  t('student cannot submit papers', !S.submitPaper({}).ok);
  t('student cannot change config', !S.saveConfig({ price: 1 }).ok);
  t('student cannot read the outbox', !S.outbox().ok);
  S.logout(); await as('teacher@usl.demo', 'Teach@123');
  const q = 'MCQ | Sets | 1 | What is n({1,2})? | 1 ;; 2 ;; 3 | 2\nSTRUCT | Sets | 3 | Define a set. | A well-defined collection of objects.';
  const paperIn = { title: 'Teacher test', cls: 'S4', subject: 'math', year: 2026, paperNo: 1, duration: 10, category: 'Teacher-created assessment', permission: USL.PERMS[0], org: 'o_school', hasGuide: true, questionsText: q };
  r = S.submitPaper(paperIn); const pid = r.id; t('contributor submits → pending (not public)', r.ok && db().papers.find(p => p.id === pid).status === 'pending');
  t('contributor cannot approve own work', !S.reviewItem('paper', pid, 'approve').ok);
  t('contributor cannot see admin stats', !S.adminStats().ok);
  t('bad question format rejected', !S.submitPaper(Object.assign({}, paperIn, { questionsText: 'MCQ | x | 1 | no options' })).ok);
  S.logout(); await as('reviewer@usl.demo', 'Review@123');
  r = S.submitPaper(Object.assign({}, paperIn, { title: 'No permission', permission: 'Permission pending' }));
  t('cannot approve paper without distribution permission', !S.reviewItem('paper', r.id, 'approve').ok && db().papers.find(p => p.id === r.id).status === 'pending');
  t('reviewer cannot manage payments/config', !S.saveConfig({ price: 5000 }).ok);
  r = S.reviewItem('paper', pid, 'approve', 'Looks fine'); t('reviewer approves → published', r.ok && db().papers.find(p => p.id === pid).status === 'published');
  t('review recorded', db().reviews[0].decision === 'approve');
  t('seeded pending paper stays unpublished', db().papers.find(p => p.id === 'p-s6-chem-1-pending').status === 'pending');
  S.logout(); await as('admin@usl.demo', 'Admin@123');
  t('admin sees stats', S.adminStats().ok);
  t('admin can change price', S.saveConfig({ price: 25000, days: 30, trialMinutes: 15, aiDailyLimit: 30, aiCostPerCall: 30, sandbox: true, payNumber: '0773014995', whatsappNumber: '0773014995', whatsappNotify: true }).ok && S.cfg().price === 25000);
  t('invalid pay number rejected', !S.saveConfig({ price: 20000, days: 30, trialMinutes: 15, aiDailyLimit: 30, payNumber: 'abc', whatsappNumber: '0773014995' }).ok);
  t('admin can read the outbox', S.outbox().ok && S.outbox().items.length >= 1);
  S.saveConfig({ price: 20000, days: 30, trialMinutes: 15, aiDailyLimit: 30, aiCostPerCall: 30, sandbox: true, payNumber: '0773014995', whatsappNumber: '0773014995', whatsappNotify: true });
  t('admin can add a class + subject', S.upsertClass({ id: 'S7', name: 'Test', level: 'x', focus: 'y' }).ok && S.upsertSubject({ name: 'Test Subject', classes: ['S7'] }).ok);
  t('admin can withdraw paper', S.withdraw('paper', pid).ok && db().papers.find(p => p.id === pid).status === 'withdrawn');
  t('audit log has entries', db().audit.length > 20);

  console.log('Exam simulator');
  S.logout(); await as('0772123456', 'Strong123');
  r = S.startAttempt('p-s4-math-1'); t('attempt starts', r.ok && r.attempt.status === 'in_progress');
  const aid = r.attempt.id; t('resume returns same attempt', S.startAttempt('p-s4-math-1').attempt.id === aid);
  t('autosave works', S.saveAnswers(aid, { q1: 0, q2: 0, q3: 0 }, {}).ok);
  r = S.submitAttempt(aid, { q1: 0, q2: 0, q3: 1, q4: 1, q5: 0 }, {});
  t('objective marking (4 of 5 correct = 8/10)', r.attempt.objective.got === 8 && r.attempt.objective.max === 10, JSON.stringify(r.attempt.objective));
  console.log('     objective score', r.attempt.objective.got + '/' + r.attempt.objective.max);
  t('cannot edit after submit', !S.saveAnswers(aid, { q1: 1 }, {}).ok);
  r = S.selfMark(aid, { q6: 4, q7: 1 }); t('self-marking updates topic stats', r.ok && r.attempt.topicStats['math|Quadratic equations'].max >= 9);
  t('weak topics computed', Array.isArray(S.weakTopics()));
  r = S.startAttempt('p-s4-chem-1-mock'); r = S.submitAttempt(r.attempt.id, { q1: 1 }, {}); t('paper without guide is not auto-scored', r.attempt.objective.scored === false);
  t('unpublished/pending paper cannot be started', !S.startAttempt('p-s6-chem-1-pending').ok);

  console.log('AI tutor');
  const hit = USL.AI.answer('what is the discriminant', { classId: 'S4', subjectId: 'math' }); t('grounded answer found with source lesson', hit.found && hit.lesson.id === 's4-math-quad');
  const miss = USL.AI.answer('who won the football match', { classId: 'S4', subjectId: 'math' }); t('declines when not in notes', !miss.found);
  const lim = S.cfg().aiDailyLimit; let n = 0; while (S.aiUse(5).ok && n < 100) n++; t('daily AI limit enforced (' + lim + ')', n === lim, n);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
