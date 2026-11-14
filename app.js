'use strict';
/* VitalOrbit: astronaut health monitor. Vanilla JS + Chart.js. Data stays in localStorage. */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const KEY = 'vitalorbit.v1', LV = ['ok', 'warn', 'crit'], LN = ['Normal', 'Caution', 'Critical'];
const iso = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const save = h => localStorage.setItem(KEY, JSON.stringify(h.sort((a, b) => (a.date < b.date ? -1 : 1))));
const avg = (a, k) => a.reduce((t, x) => t + x[k], 0) / a.length;
const hi = (v, w, c) => (v >= c ? 2 : v >= w ? 1 : 0), lo = (v, w, c) => (v <= c ? 2 : v <= w ? 1 : 0);

/* Metrics: key, label, unit, input limits, normal band (used for charts and display) */
const F = [
  { k: 'hr', l: 'Resting heart rate', u: 'bpm', min: 30, max: 200, step: 1, b: [50, 100] },
  { k: 'sys', l: 'Systolic BP', u: 'mmHg', min: 70, max: 220, step: 1, b: [100, 130] },
  { k: 'dia', l: 'Diastolic BP', u: 'mmHg', min: 40, max: 140, step: 1, b: [60, 85] },
  { k: 'glu', l: 'Blood glucose', u: 'mg/dL', min: 40, max: 400, step: 1, b: [80, 140] },
  { k: 'temp', l: 'Body temperature', u: '°C', min: 34, max: 41, step: 0.1, b: [36.1, 37.5] },
  { k: 'sleep', l: 'Sleep', u: 'h', min: 0, max: 14, step: 0.5, b: [7, 9] },
  { k: 'mood', l: 'Mood (1 low to 5 high)', u: '/5', min: 1, max: 5, step: 1, b: [3, 5] },
  { k: 'fat', l: 'Fatigue (1 low to 10 high)', u: '/10', min: 1, max: 10, step: 1, b: [1, 5] },
  { k: 'ex', l: 'Exercise countermeasures', u: 'min', min: 0, max: 300, step: 1, b: [90, 180] },
  { k: 'h2o', l: 'Water intake', u: 'L', min: 0, max: 6, step: 0.1, b: [2, 3.5] },
];
const SYS = {
  cardio: { n: 'Cardiovascular', m: ['hr', 'sys', 'dia'], tip: 'Alternate treadmill intervals with resistive work, do lower-body negative pressure sessions per protocol, and take 0.5 to 1 L of fluid with salt as prescribed.' },
  msk: { n: 'Musculoskeletal', m: ['ex'], tip: 'Complete a resistive session (squats, deadlifts, heel raises) plus 30 min aerobic work. Confirm calcium and vitamin D intake with your flight surgeon.' },
  neuro: { n: 'Neurological and sleep', m: ['sleep', 'mood', 'fat'], tip: 'Keep a fixed 8 h sleep window, dim blue light for an hour before bed, do 10 min of paced breathing, and call a crewmate or family.' },
  meta: { n: 'Metabolic', m: ['glu', 'temp', 'h2o'], tip: 'Eat a balanced meal with protein, drink 250 mL of water every hour, and recheck glucose and temperature in 30 min.' },
};
/* Rule table: [system, metric, level function, alert title, recommended action] */
const RULES = [
  ['cardio', 'hr', e => Math.max(hi(e.hr, 101, 120), lo(e.hr, 54, 44)), 'Resting heart rate out of range', 'Sit and rest 15 min, drink 500 mL water, then re-measure. Skip max-effort exercise until it normalizes.'],
  ['cardio', 'sys', e => Math.max(hi(e.sys, 130, 160), hi(e.dia, 85, 100), lo(e.sys, 100, 89)), 'Blood pressure out of range', 'Re-measure after 5 min of rest. If high, cut sodium and do light aerobic work. If low, fluid-load 0.5 to 1 L and stand up slowly.'],
  ['meta', 'glu', e => Math.max(hi(e.glu, 141, 181), lo(e.glu, 79, 69)), 'Blood glucose out of range', 'If low, take 15 g fast carbohydrate and recheck in 15 min. If high, drink water, take a light walk or treadmill session, and recheck.'],
  ['meta', 'temp', e => Math.max(hi(e.temp, 37.6, 38), lo(e.temp, 36, 35)), 'Body temperature out of range', 'Hydrate, check cabin temperature and clothing, and re-measure in 30 min. Report any fever with other symptoms.'],
  ['meta', 'h2o', e => lo(e.h2o, 1.9, 1.2), 'Low hydration', 'Drink 500 mL now, then 250 mL every hour until you reach 2.5 L. Low fluid worsens fluid-shift symptoms.'],
  ['neuro', 'sleep', e => lo(e.sleep, 6.4, 4.9), 'Short sleep', 'Protect an 8 h window tonight: dim lights, no screens for an hour, cool cabin, earplugs and eye mask. Defer non-critical tasks.'],
  ['neuro', 'mood', e => lo(e.mood, 2, 1), 'Low mood', 'Schedule a private family or psychological conference and join a crew meal. Reaching out early is a mission skill.'],
  ['neuro', 'fat', e => hi(e.fat, 7, 9), 'High fatigue', 'Take a 20 min rest break, eat and drink, and reduce workload. Persistent fatigue can signal sleep debt or overtraining.'],
  ['msk', 'ex', e => lo(e.ex, 59, 19), 'Exercise below target', 'Add a resistive session today (squats, deadlifts, heel raises). Skipped load speeds up bone and muscle loss.'],
];

/* Pattern detection across the last few days */
function trends(h) {
  const T = [], l = h.slice(-3), m = h.slice(-5);
  const P = (s, lv, t, v, act) => T.push({ s, lv, t, v, act, trend: 1 });
  const up = k => (l.length === 3 && l[0][k] < l[1][k] && l[1][k] < l[2][k] ? l[2][k] - l[0][k] : 0);
  if (l.length === 3 && avg(l, 'sleep') < 6.5) P('neuro', 1, 'Sleep debt building', `3-day average ${avg(l, 'sleep').toFixed(1)} h`, 'Move bedtime earlier, avoid caffeine late in the shift, and ask the flight surgeon about a sleep-aid plan.');
  if (up('hr') >= 8) P('cardio', 1, 'Resting heart rate rising 3 days', `+${up('hr')} bpm`, 'Check hydration and exercise load. A steady rise can mean dehydration, deconditioning or early infection. Report if it continues.');
  if (up('sys') >= 10) P('cardio', 1, 'Systolic pressure rising 3 days', `+${up('sys')} mmHg`, 'Review sodium intake and stress, and add aerobic work. Share the trend with the ground team.');
  if (l.length === 3 && l.every(x => x.mood <= 2)) P('neuro', 2, 'Behavioral health: low mood for 3 days', 'Mood 2/5 or lower', 'Request a private psychological conference with ground support today.');
  if (m.length === 5 && avg(m, 'ex') < 60) P('msk', 1, 'Bone and muscle risk: low exercise', `5-day average ${Math.round(avg(m, 'ex'))} min`, 'Re-commit to daily resistive and aerobic sessions. Target 90 min or more per day.');
  return T;
}
function evaluate(h) {
  const e = h[h.length - 1], A = [], S = { cardio: 0, msk: 0, neuro: 0, meta: 0 };
  if (!e) return { e, A, S };
  RULES.forEach(([s, k, fn, t, act]) => {
    const lv = fn(e);
    if (lv) A.push({ s, lv, t, v: k === 'sys' ? `${e.sys}/${e.dia} mmHg` : `${e[k]} ${F.find(f => f.k === k).u}`, act });
  });
  trends(h).forEach(a => A.push(a));
  A.forEach(a => (S[a.s] = Math.max(S[a.s], a.lv)));
  return { e, A: A.sort((a, b) => b.lv - a.lv), S };
}

/* Gamification */
function streak(h) {
  const d = new Set(h.map(e => e.date)), c = new Date();
  if (!d.has(iso(c))) c.setDate(c.getDate() - 1);
  let n = 0;
  while (d.has(iso(c))) { n++; c.setDate(c.getDate() - 1); }
  return n;
}
const BADGES = [
  ['🚀', 'First log', 'Save your first entry', h => h.length >= 1],
  ['🔥', '3-day streak', 'Log 3 days in a row', (h, s) => s >= 3],
  ['🌟', '7-day streak', 'Log 7 days in a row', (h, s) => s >= 7],
  ['🏆', '14-day streak', 'Log 14 days in a row', (h, s) => s >= 14],
  ['😴', 'Sleep master', '5 nights of 7 h or more', h => h.filter(e => e.sleep >= 7).length >= 5],
  ['🦴', 'Iron bones', '5 days of 90 min or more exercise', h => h.filter(e => e.ex >= 90).length >= 5],
  ['💧', 'Hydration hero', '5 days of 2 L or more water', h => h.filter(e => e.h2o >= 2).length >= 5],
  ['🟢', 'All green', 'Latest log: every system normal', (h, s, R) => !!R.e && Object.values(R.S).every(v => !v)],
];

/* Rendering */
let sel = 'cardio', tab = 'dash', metric = 'hr', vc, wc, R;
const BD = ['', 'border-yellow-500', 'border-red-500'];

function render() {
  const h = load(); R = evaluate(h);
  const top = R.e ? Math.max(...Object.values(R.S)) : -1;
  $('#overall').className = 'pill ' + (R.e ? LV[top] : 'none');
  $('#overall').textContent = R.e ? 'Overall: ' + LN[top] : 'No data yet';
  $$('#body [data-sys]').forEach(el => el.setAttribute('class', 'zone ' + (R.e ? LV[R.S[el.dataset.sys]] : 'none') + (el.dataset.sys === sel ? ' sel' : '')));
  renderDetail(); renderAlerts(); renderRewards(h);
  if (tab === 'log') charts(h);
}
function renderDetail() {
  const c = SYS[sel], lv = R.S[sel], al = R.A.filter(a => a.s === sel);
  $('#detail').innerHTML = `
    <div class="flex items-center justify-between"><h2>${c.n}</h2><span class="pill ${R.e ? LV[lv] : 'none'}">${R.e ? LN[lv] : 'No data'}</span></div>
    <div class="mb-4 grid grid-cols-3 gap-2">${c.m.map(k => { const f = F.find(x => x.k === k); return `
      <div class="rounded-lg bg-slate-900 p-3"><div class="text-xs text-slate-400">${f.l}</div>
      <div class="text-lg font-semibold">${R.e ? R.e[k] : '–'} <span class="text-xs text-slate-500">${f.u}</span></div>
      <div class="text-xs text-slate-500">normal ${f.b[0]} to ${f.b[1]}</div></div>`; }).join('')}</div>
    ${!R.e ? '<p>Save a daily log (or load the demo data) to color the body map.</p>' : al.length
      ? al.map(a => `<p class="mb-2"><b class="${a.lv > 1 ? 'text-red-300' : 'text-yellow-300'}">${a.t}</b> (${a.v}). ${a.act}</p>`).join('')
      : '<p class="mb-2">Everything in this system is within range today.</p>'}
    <h3 class="mt-4">Standing countermeasures</h3><p>${c.tip}</p>`;
}
function renderAlerts() {
  $('#alerts').innerHTML = !R.e ? '<div class="card"><p>Save your first daily log to activate the advisor.</p></div>'
    : !R.A.length ? '<div class="card"><p>✅ All systems nominal. Keep up your exercise, hydration and sleep routine.</p></div>'
    : R.A.map(a => `<div class="card border-l-4 ${BD[a.lv]}">
        <div class="flex flex-wrap items-center gap-2"><span class="pill ${LV[a.lv]}">${LN[a.lv]}</span>
        <b>${SYS[a.s].n}: ${a.t}</b><span class="text-sm text-slate-400">${a.v}</span></div>
        <p class="mt-2">💡 ${a.act}</p>
        ${a.lv > 1 ? '<p class="mt-2 !text-xs !text-red-300">📡 Auto-queued for flight surgeon downlink (simulated)</p>' : ''}</div>`).join('');
}
function renderRewards(h) {
  const s = streak(h), got = BADGES.filter(b => b[3](h, s, R)), xp = h.length * 10 + got.length * 25;
  $('#hStreak').textContent = `🔥 ${s}-day streak`;
  $('#hXp').textContent = `Level ${Math.floor(xp / 100) + 1}, ${xp} XP`;
  $('#rewards').innerHTML = `<h2>Mission health rewards</h2>
    <p class="mb-2">Log every day to keep your streak. Each entry earns 10 XP and each badge 25 XP.</p>
    <div class="bar mb-1"><i style="width:${xp % 100}%"></i></div>
    <p class="mb-4 !text-xs">${100 - (xp % 100)} XP to level ${Math.floor(xp / 100) + 2}</p>
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">${BADGES.map(b => `
      <div class="badge ${got.includes(b) ? '' : 'off'}"><div class="text-2xl">${b[0]}</div>
      <div class="text-sm font-semibold">${b[1]}</div><div class="text-xs text-slate-400">${b[2]}</div></div>`).join('')}</div>`;
}

/* Charts */
Chart.defaults.color = '#94a3b8'; Chart.defaults.borderColor = '#1e293b';
const ln = (label, data, c, x = {}) => ({ label, data, borderColor: c, backgroundColor: c, tension: 0.3, pointRadius: 3, ...x });
function charts(h) {
  const L = h.map(e => e.date.slice(5)), f = F.find(x => x.k === metric), band = i => L.map(() => f.b[i]), opt = { aspectRatio: 2.6 };
  vc && vc.destroy(); wc && wc.destroy();
  vc = new Chart($('#vc'), { type: 'line', options: opt, data: { labels: L, datasets: [
    ln(`${f.l} (${f.u})`, h.map(e => e[metric]), '#38bdf8'),
    ln('Normal min', band(0), '#22c55e88', { borderDash: [5, 5], pointRadius: 0 }),
    ln('Normal max', band(1), '#22c55e88', { borderDash: [5, 5], pointRadius: 0, fill: '-1', backgroundColor: '#22c55e18' })] } });
  wc = new Chart($('#wc'), { type: 'line', options: opt, data: { labels: L, datasets: [
    ln('Sleep (h)', h.map(e => e.sleep), '#a78bfa'), ln('Mood (1 to 5)', h.map(e => e.mood), '#facc15'), ln('Fatigue (1 to 10)', h.map(e => e.fat), '#f87171')] } });
}

/* Navigation and form */
function show(t) {
  tab = t;
  $$('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + t));
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  if (t === 'log') charts(load());
}
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 2500); };

$$('.tab').forEach(b => (b.onclick = () => show(b.dataset.tab)));
$$('#body [data-sys]').forEach(el => {
  el.setAttribute('tabindex', 0); el.setAttribute('role', 'button'); el.setAttribute('aria-label', SYS[el.dataset.sys].n);
  el.innerHTML = `<title>${SYS[el.dataset.sys].n}</title>`;
  el.onclick = () => { sel = el.dataset.sys; render(); };
  el.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); } };
});
$('#fields').innerHTML = `<div><label for="date">Date</label><input id="date" type="date" value="${iso()}" required></div>` +
  F.map(f => `<div><label for="f_${f.k}">${f.l} (${f.u})</label><input id="f_${f.k}" type="number" required min="${f.min}" max="${f.max}" step="${f.step}" placeholder="${f.b[0]} to ${f.b[1]}"></div>`).join('');
$('#metrics').innerHTML = F.map(f => `<button type="button" class="metric ${f.k === metric ? 'on' : ''}" data-k="${f.k}">${f.l}</button>`).join('');
$$('.metric').forEach(b => (b.onclick = () => { metric = b.dataset.k; $$('.metric').forEach(x => x.classList.toggle('on', x === b)); charts(load()); }));

$('#form').onsubmit = ev => {
  ev.preventDefault();
  const e = { date: $('#date').value };
  F.forEach(f => (e[f.k] = +$('#f_' + f.k).value));
  const h = load().filter(x => x.date !== e.date); h.push(e); save(h);
  ev.target.reset(); $('#date').value = iso(); render();
  toast('Entry saved: +10 XP');
  show(R.A.length ? 'adv' : 'dash');
};
$('#demo').onclick = () => {
  const h = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const p = (13 - i) / 13, j = () => Math.random() - 0.5;
    h.push({ date: iso(d), hr: Math.round(62 + 16 * p + 4 * j()), sys: Math.round(118 + 18 * p + 4 * j()), dia: Math.round(76 + 9 * p + 3 * j()),
      glu: Math.round(94 + 14 * p + 8 * j()), temp: +(36.7 + 0.3 * j()).toFixed(1), sleep: Math.round((7.6 - 1.9 * p + j()) * 2) / 2,
      mood: Math.round(4.3 - 2.4 * p), fat: Math.max(1, Math.round(3 + 4.5 * p + 2 * j())), ex: Math.round(125 - 70 * p + 15 * j()), h2o: +(2.9 - p + 0.3 * j()).toFixed(1) });
  }
  save(h); render(); toast('Demo mission data loaded');
};
$('#exp').onclick = () => {
  const h = load(), csv = ['date,' + F.map(f => f.k).join(',')].concat(h.map(e => [e.date, ...F.map(f => e[f.k])].join(','))).join('\n');
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'vitalorbit-report.csv' }).click();
};
$('#clr').onclick = () => { if (confirm('Delete all logged data on this device?')) { localStorage.removeItem(KEY); render(); } };

render();
