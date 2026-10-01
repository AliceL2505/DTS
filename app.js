/* PI Planning : capacité UX / UI
   Toute la logique de l'outil : calcul de capacité, dispatch, rendu des onglets, sauvegarde, export et import. */

/* ---------- Utilitaires ---------- */
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const EPS = 1e-6;
const r1 = n => Math.round(n * 10) / 10;
const fmt = n => r1(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };
const parseD = s => new Date(s + 'T00:00:00Z');
const isoD = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = parseD(s); d.setUTCDate(d.getUTCDate() + n); return isoD(d); };
const validD = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const shortD = s => validD(s) ? parseD(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '?';
let holidaySet = new Set();
function isWorking(s) { const w = parseD(s).getUTCDay(); return w !== 0 && w !== 6 && !holidaySet.has(s); }
function workDays(a, b) {
  if (!validD(a) || !validD(b) || a > b) return 0;
  let c = 0, d = a, guard = 0;
  while (d <= b && guard++ < 1500) { if (isWorking(d)) c++; d = addDays(d, 1); }
  return c;
}
const overlapWD = (a1, b1, a2, b2) => workDays(a1 > a2 ? a1 : a2, b1 < b2 ? b1 : b2);
function nextMonday() { const d = new Date(); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const w = t.getUTCDay(); t.setUTCDate(t.getUTCDate() + ((8 - w) % 7 || 7)); return isoD(t); }
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return isoD(new Date(Date.UTC(y, mo - 1, da)));
}
function frHolidays(y) {
  const e = easter(y);
  return [[`${y}-01-01`, 'Jour de l\'an'], [addDays(e, 1), 'Lundi de Pâques'], [`${y}-05-01`, 'Fête du travail'], [`${y}-05-08`, 'Victoire 1945'],
  [addDays(e, 39), 'Ascension'], [addDays(e, 50), 'Lundi de Pentecôte'], [`${y}-07-14`, 'Fête nationale'], [`${y}-08-15`, 'Assomption'],
  [`${y}-11-01`, 'Toussaint'], [`${y}-11-11`, 'Armistice'], [`${y}-12-25`, 'Noël']];
}

/* ---------- État ---------- */
const autoName = n => /^(Sprint( \d+)?( \((IP|PIP)\))?|PIP)$/.test(n || '');
function renameAuto(list) {
  let n = 1;
  list.forEach(sp => { if (autoName(sp.name)) sp.name = sp.pip ? 'PIP' : `Sprint ${n}${sp.ip ? ' (IP)' : ''}`; if (!sp.pip) n++; });
  return list;
}
function sortSprints(list = S.sprints) {
  const key = sp => validD(sp.start) ? sp.start : '9999';
  list.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  return renameAuto(list);
}
function makeSprints(start, weeks, count, prev = [], ip = false, ipWeeks = 2, pip = false, pipWeeks = 1) {
  const out = []; let d = start;
  for (let i = 0; i < count; i++) {
    const isPip = !!pip && count > 1 && i === 0;
    const isIp = !!ip && count > 1 && i === count - 1 && !(isPip && count < 2);
    const w = isPip ? pipWeeks : isIp ? ipWeeks : weeks;
    const p = prev[i] || {};
    out.push({ id: p.id || uid(), name: p.name && !autoName(p.name) ? p.name : 'Sprint', start: d, end: addDays(d, w * 7 - 3), excluded: isIp || isPip ? true : (p.ip || p.pip ? false : !!p.excluded), ip: isIp, pip: isPip });
    d = addDays(d, w * 7);
  }
  return renameAuto(out);
}
function defaultState() {
  const start = nextMonday();
  return {
    id: uid(), v: 5, piName: 'PI Planning', meeting: 2, meetingWeeks: 3, depMode: 'next', orderMode: 'prio', orderMode: 'prio',
    gen: { start, weeks: 3, count: 6, ip: true, ipWeeks: 2, pip: true, pipWeeks: 1 },
    holidays: [],
    sprints: makeSprints(start, 3, 6, [], true, 2, true, 1),
    members: [{ id: uid(), name: 'Designer UX', profile: 'UX', etp: 1 }, { id: uid(), name: 'Designer UI', profile: 'UI', etp: 1 }],
    leaves: [], subjects: [], events: [], product: []
  };
}
const normTask = t => ({ id: t.id || uid(), name: t.name || 'Sous-tâche', kind: t.kind === 'wait' ? 'wait' : 'work', wait: t.kind === 'wait' ? (numOr(t.wait) ?? 5) : 0, ux: t.kind === 'wait' ? 0 : num(t.ux), ui: t.kind === 'wait' ? 0 : num(t.ui), seq: ['sim', 'bg'].includes(t.seq) ? t.seq : 'after', deps: Array.isArray(t.deps) ? t.deps : [], assign: t.assign || 'auto', status: ['todo', 'doing', 'done'].includes(t.status) ? t.status : 'todo' });
function migrate(o) {
  const d = defaultState();
  if (!o || typeof o !== 'object') return d;
  const s = Object.assign(d, o);
  ['holidays', 'sprints', 'members', 'leaves', 'subjects', 'events', 'product'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
  s.events = s.events.map(e => ({ id: e.id || uid(), name: e.name || 'Évènement d\'équipe', start: e.start || '', end: e.end || '', quot: Number(e.quot) === 0.5 ? 0.5 : 1, who: ['all', 'UX', 'UI', 'custom'].includes(e.who) ? e.who : 'all', members: Array.isArray(e.members) ? e.members : [] }));
  s.gen = Object.assign(d.gen, o.gen || {});
  if (o.gen && o.gen.ip === undefined) s.gen.ip = false;
  if (o.gen && o.gen.pip === undefined) s.gen.pip = false;
  if (!(num(s.gen.pipWeeks) > 0)) s.gen.pipWeeks = 1;
  sortSprints(s.sprints);
  if (!(o.v >= 2)) s.subjects.forEach(x => { x.splittable = true; });
  if (!(o.v >= 3)) { s.meeting = 2; s.meetingWeeks = 3; }
  if (!['next', 'same'].includes(s.depMode)) s.depMode = 'next';
  if (!['prio', 'list'].includes(s.orderMode)) s.orderMode = 'prio';
  s.subjects.forEach(x => {
    x.prio = [1, 2, 3, 4].includes(Number(x.prio)) ? Number(x.prio) : 3;
    x.seq = !(o.v >= 4) ? 'after' : (['sim', 'bg'].includes(x.seq) ? x.seq : 'after');
    if (!(o.v >= 4)) x.tasks = (x.tasks || []).map(t => Object.assign(t, { seq: 'after' }));
    x.tasks = Array.isArray(x.tasks) ? x.tasks.map(normTask) : [];
    const ids = new Set(x.tasks.map(t => t.id)); x.tasks.forEach(t => { t.deps = t.deps.filter(dd => ids.has(dd) && dd !== t.id); });
  });
  if (numOr(s.ipMeeting) !== null) { s.sprints.forEach(x => { if (x.ip && numOr(x.meeting) === null) x.meeting = String(numOr(s.ipMeeting)); }); }
  delete s.ipMeeting;
  s.v = 5;
  return s;
}
let S = defaultState();
let ALL = { [S.id]: S };
const sortedPIs = () => Object.values(ALL).sort((a, b) => ((a.sprints[0] || {}).start || '9') < ((b.sprints[0] || {}).start || '9') ? -1 : 1);
const piRange = p => p.sprints.length ? `${shortD(p.sprints[0].start)} ${p.sprints[0].start.slice(0, 4)} au ${shortD(p.sprints[p.sprints.length - 1].end)} ${p.sprints[p.sprints.length - 1].end.slice(0, 4)}` : 'sans sprint';
const toMonday = d => { let x = d; for (let i = 0; i < 7 && parseD(x).getUTCDay() !== 1; i++) x = addDays(x, 1); return x; };
const nextName = n => { const m = String(n || '').match(/^(.*?)(\d+)(\D*)$/); return m ? m[1] + (parseInt(m[2], 10) + 1) + m[3] : (n || 'PI') + ' (suivant)'; };
const sprintWeeks = sp => validD(sp.start) && validD(sp.end) && sp.end >= sp.start ? Math.ceil(((parseD(sp.end) - parseD(sp.start)) / 864e5 + 1) / 7) : 0;
const numOr = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? Math.max(0, n) : null; };
const proRata = sp => num(S.meeting) * sprintWeeks(sp) / (num(S.meetingWeeks) || 3);
const autoMeeting = sp => proRata(sp);
const meetingPerEtp = sp => numOr(sp.meeting) !== null ? numOr(sp.meeting) : autoMeeting(sp);

function exampleState() {
  const start = nextMonday();
  const sp = makeSprints(start, 3, 6, [], true, 2, true, 1);
  const m = [
    { id: uid(), name: 'Léa', profile: 'UX', etp: 1 }, { id: uid(), name: 'Karim', profile: 'UX', etp: 0.5 },
    { id: uid(), name: 'Inès', profile: 'UI', etp: 1 }, { id: uid(), name: 'Tom', profile: 'UI', etp: 0.8 }];
  const sub = (name, ux, ui, prio, extra = {}) => Object.assign(newSubject(name, ux, ui, prio), extra);
  const pm = { id: uid(), name: 'Marie', role: 'PO' };
  const t1 = normTask({ name: 'Recherche utilisateurs', ux: 6 }), t2 = normTask({ name: 'Parcours et filaires', ux: 8, deps: [t1.id] }),
    w1 = normTask({ name: 'Validation PO des parcours', kind: 'wait', wait: 5, deps: [t2.id] }),
    t3 = normTask({ name: 'Maquettes UI', ui: 10, deps: [t2.id, w1.id] }), t4 = normTask({ name: 'Specs et recette', ux: 2, ui: 3, deps: [t3.id] });
  const e1 = normTask({ name: 'Ateliers de cadrage', ux: 4 }), e2 = normTask({ name: 'Maquettes tableau de bord', ux: 3, ui: 8, deps: [e1.id], seq: 'after' });
  return migrate({
    v: 5, piName: 'PI 26.4', meeting: 2, meetingWeeks: 3, depMode: 'next', orderMode: 'prio', gen: { start, weeks: 3, count: 6, ip: true, ipWeeks: 2, pip: true, pipWeeks: 1 }, holidays: [], sprints: sp, members: m,
    leaves: [
      { id: uid(), memberId: m[0].id, start: addDays(start, 21), end: addDays(start, 25), quot: 1 },
      { id: uid(), memberId: m[2].id, start: addDays(start, 44), end: addDays(start, 44), quot: 0.5 },
      { id: uid(), memberId: pm.id, start: addDays(start, 35), end: addDays(start, 37), quot: 1 },
      { id: uid(), memberId: pm.id, start: addDays(start, 49), end: addDays(start, 50), quot: 1 }],
    product: [pm],
    events: [{ name: 'Séminaire design', start: addDays(start, 31), end: addDays(start, 32), quot: 1, who: 'all' }, { name: 'Formation Figma', start: addDays(start, 59), end: addDays(start, 59), quot: 0.5, who: 'UI' }],
    subjects: [
      sub('Refonte du tunnel de commande', 0, 0, 1, { tasks: [t1, t2, w1, t3, t4], productId: pm.id }), sub('Espace client', 0, 0, 2, { tasks: [e1, e2] }),
      sub('Onboarding mobile', 8, 9, 2, { seq: 'after', productId: pm.id }), sub('Design system : formulaires', 2, 12, 3), sub('Recherche paiement', 9, 0, 1),
      sub('Page tarifs', 4, 6, 3), sub('Notifications', 5, 5, 4), sub('Accessibilité RGAA', 8, 10, 1, { seq: 'sim' }), sub('Mode sombre', 0, 14, 4),
      sub('Chatbot support', 10, 8, 3, { status: 'out' }), sub('Revues design et support aux équipes', 4, 6, 3, { seq: 'bg' })]
  });
}

/* ---------- Calcul : capacité et dispatch ---------- */
const PROFILES = ['UX', 'UI'];
const PRIOS = { 1: 'P1 Critique', 2: 'P2 Haute', 3: 'P3 Moyenne', 4: 'P4 Basse' };
const newSubject = (name = 'Nouveau sujet', ux = 0, ui = 0, prio = 3, seq = 'after') => ({ id: uid(), name, ux, ui, prio, seq, assign: 'auto', splittable: true, status: 'todo', tasks: [] });
const SEQS = { after: 'UI après UX', sim: 'Simultanés', bg: 'Tâche de fond (lissée)' };
const parseSeq = v => /fond|liss|\bbg\b|background/i.test(String(v || '')) ? 'bg' : /simul|ensemble|parall|\bsim\b|même temps/i.test(String(v || '')) ? 'sim' : 'after';
const tasksOf = s => Array.isArray(s?.tasks) ? s.tasks : [];
const loadOf = (s, f) => tasksOf(s).length ? tasksOf(s).reduce((a, t) => a + num(t[f]), 0) : num(s[f]);
const byOrder = () => S.orderMode === 'list' ? S.subjects.slice() : byPrio();
const byPrio = () => S.subjects.map((s, i) => [s, i]).sort((a, b) => (a[0].prio || 3) - (b[0].prio || 3) || a[1] - b[1]).map(x => x[0]);
function parsePrio(v) {
  const t = String(v || '').trim().toLowerCase();
  if (!t) return 3;
  const n = parseInt(t.replace(/^p/, ''), 10); if ([1, 2, 3, 4].includes(n)) return n;
  if (/crit|must|bloq/.test(t)) return 1; if (/haut|high|should/.test(t)) return 2; if (/bas|low|could|faible/.test(t)) return 4;
  return 3;
}
function topo(tasks) {
  const ids = new Set(tasks.map(t => t.id)), done = new Set(), out = [];
  while (out.length < tasks.length) {
    let moved = false;
    for (const t of tasks) if (!done.has(t.id) && t.deps.filter(d => ids.has(d)).every(d => done.has(d))) { done.add(t.id); out.push(t); moved = true; }
    if (!moved) tasks.forEach(t => { if (!done.has(t.id)) { done.add(t.id); out.push(t); } });
  }
  return out;
}
function dependsOn(sub, fromId, targetId, seen = new Set()) {
  if (fromId === targetId) return true;
  if (seen.has(fromId)) return false; seen.add(fromId);
  const t = tasksOf(sub).find(x => x.id === fromId);
  return !!t && t.deps.some(d => dependsOn(sub, d, targetId, seen));
}
const unitLabel = (sub, t) => t ? `${sub.name || 'Sans nom'} › ${t.name || 'Sous-tâche'}` : (sub.name || 'Sans nom');

const eventsFor = m => S.events.filter(e => e.who === 'all' || e.who === m.profile || (e.who === 'custom' && e.members.includes(m.id)));
const whoLabel = e => e.who === 'all' ? 'Toute l\'équipe' : e.who === 'UX' ? 'Profils UX' : e.who === 'UI' ? 'Profils UI' : (S.members.filter(m => e.members.includes(m.id)).map(m => m.name).join(', ') || 'Personne');
const prodOf = id => S.product.find(x => x.id === id);
const prodLabel = p => p ? `${p.name}${p.role ? ' (' + p.role + ')' : ''}` : '';
const personOf = id => S.members.find(x => x.id === id) || S.product.find(x => x.id === id);
let absCache = {};
function absentFrac(pid, d) {
  if (!pid) return 0;
  if (!absCache[pid]) {
    const m = {};
    S.leaves.filter(l => l.memberId === pid && validD(l.start)).forEach(l => { const e = validD(l.end) ? l.end : l.start; for (let x = l.start, g = 0; x <= e && g < 400; x = addDays(x, 1), g++) m[x] = Math.min(1, (m[x] || 0) + (Number(l.quot) || 1)); });
    absCache[pid] = m;
  }
  return absCache[pid][d] || 0;
}
const absentDays = (pid, a, b) => { let n = 0; if (!pid || !validD(a) || !validD(b)) return 0; for (let d = a, g = 0; d <= b && g < 400; d = addDays(d, 1), g++) if (isWorking(d)) n += absentFrac(pid, d); return n; };
function compute() {
  absCache = {};
  holidaySet = new Set(S.holidays.map(h => h.date || h));
  const sprints = S.sprints.map(sp => {
    const jo = workDays(sp.start, sp.end), weeks = sprintWeeks(sp), reuEtp = meetingPerEtp(sp);
    const per = {}; PROFILES.forEach(p => per[p] = { brut: 0, conges: 0, ev: 0, reu: 0, cap: 0, used: 0 });
    const members = {};
    S.members.forEach(m => {
      const etp = num(m.etp), brut = jo * etp;
      const lv = S.leaves.filter(l => l.memberId === m.id && validD(l.start)), evs = eventsFor(m).filter(e => validD(e.start));
      let lvD = 0, evD = 0;
      if ((lv.length || evs.length) && validD(sp.start) && validD(sp.end)) {
        for (let d = sp.start, g = 0; d <= sp.end && g < 400; d = addDays(d, 1), g++) {
          if (!isWorking(d)) continue;
          let a = 0, b = 0;
          lv.forEach(l => { if (d >= l.start && d <= (validD(l.end) ? l.end : l.start)) a += Number(l.quot) || 1; });
          a = Math.min(1, a);
          evs.forEach(e => { if (d >= e.start && d <= (validD(e.end) ? e.end : e.start)) b += Number(e.quot) || 1; });
          b = Math.min(1 - a, b);
          lvD += a; evD += b;
        }
      }
      const cg = lvD * etp, ev = evD * etp;
      const reu = Math.max(0, Math.min(reuEtp * etp, brut - cg - ev)), cap = Math.max(0, brut - cg - ev - reu);
      members[m.id] = { brut, cg, ev, lvD, evD, reu, cap };
      const P = per[m.profile]; if (P) { P.brut += brut; P.conges += cg; P.ev += ev; P.reu += reu; P.cap += cap; }
    });
    return { ...sp, jo, weeks, reuEtp, per, members, items: [] };
  });
  const rem = sprints.map(s => ({ UX: s.per.UX.cap, UI: s.per.UI.cap }));
  const place = {}, lastSi = {}, unplanned = [], manualKeys = new Set();
  const off = S.depMode === 'same' ? 0 : 1, depBad = new Set();
  const C_manual = u => manualKeys.has(u.id);
  const active = S.subjects.filter(s => s.status !== 'out');
  const unitsOf = sub => tasksOf(sub).length ? topo(tasksOf(sub)) : [null];
  const keyOf = (sub, t) => t ? t.id : sub.id;
  const push = (si, sub, t, ux, ui, manual, part, bg) => {
    sprints[si].items.push({ sub, task: t, ux, ui, manual, part, bg });
    sprints[si].per.UX.used += ux; sprints[si].per.UI.used += ui;
    rem[si].UX -= ux; rem[si].UI -= ui;
    (place[keyOf(sub, t)] = place[keyOf(sub, t)] || []).push(si);
    if (t) (place[sub.id] = place[sub.id] || []).push(si);
  };
  // 1. placements manuels
  active.forEach(sub => unitsOf(sub).forEach(t => {
    const u = t || sub, k = keyOf(sub, t);
    if (t && t.kind === 'wait') return;
    if (u.assign && u.assign !== 'auto') {
      const si = sprints.findIndex(x => x.id === u.assign);
      if (si >= 0) { push(si, sub, t, num(u.ux), num(u.ui), true); manualKeys.add(k); lastSi[k] = si; }
    }
  }));
  // 2. dispatch automatique : priorité, puis ordre de la liste, puis dépendances
  const bgQueue = [], waits = {};
  const elig = sprints.map((x, i) => i).filter(i => !sprints[i].excluded);
  byOrder().filter(s => s.status !== 'out').forEach(sub => unitsOf(sub).forEach(t => {
    const u = t || sub, k = keyOf(sub, t);
    if (manualKeys.has(k)) return;
    if (t && t.kind === 'wait') {
      // Attente : pas de charge, mais une durée en jours ouvrés qui décale les sous-tâches qui en dépendent.
      let start = (sprints[elig[0]] || sprints[0] || {}).start, block = null;
      for (const d of t.deps) {
        const dt = tasksOf(sub).find(x => x.id === d); if (!dt || dt.seq === 'bg') continue;
        if (dt.kind === 'wait') { if (!waits[d] || !waits[d].ok) { block = dt; break; } if (waits[d].end > start) start = waits[d].end; continue; }
        if (lastSi[d] === undefined) { block = dt; break; }
        const after = addDays(sprints[lastSi[d]].end, 1); if (after > start) start = after;
      }
      if (block || !validD(start)) { waits[t.id] = { ok: false, blockedBy: block }; return; }
      for (let g2 = 0; g2 < 30 && !isWorking(start); g2++) start = addDays(start, 1);
      let end = start, n = 0, g = 0;
      let lost = 0;
      while (n < num(t.wait) - EPS && g++ < 1000) {
        if (isWorking(end)) { const a = absentFrac(sub.productId, end); n += Math.min(1 - a, num(t.wait) - n); lost += a; }
        end = addDays(end, 1);
      }
      const ready = sprints.findIndex(sp => validD(sp.start) && sp.start >= end);
      waits[t.id] = { ok: ready >= 0, start, end, last: addDays(end, -1), ready, lost };
      if (ready >= 0) lastSi[k] = ready - off;
      return;
    }
    if (u.seq === 'bg') { bgQueue.push({ sub, t, u, k }); return; }
    let ux = num(u.ux), ui = num(u.ui), minSi = 0, blocked = null, after = null;
    if (t) for (const d of t.deps) {
      const dt = tasksOf(sub).find(x => x.id === d); if (!dt || dt.seq === 'bg') continue;
      if (lastSi[d] === undefined) { blocked = dt; break; }
      if (lastSi[d] + off > minSi) { minSi = lastSi[d] + off; after = dt; }
    }
    if (blocked) { unplanned.push({ sub, task: t, ux, ui, partial: false, reason: blocked.kind === 'wait' ? (waits[blocked.id] && waits[blocked.id].end ? `elle attend « ${blocked.name} », qui se termine après le dernier sprint (le ${shortD(waits[blocked.id].last)})` : `elle attend « ${blocked.name} », qui ne peut pas démarrer`) : `elle attend « ${blocked.name} », qui n'est pas entièrement planifiée` }); return; }
    if (after && after.kind === 'wait') after = { name: after.name };
    const el = elig.filter(i => i >= minSi);
    const reason = after ? `aucun sprint n'a assez de capacité ${off ? 'après' : 'à partir de'} « ${after.name} »` : '';
    {
      // Répartit une charge sur une liste de sprints, en réservant la capacité au fur et à mesure.
      const fill = (list, f, need, acc) => {
        for (const i of list) {
          if (need <= EPS) break;
          const a = Math.min(Math.max(rem[i][f], 0), need);
          if (a > EPS) { acc[i] = acc[i] || { UX: 0, UI: 0 }; acc[i][f] += a; rem[i][f] -= a; need -= a; }
        }
        return need;
      };
      const acc = {};
      let why = reason;
      if (u.seq === 'after' && ux > EPS && ui > EPS) {
        ux = fill(el, 'UX', ux, acc);
        if (ux > EPS) why = 'l\'UI attend la fin de l\'UX, qui ne tient pas dans le PI';
        else {
          const lastUx = Math.max(...Object.keys(acc).map(Number));
          const elUi = el.filter(i => i >= lastUx + off);
          ui = fill(elUi, 'UI', ui, acc);
          if (ui > EPS) why = `aucun sprint n'a assez de capacité UI ${off ? 'après la fin' : 'à partir de la fin'} de l'UX`;
        }
      } else {
        // Simultanés : UX et UI avancent ensemble, sprint par sprint.
        for (const i of el) {
          if (ux <= EPS && ui <= EPS) break;
          const a = Math.min(Math.max(rem[i].UX, 0), ux), b = Math.min(Math.max(rem[i].UI, 0), ui);
          if (a > EPS || b > EPS) { acc[i] = { UX: a, UI: b }; ux -= a; ui -= b; rem[i].UX -= a; rem[i].UI -= b; }
        }
      }
      const parts = Object.keys(acc).map(Number).sort((a, b) => a - b).map(i => [i, acc[i].UX, acc[i].UI]);
      parts.forEach(([i, a, b]) => { rem[i].UX += a; rem[i].UI += b; });
      const partial = ux > EPS || ui > EPS;
      if (!parts.length && num(u.ux) + num(u.ui) <= EPS && el.length) parts.push([el[0], 0, 0]);
      parts.forEach(([i, a, b], n) => push(i, sub, t, a, b, false, parts.length > 1 || partial ? `${n + 1}/${parts.length}${partial ? '+' : ''}` : null));
      if (partial || !parts.length) unplanned.push({ sub, task: t, ux, ui, partial: parts.length > 0, reason: why });
      else lastSi[k] = Math.max(...parts.map(x => x[0]));
    }
  }));
  // 3. tâches de fond : lissées sur le PI, au prorata de la capacité restant libre dans chaque sprint
  bgQueue.forEach(({ sub, t, u, k }) => {
    let minSi = 0;
    if (t) t.deps.forEach(d => { const dt = tasksOf(sub).find(x => x.id === d); if (dt && dt.seq !== 'bg' && lastSi[d] !== undefined) minSi = Math.max(minSi, lastSi[d] + off); });
    const el = elig.filter(i => i >= minSi), acc = {};
    const left = {};
    ['UX', 'UI'].forEach(f => {
      let need = num(u[f.toLowerCase()]);
      const avail = el.map(i => Math.max(rem[i][f], 0)), sum = avail.reduce((a, b) => a + b, 0);
      const take = Math.min(need, sum);
      if (take > EPS) el.forEach((i, n) => { const a = take * avail[n] / sum; if (a > EPS) { acc[i] = acc[i] || { UX: 0, UI: 0 }; acc[i][f] += a; } });
      left[f] = need - take;
    });
    const parts = Object.keys(acc).map(Number).sort((a, b) => a - b);
    if (!parts.length && num(u.ux) + num(u.ui) <= EPS && el.length) parts.push(el[0]), acc[el[0]] = { UX: 0, UI: 0 };
    parts.forEach(i => push(i, sub, t, acc[i].UX, acc[i].UI, false, null, true));
    if (left.UX > EPS || left.UI > EPS) unplanned.push({ sub, task: t, ux: left.UX, ui: left.UI, partial: parts.length > 0, reason: 'tâche de fond : il ne reste plus assez de capacité libre sur le PI', bg: true });
    else if (parts.length) lastSi[k] = Math.max(...parts);
  });
  const rank = new Map(byOrder().map((x, i) => [x.id, i]));
  const pr = x => (x.bg ? 1e6 : 0) + (rank.get(x.sub.id) ?? 0);
  sprints.forEach(x => x.items.sort((a, b) => pr(a) - pr(b)));
  unplanned.sort((a, b) => pr(a) - pr(b));
  // 3. alertes
  const alerts = [], warns = [];
  sprints.forEach(x => {
    x.over = false;
    PROFILES.forEach(p => {
      const P = x.per[p];
      if (P.used > P.cap + EPS) { x.over = true; alerts.push(`${x.name} : charge ${p} de ${fmt(P.used)} j pour une capacité de ${fmt(P.cap)} j (dépassement de ${fmt(P.used - P.cap)} j).`); }
      else if (P.cap > 0 && P.used / P.cap >= 0.9) warns.push(`${x.name} : ${p} chargé à ${Math.round(P.used / P.cap * 100)} %.`);
    });
  });
  const rest = u => `${u.ux > EPS ? 'UX ' + fmt(u.ux) + ' j' : ''}${u.ux > EPS && u.ui > EPS ? ' et ' : ''}${u.ui > EPS ? 'UI ' + fmt(u.ui) + ' j' : ''}`;
  unplanned.forEach(u => alerts.push(`« ${unitLabel(u.sub, u.task)} » (P${u.sub.prio || 3}) ${u.partial ? 'n\'est planifié qu\'en partie' : 'n\'est pas planifié'}${u.reason ? ' : ' + u.reason : ''}${rest(u) ? ` (reste ${rest(u)})` : ''}.`));
  active.forEach(sub => tasksOf(sub).forEach(t => t.deps.forEach(d => {
    const dt = tasksOf(sub).find(x => x.id === d), a = place[t.id], b = place[d];
    if (!dt || !a || !b) return;
    const first = Math.min(...a), lastD = Math.max(...b);
    if (first < lastD + off) depBad.add(t.id);
    if (first < lastD + off) alerts.push(`Dépendance non respectée : « ${unitLabel(sub, t)} » est en ${sprints[first].name} alors que « ${dt.name} » se termine en ${sprints[lastD].name}.`);
  })));
  if (off) active.forEach(sub => (tasksOf(sub).length ? tasksOf(sub) : [sub]).forEach(u => {
    if (u.seq === 'after' && C_manual(u) && num(u.ux) > EPS && num(u.ui) > EPS) warns.push(`« ${unitLabel(sub, u === sub ? null : u)} » est placé à la main dans un seul sprint alors que son UI doit passer après l'UX.`);
  }));
  const tot = {}; PROFILES.forEach(p => {
    tot[p] = { cap: sprints.filter(x => !x.excluded).reduce((a, x) => a + x.per[p].cap, 0), load: active.reduce((a, x) => a + loadOf(x, p === 'UX' ? 'ux' : 'ui'), 0) };
    if (tot[p].load > tot[p].cap + EPS) alerts.unshift(`Sur l'ensemble du PI, la charge ${p} (${fmt(tot[p].load)} j) dépasse la capacité à faire (${fmt(tot[p].cap)} j).`);
  });
  PROFILES.forEach(p => { if (!S.members.some(m => m.profile === p) && tot[p].load > 0) alerts.unshift(`Aucune personne de profil ${p} dans l'équipe alors que des sujets ont une charge ${p}.`); });
  const out = S.subjects.filter(x => x.status === 'out');
  Object.entries(waits).forEach(([id, w]) => { if (w.end && !w.ok) { const sub = active.find(x => tasksOf(x).some(t => t.id === id)); const t = tasksOf(sub).find(x => x.id === id); warns.push(`L'attente « ${unitLabel(sub, t)} » se termine le ${shortD(w.last)}, après le dernier sprint du PI.`); } });
  const impacts = [];
  sprints.forEach(sp => {
    const by = {};
    sp.items.forEach(it => { const pid = it.sub.productId; if (!pid || !prodOf(pid)) return; (by[pid] = by[pid] || new Set()).add(it.sub.name || 'Sans nom'); });
    Object.entries(by).forEach(([pid, names]) => {
      const n = absentDays(pid, sp.start, sp.end); sp.poAbs = sp.poAbs || {}; sp.poAbs[pid] = n;
      if (n > EPS) impacts.push(`${sp.name} : ${prodLabel(prodOf(pid))} est en congé ${fmt(n)} j sur ${sp.jo} j ouvrés. Sujets concernés : ${[...names].join(', ')}.`);
    });
  });
  Object.entries(waits).forEach(([id, w]) => {
    if (!(w.lost > EPS)) return;
    const sub = active.find(x => tasksOf(x).some(t => t.id === id)), t = tasksOf(sub).find(x => x.id === id);
    impacts.push(`« ${unitLabel(sub, t)} » est allongée de ${fmt(w.lost)} j par les congés de ${prodLabel(prodOf(sub.productId))} : elle se termine le ${shortD(w.last)}`);
  });
  return { sprints, place, unplanned, alerts, warns, tot, out, manualKeys, depBad, waits, impacts };
}

/* ---------- Rendu ---------- */
let tab = 'plan', C = null;
const sprintLabel = id => (S.sprints.find(s => s.id === id) || {}).name || '?';

function renderNav() {
  const list = sortedPIs(), i = list.findIndex(p => p.id === S.id);
  $('#piNav').innerHTML = `<button class="icon" data-act="prevPI" ${i > 0 ? '' : 'disabled'} aria-label="PI précédent">‹ Précédent</button>
    <select id="piSelect" aria-label="Choisir un PI">${list.map(p => `<option value="${p.id}" ${p.id === S.id ? 'selected' : ''}>${esc(p.piName || 'Sans nom')} (${piRange(p)})</option>`).join('')}</select>
    <button class="icon" data-act="nextPI" ${i >= 0 && i < list.length - 1 ? '' : 'disabled'} aria-label="PI suivant">Suivant ›</button>
    <button class="btn small" data-act="newPI">Nouveau PI</button>
    <button class="icon" data-act="exportPI" title="Télécharger ce PI dans un fichier .json">Exporter</button>
    <button class="icon" data-act="importPI" title="Charger un ou plusieurs PI depuis un fichier .json">Importer</button>
    ${list.length > 1 ? `<button class="linkbtn" data-act="delPI">Supprimer ce PI</button>` : ''}`;
}
function renderHeader() {
  renderNav();
  if (document.activeElement !== $('#piName')) $('#piName').value = S.piName || '';
  const first = S.sprints[0], last = S.sprints[S.sprints.length - 1];
  $('#piSub').textContent = first ? `${S.sprints.length} sprints, du ${shortD(first.start)} au ${shortD(last.end)}` : 'Aucun sprint';
  const k = PROFILES.map(p => {
    const t = C.tot[p], pc = t.cap ? Math.round(t.load / t.cap * 100) : 0, bad = t.load > t.cap + EPS;
    return `<div class="kpi ${p.toLowerCase()} ${bad ? 'bad' : ''}"><b>${fmt(t.load)} / ${fmt(t.cap)} j</b><small>Charge / capacité ${p} (${pc} %)</small></div>`;
  }).join('');
  $('#kpis').innerHTML = k + `<div class="kpi ${C.alerts.length ? 'bad' : ''}"><b>${C.alerts.length}</b><small>Alerte${C.alerts.length > 1 ? 's' : ''}</small></div>`;
  document.querySelectorAll('#tabs button').forEach(b => {
    b.setAttribute('aria-selected', b.dataset.tab === tab);
    if (b.dataset.tab === 'plan') b.innerHTML = 'Plan' + (C.alerts.length ? `<span class="badge">${C.alerts.length}</span>` : '');
  });
}

function gauge(p, P) {
  const max = Math.max(P.cap, P.used, EPS);
  const fill = Math.min(P.used, P.cap) / max * 100, capPos = P.cap / max * 100, over = Math.max(0, P.used - P.cap) / max * 100;
  const isOver = P.used > P.cap + EPS, rest = P.cap - P.used;
  return `<div class="gauge g-${p.toLowerCase()} ${isOver ? 'over' : ''}">
    <div class="g-lbl"><span>${p}</span><span class="g-val">${fmt(P.used)} / ${fmt(P.cap)} j</span></div>
    <div class="g-track" role="img" aria-label="${p} : ${fmt(P.used)} jours utilisés sur ${fmt(P.cap)} jours de capacité">
      <div class="g-fill" style="width:${fill}%"></div>${over ? `<div class="g-over" style="left:${capPos}%;width:${over}%"></div>` : ''}<div class="g-cap" style="left:calc(${capPos}% - 1px)"></div>
    </div>
    <div class="g-rest">${isOver ? `Dépassement : ${fmt(-rest)} j` : `Reste : ${fmt(rest)} j`}</div></div>`;
}

function chip(it) {
  const s = it.sub, t = it.task, tot = it.ux + it.ui, ratio = tot ? it.ux / tot * 100 : 50;
  const st = it.out ? 'out' : (t ? t.status : s.status) || 'todo';
  const deps = t ? t.deps.map(d => tasksOf(s).find(x => x.id === d)?.name).filter(Boolean) : [];
  return `<div class="chip ${st === 'done' ? 'done' : ''} ${it.bg ? 'bgc' : ''}" draggable="true" data-drag="${t ? t.id : s.id}" style="--r:${ratio}%" title="Glisser vers un autre sprint">
    <span class="st ${st}" aria-label="${statusLabel(st)}"></span>
    ${t ? `<span class="stitle">${esc(s.name || 'Sans nom')}</span>` : ''}
    <span class="nm">${esc(t ? t.name : s.name || 'Sans nom')}</span>
    <div class="ld"><span class="pill p${s.prio || 3}" title="${PRIOS[s.prio || 3]}">P${s.prio || 3}</span>${it.ux > EPS ? `<span class="pill ux">UX ${fmt(it.ux)} j</span>` : ''}${it.ui > EPS ? `<span class="pill ui">UI ${fmt(it.ui)} j</span>` : ''}
    ${it.part === 'reste' ? `<span class="meta">Reste à planifier</span>` : it.part ? `<span class="meta">Partie ${it.part.replace('+', '')}${it.part.endsWith('+') ? ', incomplet' : ''}</span>` : ''}${it.manual ? `<span class="meta">Placé à la main</span>` : ''}${(t || s).seq === 'sim' && !(tasksOf(s).length && !t) ? `<span class="meta">UX et UI simultanés</span>` : ''}${(t || s).seq === 'bg' && !(tasksOf(s).length && !t) ? `<span class="meta">Tâche de fond${it.bg ? ', lissée' : ''}</span>` : ''}${it.out && tasksOf(s).length ? `<span class="meta">${tasksOf(s).length} sous-tâches</span>` : ''}</div>
    ${deps.length ? `<div class="meta">Après : ${esc(deps.join(', '))}</div>` : ''}${it.poAbs > EPS ? `<div class="meta po">${esc(prodOf(s.productId)?.name || '')} en congé ${fmt(it.poAbs)} j</div>` : ''}</div>`;
}
const statusLabel = s => ({ todo: 'À faire', doing: 'En cours', done: 'Terminé', out: 'Hors PI' }[s || 'todo']);

function renderPlan() {
  const el = $('#p-plan');
  let h = '';
  if (C.impacts.length) h += `<div class="alerts impact"><h3>Impacts des congés de l'équipe Produit</h3><ul>${C.impacts.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
  if (C.alerts.length) h += `<div class="alerts" role="alert"><h3>${C.alerts.length} alerte${C.alerts.length > 1 ? 's' : ''} de charge</h3><ul>${C.alerts.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
  else if (S.subjects.length) h += `<div class="alerts okbox"><h3>Tous les sujets tiennent dans la capacité</h3>${C.warns.length ? `<ul>${C.warns.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<span class="hint">Aucun sprint n\'est chargé au-delà de 90 %.</span>'}</div>`;
  h += `<div class="toolbar">
    <div class="legend"><span><i></i>À faire</span><span><i class="doing"></i>En cours</span><span><i class="done"></i>Terminé</span><span>Glissez un sujet ou une sous-tâche pour la placer à la main.</span></div>
    <span class="sp"></span>
    <label class="f" style="flex-direction:row;align-items:center;gap:6px">Placement :<select aria-label="Ordre de placement des sujets" data-c="root" data-f="orderMode" data-struct="1"><option value="prio" ${S.orderMode !== 'list' ? 'selected' : ''}>la priorité prime</option><option value="list" ${S.orderMode === 'list' ? 'selected' : ''}>l'ordre de la liste prime</option></select></label>
    <button class="btn ghost small" data-act="freeze">Figer le dispatch</button>
    <button class="btn ghost small" data-act="allauto">Tout remettre en automatique</button></div>`;
  h += `<div class="board">`;
  C.sprints.forEach(s => {
    h += `<div class="col ${s.over ? 'over' : ''} ${s.excluded ? 'excl' : ''}" data-drop="${s.id}">
      <div class="colh"><b>${esc(s.name)}</b><small>${shortD(s.start)} au ${shortD(s.end)}<br>${s.weeks} sem., ${s.jo} j ouvrés${s.ip ? ', innovation' : ''}${s.pip ? ', PI Planning' : ''}${s.excluded ? ', hors dispatch' : ''}</small></div>
      ${gauge('UX', s.per.UX)}${gauge('UI', s.per.UI)}
      <details class="brk"><summary>Calcul de la capacité à faire</summary><table>
        <tr><td></td><td class="num"><span class="pill ux">UX</span></td><td class="num"><span class="pill ui">UI</span></td></tr>
        <tr><td>Jours ouvrés × ETP</td><td class="num">${fmt(s.per.UX.brut)}</td><td class="num">${fmt(s.per.UI.brut)}</td></tr>
        <tr><td>− Congés (× ETP)</td><td class="num">${fmt(s.per.UX.conges)}</td><td class="num">${fmt(s.per.UI.conges)}</td></tr>
        <tr><td>− Évènements (× ETP)</td><td class="num">${fmt(s.per.UX.ev)}</td><td class="num">${fmt(s.per.UI.ev)}</td></tr>
        <tr><td>− Réunions (${fmt(s.reuEtp)} j par ETP)</td><td class="num">${fmt(s.per.UX.reu)}</td><td class="num">${fmt(s.per.UI.reu)}</td></tr>
        <tr class="tot"><td>Capacité à faire</td><td class="num">${fmt(s.per.UX.cap)}</td><td class="num">${fmt(s.per.UI.cap)}</td></tr>
        <tr><td>Capacité utilisée</td><td class="num">${fmt(s.per.UX.used)}</td><td class="num">${fmt(s.per.UI.used)}</td></tr>
      </table></details>
      <div class="items">${s.items.length ? s.items.map(it => chip(Object.assign({}, it, { poAbs: (s.poAbs || {})[it.sub.productId] || 0 }))).join('') : `<div class="empty">${s.excluded ? 'Sprint exclu du dispatch automatique. Vous pouvez y glisser un sujet.' : 'Aucun sujet'}</div>`}</div></div>`;
  });
  h += `<div class="col unpl" data-drop="auto"><div class="colh"><b>Non planifiés</b><small>Déposer ici remet<br>le sujet en automatique</small></div>
    <div class="items">${C.unplanned.length ? C.unplanned.map(u => chip({ sub: u.sub, task: u.task, ux: u.ux, ui: u.ui, part: u.partial ? 'reste' : null })).join('') : `<div class="empty">${S.subjects.length ? 'Tous les sujets sont placés.' : 'Ajoutez des sujets dans l\'onglet Sujets.'}</div>`}</div></div>`;
  h += `<div class="col outc" data-drop="out"><div class="colh"><b>Hors PI</b><small>Non inclus dans ce PI.<br>Déposer ici exclut le sujet</small></div>
    <div class="items">${C.out.length ? C.out.map(x => chip({ sub: x, ux: loadOf(x, 'ux'), ui: loadOf(x, 'ui'), out: true })).join('') : '<div class="empty">Aucun sujet hors PI.</div>'}</div></div>`;
  h += `</div>`;

  // Capacité par personne
  h += `<h2>Capacité à faire par personne</h2><p class="hint">Jours ouvrés × ETP, moins les congés et les évènements d'équipe (× ETP), moins les réunions : ${fmt(num(S.meeting))} j par ETP pour ${fmt(num(S.meetingWeeks) || 3)} semaines, au prorata de la durée de chaque sprint.</p><div class="card tscroll"><table class="t"><thead><tr><th>Personne</th><th>Profil</th><th class="num">ETP</th>${C.sprints.map(s => `<th class="num">${esc(s.name)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>`;
  S.members.forEach(m => {
    let t = 0;
    h += `<tr><td>${esc(m.name)}</td><td><span class="pill ${m.profile.toLowerCase()}">${m.profile}</span></td><td class="num">${fmt(num(m.etp))}</td>` +
      C.sprints.map(s => { const x = s.members[m.id]; if (!s.excluded) t += x.cap; return `<td class="num cap"><b>${fmt(x.cap)}</b>${x.lvD ? `<small>${fmt(x.lvD)} j de congés${num(m.etp) !== 1 ? `, −${fmt(x.cg)} j` : ''}</small>` : ''}${x.evD ? `<small>${fmt(x.evD)} j d'évènements${num(m.etp) !== 1 ? `, −${fmt(x.ev)} j` : ''}</small>` : ''}</td>`; }).join('') + `<td class="num"><b>${fmt(t)}</b></td></tr>`;
  });
  PROFILES.forEach(p => {
    h += `<tr class="sum"><td colspan="3">Capacité à faire ${p}</td>${C.sprints.map(s => `<td class="num">${fmt(s.per[p].cap)}</td>`).join('')}<td class="num">${fmt(C.tot[p].cap)}</td></tr>`;
    h += `<tr class="sum"><td colspan="3">Capacité utilisée ${p}</td>${C.sprints.map(s => `<td class="num ${s.per[p].used > s.per[p].cap + EPS ? 'bad' : ''}">${fmt(s.per[p].used)}</td>`).join('')}<td class="num">${fmt(C.sprints.reduce((a, s) => a + s.per[p].used, 0))}</td></tr>`;
  });
  h += `</tbody></table></div><p class="hint" style="margin-top:8px">Le total exclut les sprints hors dispatch.</p>`;
  el.innerHTML = h;
}

function renderSprints() {
  const g = S.gen;
  let h = '';
  if (!S.subjects.length) h += `<p class="hint">Pour découvrir l'outil, vous pouvez <button class="linkbtn" data-act="example">charger un exemple</button>.</p>`;
  h += `<h2>Générer les sprints</h2><div class="card"><div class="row">
    <label class="f">Début du premier sprint<input type="date" data-c="gen" data-f="start" value="${esc(g.start)}"></label>
    <label class="f">Durée d'un sprint (semaines)<input type="number" min="1" max="8" step="1" data-c="gen" data-f="weeks" data-num="1" value="${g.weeks}"></label>
    <label class="f">Nombre de sprints (PIP et IP compris)<input type="number" min="1" max="12" step="1" data-c="gen" data-f="count" data-num="1" value="${g.count}"></label>
    <label class="f" style="flex-direction:row;align-items:center;gap:6px;padding-bottom:8px"><input type="checkbox" data-c="gen" data-f="pip" ${g.pip ? 'checked' : ''}>Le premier est un sprint PIP (PI Planning)</label>
    <label class="f">Durée du sprint PIP (semaines)<input type="number" min="1" max="4" step="1" data-c="gen" data-f="pipWeeks" data-num="1" value="${g.pipWeeks || 1}"></label>
    <label class="f" style="flex-direction:row;align-items:center;gap:6px;padding-bottom:8px"><input type="checkbox" data-c="gen" data-f="ip" ${g.ip ? 'checked' : ''}>Le dernier est un sprint d'innovation (IP)</label>
    <label class="f">Durée du sprint IP (semaines)<input type="number" min="1" max="8" step="1" data-c="gen" data-f="ipWeeks" data-num="1" value="${g.ipWeeks}"></label>
    <button class="btn" data-act="gen">Générer les sprints</button></div>
    <p class="hint" style="margin:10px 0 0">Le nombre de sprints inclut les sprints PIP et IP. Ils sont exclus du dispatch automatique. Les sprints sont toujours rangés par date de début. Régénérer recalcule les dates ; les sujets placés à la main restent dans leur sprint.</p></div>`;
  h += `<h2>Sprints</h2><div class="card tscroll"><table class="t"><thead><tr><th>Nom</th><th>Début</th><th>Fin</th><th class="num">Semaines</th><th class="num">Jours ouvrés</th><th class="num">Réunions par ETP (j)</th><th>PIP</th><th>IP</th><th>Hors dispatch</th><th></th></tr></thead><tbody>` +
    S.sprints.map(s => `<tr><td><input type="text" data-c="sprints" data-id="${s.id}" data-f="name" value="${esc(s.name)}"></td>
      <td><input type="date" data-c="sprints" data-id="${s.id}" data-f="start" value="${esc(s.start)}"></td>
      <td><input type="date" data-c="sprints" data-id="${s.id}" data-f="end" value="${esc(s.end)}"></td>
      <td class="num" data-derived="wk:${s.id}"></td>
      <td class="num" data-derived="jo:${s.id}"></td>
      <td class="num"><input type="number" min="0" step="0.1" aria-label="Réunions par ETP pour ${esc(s.name)}, vide pour le calcul automatique" data-c="sprints" data-id="${s.id}" data-f="meeting" value="${esc(s.meeting ?? '')}" data-derived="rmph:${s.id}"></td>
      <td><input type="checkbox" aria-label="${esc(s.name)} est le sprint PIP (PI Planning)" data-c="sprints" data-id="${s.id}" data-f="pip" data-struct="1" ${s.pip ? 'checked' : ''}></td>
      <td><input type="checkbox" aria-label="${esc(s.name)} est un sprint d'innovation" data-c="sprints" data-id="${s.id}" data-f="ip" data-struct="1" ${s.ip ? 'checked' : ''}></td>
      <td><input type="checkbox" aria-label="Exclure ${esc(s.name)} du dispatch" data-c="sprints" data-id="${s.id}" data-f="excluded" data-struct="1" ${s.excluded ? 'checked' : ''}></td>
      <td><button class="icon" data-act="del" data-c="sprints" data-id="${s.id}" aria-label="Supprimer ${esc(s.name)}">✕</button></td></tr>`).join('') +
    `</tbody></table><div style="margin-top:10px"><button class="btn ghost small" data-act="addSprint">Ajouter un sprint</button></div>
    <div class="row" style="margin-top:14px;align-items:center;gap:8px;font-size:14px">Réunions par défaut :
      <input type="number" min="0" step="0.5" aria-label="Jours de réunion par ETP" data-c="root" data-f="meeting" data-num="1" data-struct="1" value="${S.meeting}" style="width:70px"> j par ETP pour un sprint de
      <input type="number" min="1" step="1" aria-label="Semaines de référence" data-c="root" data-f="meetingWeeks" data-num="1" data-struct="1" value="${S.meetingWeeks}" style="width:60px"> semaines, au prorata de la durée de chaque sprint.</div>
    <p class="hint" style="margin:8px 0 0">La colonne « Réunions par ETP » affiche ce calcul en grisé. Saisissez une valeur pour la remplacer sur un sprint, par exemple le sprint IP.</p></div>`;
  h += `<h2>Jours fériés</h2><div class="card"><div class="row"><label class="f">Date<input type="date" id="hDate"></label><button class="btn ghost small" data-act="addHoliday">Ajouter</button>
    <button class="btn ghost small" data-act="frHolidays">Ajouter les jours fériés français du PI</button></div>
    <div class="chips" style="margin-top:12px">${S.holidays.length ? S.holidays.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(x => `<span class="hchip">${shortD(x.date)} ${parseD(x.date).getUTCFullYear()}${x.label ? ', ' + esc(x.label) : ''}<button class="icon" data-act="delHoliday" data-id="${x.date}" aria-label="Retirer">✕</button></span>`).join('') : '<span class="hint">Aucun jour férié saisi.</span>'}</div></div>`;
  h += `<h2>Sauvegarde</h2><div class="card"><p class="hint">Exportez vos PI dans un fichier .json pour les sauvegarder, les transmettre ou les ouvrir dans une autre version de l'outil. « Importer » ajoute les PI d'un fichier à ceux déjà présents.</p>
    <div class="row"><button class="btn ghost small" data-act="exportPI">Exporter ce PI</button><button class="btn ghost small" data-act="exportAll">Exporter tous les PI (${Object.keys(ALL).length})</button><button class="btn ghost small" data-act="importPI">Importer un fichier</button></div></div>`;
  h += `<p style="margin-top:28px"><button class="linkbtn" data-act="reset">Vider ce PI et repartir de zéro</button></p>`;
  $('#p-sprints').innerHTML = h;
}

function renderTeam() {
  const opts = (sel) => `<optgroup label="Équipe UX et UI">${S.members.map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)} (${m.profile})</option>`).join('')}</optgroup>` +
    (S.product.length ? `<optgroup label="Équipe Produit">${S.product.map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(prodLabel(m))}</option>`).join('')}</optgroup>` : '');
  let h = `<h2>Équipe</h2><p class="hint">Un ETP à 0,5 correspond à un mi-temps sur le sujet.</p><div class="card tscroll"><table class="t"><thead><tr><th>Nom</th><th>Profil</th><th class="num">ETP</th><th></th></tr></thead><tbody>` +
    S.members.map(m => `<tr><td><input type="text" data-c="members" data-id="${m.id}" data-f="name" data-struct="1" value="${esc(m.name)}"></td>
      <td><select data-c="members" data-id="${m.id}" data-f="profile" data-struct="1">${PROFILES.map(p => `<option ${p === m.profile ? 'selected' : ''}>${p}</option>`).join('')}</select></td>
      <td class="num"><input type="number" min="0" max="1" step="0.1" data-c="members" data-id="${m.id}" data-f="etp" data-num="1" value="${m.etp}"></td>
      <td><button class="icon" data-act="del" data-c="members" data-id="${m.id}" aria-label="Supprimer ${esc(m.name)}">✕</button></td></tr>`).join('') +
    `</tbody></table><div class="row" style="margin-top:10px"><button class="btn ghost small" data-act="addMember" data-p="UX">Ajouter une personne UX</button><button class="btn ghost small" data-act="addMember" data-p="UI">Ajouter une personne UI</button></div></div>`;
  h += `<h2>Équipe Produit</h2><p class="hint">PO, PM… Leur temps ne compte pas dans la capacité UX et UI. Désignez-les comme contact produit d'un sujet (onglet Sujets) : leurs congés allongent alors les attentes du sujet (retour PO…) et sont signalés sur le plan quand le sujet est planifié pendant leur absence.</p><div class="card tscroll"><table class="t"><thead><tr><th>Nom</th><th>Rôle</th><th class="num">Sujets suivis</th><th></th></tr></thead><tbody>` +
    (S.product.length ? S.product.map(m => `<tr><td><input type="text" data-c="product" data-id="${m.id}" data-f="name" data-struct="1" value="${esc(m.name)}"></td>
      <td><input type="text" data-c="product" data-id="${m.id}" data-f="role" data-struct="1" value="${esc(m.role)}" placeholder="PO, PM…" style="min-width:90px"></td>
      <td class="num">${S.subjects.filter(x => x.productId === m.id).length}</td>
      <td><button class="icon" data-act="del" data-c="product" data-id="${m.id}" aria-label="Supprimer ${esc(m.name)}">✕</button></td></tr>`).join('') : `<tr><td colspan="4" class="hint">Personne dans l'équipe Produit.</td></tr>`) +
    `</tbody></table><div style="margin-top:10px"><button class="btn ghost small" data-act="addProduct">Ajouter une personne Produit</button></div></div>`;
  h += `<h2>Congés</h2><p class="hint">Saisissez le premier jour : le dernier jour prend la même date par défaut. Vous pouvez aussi choisir la plage sur le calendrier, en cliquant le premier puis le dernier jour. Seuls les jours ouvrés (hors week-ends et jours fériés) comptent. Un jour de congé est retiré de la capacité au prorata de l'ETP : 1 j pour 1 ETP, 0,5 j pour un mi-temps. Les congés de l'équipe Produit se saisissent ici aussi.</p><div class="card tscroll">`;
  if (!S.members.length) h += `<p class="hint">Ajoutez d'abord des personnes à l'équipe.</p>`;
  else h += `<table class="t"><thead><tr><th>Personne</th><th>Du</th><th>Au</th><th>Durée</th><th class="num">Jours ouvrés</th><th></th></tr></thead><tbody>` +
    (S.leaves.length ? S.leaves.map(l => `<tr><td><select data-c="leaves" data-id="${l.id}" data-f="memberId">${opts(l.memberId)}</select></td>
      <td><input type="date" aria-label="Premier jour" data-c="leaves" data-id="${l.id}" data-f="start" value="${esc(l.start)}"></td>
      <td><div class="lvdates"><input type="date" aria-label="Dernier jour" data-c="leaves" data-id="${l.id}" data-f="end" value="${esc(l.end)}" ${validD(l.start) ? `min="${l.start}"` : ''}>
        <button class="btn ghost small" data-act="openPicker" data-c="leaves" data-id="${l.id}" aria-label="Choisir la plage sur un calendrier">Calendrier</button></div></td>
      <td><select data-c="leaves" data-id="${l.id}" data-f="quot"><option value="1" ${Number(l.quot) !== 0.5 ? 'selected' : ''}>Journées</option><option value="0.5" ${Number(l.quot) === 0.5 ? 'selected' : ''}>½ journée</option></select></td>
      <td class="num" data-derived="lv:${l.id}"></td>
      <td><button class="icon" data-act="del" data-c="leaves" data-id="${l.id}" aria-label="Supprimer ce congé">✕</button></td></tr>`).join('') : `<tr><td colspan="6" class="hint">Aucun congé saisi.</td></tr>`) +
    `</tbody></table><div style="margin-top:10px"><button class="btn ghost small" data-act="addLeave">Ajouter un congé</button></div>`;
  h += `</div>`;
  h += `<h2>Évènements d'équipe</h2><p class="hint">Séminaire, formation, offsite, démo… La durée est retirée de la capacité à faire des personnes concernées, au prorata de leur ETP. Un jour déjà posé en congé n'est pas retiré deux fois.</p><div class="card tscroll">`;
  h += `<table class="t"><thead><tr><th>Évènement</th><th>Du</th><th>Au</th><th>Durée</th><th>Concerne</th><th class="num">Jours ouvrés</th><th></th></tr></thead><tbody>` +
    (S.events.length ? S.events.map(e => `<tr><td><input type="text" data-c="events" data-id="${e.id}" data-f="name" data-struct="1" value="${esc(e.name)}"></td>
      <td><input type="date" aria-label="Premier jour" data-c="events" data-id="${e.id}" data-f="start" value="${esc(e.start)}"></td>
      <td><div class="lvdates"><input type="date" aria-label="Dernier jour" data-c="events" data-id="${e.id}" data-f="end" value="${esc(e.end)}" ${validD(e.start) ? `min="${e.start}"` : ''}>
        <button class="btn ghost small" data-act="openPicker" data-c="events" data-id="${e.id}" aria-label="Choisir la plage sur un calendrier">Calendrier</button></div></td>
      <td><select data-c="events" data-id="${e.id}" data-f="quot"><option value="1" ${Number(e.quot) !== 0.5 ? 'selected' : ''}>Journées</option><option value="0.5" ${Number(e.quot) === 0.5 ? 'selected' : ''}>½ journée</option></select></td>
      <td><select data-c="events" data-id="${e.id}" data-f="who" data-struct="1">${[['all', 'Toute l\'équipe'], ['UX', 'Profils UX'], ['UI', 'Profils UI'], ['custom', 'Personnes choisies']].map(([v, l]) => `<option value="${v}" ${e.who === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${e.who === 'custom' ? `<div style="margin-top:6px">${S.members.map(m => { const on = e.members.includes(m.id); return `<button class="dep ${on ? 'on' : ''}" data-act="evMember" data-id="${e.id}" data-m="${m.id}" aria-pressed="${on}">${esc(m.name)}</button>`; }).join('')}</div>` : ''}</td>
      <td class="num" data-derived="ev:${e.id}"></td>
      <td><button class="icon" data-act="del" data-c="events" data-id="${e.id}" aria-label="Supprimer ${esc(e.name)}">✕</button></td></tr>`).join('') : `<tr><td colspan="7" class="hint">Aucun évènement saisi.</td></tr>`) +
    `</tbody></table><div style="margin-top:10px"><button class="btn ghost small" data-act="addEvent">Ajouter un évènement</button></div></div>`;
  $('#p-team').innerHTML = h;
}

const G = { tasks: true, leaves: true, out: false };
function renderPlanning() {
  const el = $('#p-planning');
  const sps = S.sprints.filter(x => validD(x.start) && validD(x.end) && x.end >= x.start);
  if (!sps.length) { el.innerHTML = '<p class="hint">Ajoutez des sprints dans l\'onglet Sprints pour afficher le planning.</p>'; return; }
  const t0 = sps.reduce((m, x) => x.start < m ? x.start : m, sps[0].start);
  const t1 = addDays(sps.reduce((m, x) => x.end > m ? x.end : m, sps[0].end), 3);
  const D = (parseD(t1) - parseD(t0)) / 864e5;
  const pct = d => Math.max(0, Math.min(100, (parseD(d) - parseD(t0)) / 864e5 / D * 100));
  const sEnd = sp => { const n = sps.find(x => x.start > sp.start); const e = addDays(sp.end, 3); return n && n.start < e ? n.start : e; };
  const bar = (a, b, cls, style, txt, title) => { const L = pct(a), W = Math.max(0.6, pct(b) - L); return `<div class="gbar ${cls}" style="left:calc(${L}% + 2px);width:calc(${W}% - 4px);${style}" title="${esc(title)}">${txt}</div>`; };
  const bySi = {};
  C.sprints.forEach((sp, si) => sp.items.forEach(it => { const k = it.task ? it.task.id : it.sub.id; (bySi[k] = bySi[k] || []).push({ si, ux: it.ux, ui: it.ui, manual: it.manual, bg: it.bg }); }));
  const segs = (k, u, sub, t) => {
    const list = (bySi[k] || []).filter(x => C.sprints[x.si] && validD(C.sprints[x.si].start));
    const done = (t ? t.status : sub.status) === 'done', bad = t && C.depBad.has(t.id);
    return list.map(x => {
      const sp = C.sprints[x.si], tot = x.ux + x.ui, r = tot ? x.ux / tot * 100 : 50;
      const txt = [x.ux > EPS ? `UX ${fmt(x.ux)}` : '', x.ui > EPS ? `UI ${fmt(x.ui)}` : ''].filter(Boolean).join(', ');
      return bar(sp.start, sEnd(sp), `${done ? 'done' : ''} ${bad ? 'bad' : ''} ${x.bg ? 'bgt' : ''}`, `--r:${r}%`, esc(txt), `${unitLabel(sub, t)} en ${sp.name} : ${txt || 'sans charge'}${x.manual ? ', placé à la main' : ''}${x.bg ? ', tâche de fond' : ''}${bad ? '. Dépendance non respectée' : ''}`);
    }).join('');
  };
  const unpl = key => C.unplanned.find(u => (u.task ? u.task.id : u.sub.id) === key);
  const rest = u => [u.ux > EPS ? `UX ${fmt(u.ux)} j` : '', u.ui > EPS ? `UI ${fmt(u.ui)} j` : ''].filter(Boolean).join(', ');
  let rows = '';
  // en-tête
  const today = isoD(new Date());
  let head = sps.map(sp => `<div class="gsp" style="left:${pct(sp.start)}%">${esc(sp.name)}<small>${shortD(sp.start)} au ${shortD(sp.end)}</small></div>`).join('');
  for (let d = toMonday(t0); d < t1; d = addDays(d, 7)) head += `<div class="gwk" style="left:${pct(d)}%">${shortD(d)}</div>`;
  rows += `<div class="grow ghead"><div class="glab">${S.subjects.length} sujets</div><div class="gtrk">${head}</div></div>`;
  // congés
  if (G.leaves) {
    const withLeaves = S.members.filter(m => S.leaves.some(l => l.memberId === m.id && validD(l.start) && (l.end || l.start) >= t0 && l.start <= t1));
    rows += `<div class="grow gsec"><div class="glab">Congés</div><div class="gtrk"></div></div>`;
    rows += withLeaves.length ? withLeaves.map(m => `<div class="grow"><div class="glab"><span class="pill ${m.profile.toLowerCase()}">${m.profile}</span><span class="gname">${esc(m.name)}</span></div><div class="gtrk">${S.leaves.filter(l => l.memberId === m.id && validD(l.start)).map(l => {
      const e = validD(l.end) ? l.end : l.start, n = workDays(l.start, e) * (Number(l.quot) || 1);
      return bar(l.start, addDays(e, 1), 'leave', '', `<span>${fmt(n)} j</span>`, `${m.name} : congé du ${shortD(l.start)} au ${shortD(e)}, ${fmt(n)} j ouvrés`);
    }).join('')}</div></div>`).join('') : `<div class="grow"><div class="glab"><span class="gname calc">Aucun congé sur la période</span></div><div class="gtrk"></div></div>`;
    const prodLeaves = S.product.filter(m => S.leaves.some(l => l.memberId === m.id && validD(l.start) && (l.end || l.start) >= t0 && l.start <= t1));
    if (prodLeaves.length) {
      rows += `<div class="grow gsec"><div class="glab">Congés de l'équipe Produit</div><div class="gtrk"></div></div>`;
      rows += prodLeaves.map(m => `<div class="grow"><div class="glab"><span class="pill prod">${esc(m.role || 'Produit')}</span><span class="gtxt"><span class="gname">${esc(m.name)}</span><span class="gmeta">${S.subjects.filter(x => x.productId === m.id).length} sujet(s) suivi(s)</span></span></div><div class="gtrk">${S.leaves.filter(l => l.memberId === m.id && validD(l.start)).map(l => {
        const e = validD(l.end) ? l.end : l.start, n = workDays(l.start, e) * (Number(l.quot) || 1);
        return bar(l.start, addDays(e, 1), 'leave', '', `<span>${fmt(n)} j</span>`, `${prodLabel(m)} : congé du ${shortD(l.start)} au ${shortD(e)}, ${fmt(n)} j ouvrés`);
      }).join('')}</div></div>`).join('');
    }
    const evs = S.events.filter(e => validD(e.start) && (validD(e.end) ? e.end : e.start) >= t0 && e.start <= t1);
    if (evs.length) {
      rows += `<div class="grow gsec"><div class="glab">Évènements d'équipe</div><div class="gtrk"></div></div>`;
      rows += evs.map(e => { const en = validD(e.end) ? e.end : e.start, n = workDays(e.start, en) * (Number(e.quot) || 1);
        return `<div class="grow"><div class="glab"><span class="gtxt"><span class="gname">${esc(e.name)}</span><span class="gmeta">${esc(whoLabel(e))}</span></span></div><div class="gtrk">${bar(e.start, addDays(en, 1), 'event', '', `${fmt(n)} j`, `${e.name} (${whoLabel(e)}) : du ${shortD(e.start)} au ${shortD(en)}, ${fmt(n)} j ouvrés`)}</div></div>`; }).join('');
    }
  }
  // sujets
  rows += `<div class="grow gsec"><div class="glab">Sujets, ${S.orderMode === 'list' ? 'dans l\'ordre de la liste' : 'par priorité'}</div><div class="gtrk"></div></div>`;
  byOrder().filter(x => x.status !== 'out').forEach(sub => {
    const ts = tasksOf(sub), u = unpl(sub.id), anyUn = C.unplanned.some(x => x.sub.id === sub.id);
    const load = `UX ${fmt(loadOf(sub, 'ux'))}, UI ${fmt(loadOf(sub, 'ui'))}`;
    let trk;
    if (ts.length) {
      const sis = [...new Set(C.place[sub.id] || [])].map(i => C.sprints[i]).filter(x => validD(x.start));
      trk = sis.length ? bar(sis.reduce((m, x) => x.start < m ? x.start : m, sis[0].start), sEnd(sis.reduce((m, x) => x.end > m.end ? x : m, sis[0])), 'sum', '', '', `${sub.name} : du ${shortD(sis[0].start)} à la fin de ${sis[sis.length - 1].name}`) : '';
      if (anyUn) trk += `<span class="gnone" style="left:auto;right:8px">Incomplet</span>`;
    } else trk = segs(sub.id, sub, sub, null) + (u ? `<span class="gnone" ${C.place[sub.id] ? 'style="left:auto;right:8px"' : ''}>${C.place[sub.id] ? 'Reste' : 'Non planifié'} : ${rest(u)}</span>` : '');
    rows += `<div class="grow"><div class="glab"><span class="pill p${sub.prio || 3}">P${sub.prio || 3}</span><span class="gtxt"><button class="gname" data-act="goSubject" data-id="${sub.id}" title="Ouvrir « ${esc(sub.name)} » dans l'onglet Sujets">${esc(sub.name || 'Sans nom')}</button><span class="gmeta">${load} j${ts.length ? `, ${ts.length} sous-tâches` : sub.seq === 'sim' ? ', UX et UI simultanés' : sub.seq === 'bg' ? ', tâche de fond' : ''}</span></span></div><div class="gtrk">${trk}</div></div>`;
    if (ts.length && G.tasks) topo(ts).forEach(t => {
      const tu = unpl(t.id), deps = t.deps.map(d => ts.find(x => x.id === d)?.name).filter(Boolean);
      if (t.kind === 'wait') {
        const w = C.waits[t.id] || {};
        const trk = w.end ? bar(w.start < t0 ? t0 : w.start, w.end > t1 ? t1 : w.end, 'wait', '', `${fmt(num(t.wait))} j`, `${t.name} : attente du ${shortD(w.start)} au ${shortD(w.last)}${w.ok ? '' : ', se termine après le PI'}`) + (w.ok ? '' : '<span class="gnone" style="left:auto;right:8px">Après le PI</span>') : '<span class="gnone">Bloquée</span>';
        rows += `<div class="grow gtask"><div class="glab"><span class="gtxt"><span class="gname" title="${esc(t.name)}">${esc(t.name)}</span><span class="gmeta">Attente${deps.length ? ', après ' + esc(deps.join(', ')) : ''}</span></span></div><div class="gtrk">${trk}</div></div>`;
        return;
      }
      rows += `<div class="grow gtask"><div class="glab"><span class="gtxt"><span class="gname" title="${esc(t.name)}">${esc(t.name)}</span>${deps.length ? `<span class="gmeta" title="Après ${esc(deps.join(', '))}">Après ${esc(deps.join(', '))}</span>` : ''}${t.seq === 'sim' ? '<span class="gmeta">UX et UI simultanés</span>' : t.seq === 'bg' ? '<span class="gmeta">Tâche de fond</span>' : ''}</span></div><div class="gtrk">${segs(t.id, t, sub, t)}${tu ? `<span class="gnone" ${C.place[t.id] ? 'style="left:auto;right:8px"' : ''}>${C.place[t.id] ? 'Reste' : 'Non planifiée'} : ${rest(tu) || 'bloquée'}</span>` : ''}</div></div>`;
    });
  });
  if (G.out && C.out.length) {
    rows += `<div class="grow gsec"><div class="glab">Hors PI</div><div class="gtrk"></div></div>`;
    rows += C.out.map(sub => `<div class="grow"><div class="glab"><span class="pill p${sub.prio || 3}">P${sub.prio || 3}</span><span class="gtxt"><button class="gname" data-act="goSubject" data-id="${sub.id}">${esc(sub.name || 'Sans nom')}</button><span class="gmeta">UX ${fmt(loadOf(sub, 'ux'))}, UI ${fmt(loadOf(sub, 'ui'))} j</span></span></div><div class="gtrk"><span class="gout">Non inclus dans ce PI</span></div></div>`).join('');
  }
  const bands = sps.map((sp, i) => `<div class="gband ${sp.ip || sp.pip ? 'ip' : i % 2 ? 'alt' : ''}" style="left:${pct(sp.start)}%;width:${pct(sEnd(sp)) - pct(sp.start)}%"></div>`).join('') +
    (today >= t0 && today <= t1 ? `<div class="gtoday" style="left:${pct(today)}%" title="Aujourd'hui"></div>` : '');
  el.innerHTML = `<div class="gtools">
      <label><input type="checkbox" data-act="gToggle" data-id="tasks" ${G.tasks ? 'checked' : ''}>Sous-tâches</label>
      <label><input type="checkbox" data-act="gToggle" data-id="leaves" ${G.leaves ? 'checked' : ''}>Congés et évènements</label>
      <label><input type="checkbox" data-act="gToggle" data-id="out" ${G.out ? 'checked' : ''}>Sujets hors PI (${C.out.length})</label></div>
    <div class="glegend"><span><i style="background:var(--ux)"></i>Charge UX</span><span><i style="background:var(--ui)"></i>Charge UI</span><span><i style="background:var(--ink);height:5px"></i>Durée d'un sujet découpé</span>
      <span><i class="" style="background:repeating-linear-gradient(135deg,var(--muted) 0 3px,transparent 3px 6px);border:1px solid var(--muted)"></i>Congé</span><span><i style="background:var(--warn-soft);border:1px solid var(--warn)"></i>Évènement d'équipe</span><span><i style="width:2px;background:var(--alert)"></i>Aujourd'hui</span><span><i style="outline:2px solid var(--alert);background:transparent"></i>Dépendance non respectée</span><span><i style="border:1px dashed var(--ink);background:var(--ux);opacity:.75"></i>Tâche de fond</span><span><i style="border:1px dashed var(--muted);background:var(--sunk)"></i>Attente</span></div>
    <div class="gwrap"><div class="gantt"><div class="gbands">${bands}</div>${rows}</div></div>
    <p class="hint" style="margin-top:8px">Chaque barre montre la charge placée dans un sprint. Cliquez sur un sujet pour le modifier. Le plan se modifie dans l'onglet Plan, par glisser-déposer.</p>`;
}

const openTasks = new Set();
const seqOpts = v => Object.entries(SEQS).map(([k, l]) => `<option value="${k}" ${k === (v || 'after') ? 'selected' : ''}>${l}</option>`).join('');
function renderSubjects() {
  const sOpts = sel => `<option value="auto" ${sel === 'auto' ? 'selected' : ''}>Automatique</option>` + S.sprints.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const stOpts = (sel, withOut) => [['todo', 'À faire'], ['doing', 'En cours'], ['done', 'Terminé']].concat(withOut ? [['out', 'Hors PI']] : []).map(([v, l]) => `<option value="${v}" ${v === (sel || 'todo') ? 'selected' : ''}>${l}</option>`).join('');
  let h = `<h2>Sujets</h2><p class="hint">Le dispatch traite les sujets selon l'ordre de placement choisi ci-dessous : par priorité (P1 d'abord, puis l'ordre de la liste à priorité égale), ou uniquement dans l'ordre de la liste, que vous réglez avec les flèches. Par défaut, l'UI commence une fois l'UX terminée, avec la même règle que les dépendances ci-dessous. Dans la colonne « Répartition », choisissez « Simultanés » quand les deux avancent en même temps, ou « Tâche de fond » pour une charge lissée sur tout le PI : elle est placée en dernier et occupe la capacité restée libre dans chaque sprint, à proportion des trous. Chaque sujet ou sous-tâche est découpé automatiquement sur plusieurs sprints si sa charge ne tient pas dans un seul. Un sujet « Hors PI » n'est pas planifié et ne compte pas dans la charge.</p>
  <div class="row" style="margin-bottom:12px"><label class="f">Ordre de placement des sujets
    <select data-c="root" data-f="orderMode" data-struct="1"><option value="prio" ${S.orderMode !== 'list' ? 'selected' : ''}>La priorité prime, puis l'ordre de la liste</option><option value="list" ${S.orderMode === 'list' ? 'selected' : ''}>L'ordre de la liste prime</option></select></label>
    <label class="f">Une sous-tâche qui dépend d'une autre peut commencer
    <select data-c="root" data-f="depMode"><option value="next" ${S.depMode !== 'same' ? 'selected' : ''}>au sprint suivant la fin de l'autre</option><option value="same" ${S.depMode === 'same' ? 'selected' : ''}>dans le même sprint que la fin de l'autre</option></select></label></div>
  <div class="card tscroll"><table class="t"><thead><tr><th>#</th><th>Priorité</th><th>Sujet</th><th class="num">Charge UX (j)</th><th class="num">Charge UI (j)</th><th>Répartition</th><th>Sprint</th><th>Placement</th><th>Statut</th><th></th></tr></thead><tbody>`;
  if (!S.subjects.length) h += `<tr><td colspan="10" class="hint">Aucun sujet. Ajoutez-en un ou collez une liste depuis un tableur.</td></tr>`;
  S.subjects.forEach((s, i) => {
    const ts = tasksOf(s), has = ts.length > 0, open = openTasks.has(s.id);
    h += `<tr class="${s.status === 'out' ? 'outrow' : ''}">
      <td style="white-space:nowrap"><button class="icon" data-act="up" data-id="${s.id}" aria-label="Monter" ${i ? '' : 'disabled'}>▲</button><button class="icon" data-act="down" data-id="${s.id}" aria-label="Descendre" ${i < S.subjects.length - 1 ? '' : 'disabled'}>▼</button> ${i + 1}</td>
      <td><select aria-label="Priorité" data-c="subjects" data-id="${s.id}" data-f="prio" data-struct="1">${Object.entries(PRIOS).map(([k, l]) => `<option value="${k}" ${Number(k) === (s.prio || 3) ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><input type="text" data-c="subjects" data-id="${s.id}" data-f="name" value="${esc(s.name)}">
        ${S.product.length ? `<select class="prodsel" aria-label="Contact produit de ${esc(s.name)}" data-c="subjects" data-id="${s.id}" data-f="productId"><option value="">Contact produit : aucun</option>${S.product.map(m => `<option value="${m.id}" ${s.productId === m.id ? 'selected' : ''}>Contact produit : ${esc(prodLabel(m))}</option>`).join('')}</select><br>` : ''}
        <button class="linkbtn tbtn" data-act="toggleTasks" data-id="${s.id}" aria-expanded="${open}">${has ? `${open ? 'Masquer' : 'Voir'} les ${ts.length} sous-tâche${ts.length > 1 ? 's' : ''}` : 'Ajouter des sous-tâches'}</button></td>
      ${has ? `<td class="num calc" data-derived="sx:${s.id}:ux"></td><td class="num calc" data-derived="sx:${s.id}:ui"></td>` : `
      <td class="num"><input type="number" min="0" step="0.5" data-c="subjects" data-id="${s.id}" data-f="ux" data-num="1" value="${s.ux}"></td>
      <td class="num"><input type="number" min="0" step="0.5" data-c="subjects" data-id="${s.id}" data-f="ui" data-num="1" value="${s.ui}"></td>`}
      <td>${has ? '<span class="calc">Par sous-tâche</span>' : `<select aria-label="Répartition de la charge" data-c="subjects" data-id="${s.id}" data-f="seq">${seqOpts(s.seq)}</select>`}</td>
      <td>${has ? '<span class="calc">Par sous-tâche</span>' : `<select data-c="subjects" data-id="${s.id}" data-f="assign">${sOpts(s.assign || 'auto')}</select>`}</td>
      <td data-derived="pl:${s.id}"></td>
      <td><select aria-label="Statut" data-c="subjects" data-id="${s.id}" data-f="status" data-struct="1">${stOpts(s.status, true)}</select></td>
      <td><button class="icon" data-act="del" data-c="subjects" data-id="${s.id}" aria-label="Supprimer ${esc(s.name)}">✕</button></td></tr>`;
    if (open) {
      h += `<tr class="subrow"><td></td><td colspan="9"><table class="tt"><thead><tr><th>Ordre</th><th>Sous-tâche</th><th class="num">UX (j)</th><th class="num">UI (j)</th><th>Répartition</th><th>Dépend de</th><th>Sprint</th><th>Placement</th><th>Statut</th><th></th></tr></thead><tbody>` +
        (has ? ts.map((t, ti) => {
          const others = ts.filter(o => o.id !== t.id);
          const deps = others.length ? others.map(o => { const on = t.deps.includes(o.id), cyc = !on && dependsOn(s, o.id, t.id); return `<button class="dep ${on ? 'on' : ''}" data-act="dep" data-sub="${s.id}" data-id="${t.id}" data-dep="${o.id}" aria-pressed="${on}" ${cyc ? 'disabled title="Impossible : cela créerait une boucle de dépendances"' : ''}>${esc(o.name)}</button>`; }).join('') : '<span class="calc">Aucune autre sous-tâche</span>';
          return `<tr><td style="white-space:nowrap"><button class="icon" data-act="taskMove" data-dir="-1" data-sub="${s.id}" data-id="${t.id}" aria-label="Monter ${esc(t.name)}" ${ti ? '' : 'disabled'}>▲</button><button class="icon" data-act="taskMove" data-dir="1" data-sub="${s.id}" data-id="${t.id}" aria-label="Descendre ${esc(t.name)}" ${ti < ts.length - 1 ? '' : 'disabled'}>▼</button> ${ti + 1}</td>
            <td><input type="text" data-c="tasks" data-sub="${s.id}" data-id="${t.id}" data-f="name" data-struct="1" value="${esc(t.name)}"></td>
            ${t.kind === 'wait' ? `<td colspan="2" class="num" style="white-space:nowrap"><span class="calc">Durée</span> <input type="number" min="0" step="0.5" aria-label="Durée de l'attente en jours ouvrés" data-c="tasks" data-sub="${s.id}" data-id="${t.id}" data-f="wait" data-num="1" value="${t.wait}" style="width:64px"> <span class="calc">j ouvrés</span></td>
            <td><span class="pill wait">Attente, sans charge</span></td>` : `<td class="num"><input type="number" min="0" step="0.5" data-c="tasks" data-sub="${s.id}" data-id="${t.id}" data-f="ux" data-num="1" value="${t.ux}"></td>
            <td class="num"><input type="number" min="0" step="0.5" data-c="tasks" data-sub="${s.id}" data-id="${t.id}" data-f="ui" data-num="1" value="${t.ui}"></td>
            <td><select aria-label="Répartition de la charge" data-c="tasks" data-sub="${s.id}" data-id="${t.id}" data-f="seq">${seqOpts(t.seq)}</select></td>`}
            <td>${deps}</td>
            <td>${t.kind === 'wait' ? '<span class="calc">Selon les dépendances</span>' : `<select data-c="tasks" data-sub="${s.id}" data-id="${t.id}" data-f="assign">${sOpts(t.assign || 'auto')}</select>`}</td>
            <td data-derived="pt:${t.id}"></td>
            <td><select aria-label="Statut" data-c="tasks" data-sub="${s.id}" data-id="${t.id}" data-f="status">${stOpts(t.status, false)}</select></td>
            <td><button class="icon" data-act="delTask" data-sub="${s.id}" data-id="${t.id}" aria-label="Supprimer ${esc(t.name)}">✕</button></td></tr>`;
        }).join('') : `<tr><td colspan="10" class="calc">Découpez le sujet en sous-tâches : sa charge devient la somme de leurs charges. Une attente (retour PO, recrutement d'utilisateurs…) n'a pas de charge mais décale les sous-tâches qui en dépendent.${num(s.ux) + num(s.ui) > 0 ? ' La première sous-tâche reprend la charge actuelle du sujet.' : ''}</td></tr>`) +
        `</tbody></table><div style="margin-top:8px"><button class="btn ghost small" data-act="addTask" data-id="${s.id}">Ajouter une sous-tâche</button> <button class="btn ghost small" data-act="addWait" data-id="${s.id}">Ajouter une attente</button>${ts.length > 1 ? '<span class="calc" style="margin-left:10px;font-size:12.5px">L\'ordre sert au placement : la sous-tâche du haut passe en premier, sauf si elle dépend d\'une autre.</span>' : ''}</div></td></tr>`;
    }
  });
  h += `</tbody></table><div class="row" style="margin-top:10px"><button class="btn ghost small" data-act="addSubject">Ajouter un sujet</button><button class="btn ghost small" data-act="sortPrio">Trier la liste par priorité</button></div></div>`;
  h += `<h2>Coller depuis un tableur</h2><div class="card"><p class="hint">Une ligne par sujet : nom, charge UX, charge UI et, si vous voulez, la priorité (1 à 4, ou critique, haute, moyenne, basse), puis « simultané » si l'UX et l'UI avancent en même temps ou « fond » pour une tâche de fond, séparés par une tabulation ou un point-virgule. Sans priorité, le sujet est en P3 ; sans 5e colonne, l'UI passe après l'UX.</p>
    <textarea id="paste" placeholder="Refonte page d'accueil;4;3;1&#10;Parcours inscription;2,5;5;haute;simultané"></textarea>
    <div style="margin-top:8px"><button class="btn small" data-act="import">Ajouter ces sujets</button></div></div>`;
  $('#p-subjects').innerHTML = h;
}

function placePills(key, subOut) {
  if (subOut) return '<span class="pill muted">Hors PI</span>';
  const w = C.waits && C.waits[key];
  if (w) return w.end ? `<span class="pill ${w.ok ? 'wait' : 'bad'}">Du ${shortD(w.start)} au ${shortD(w.last)}</span>${w.lost > EPS ? ` <span class="pill prod">+${fmt(w.lost)} j congés Produit</span>` : ''}${w.ok ? '' : ' <span class="pill bad">Après le PI</span>'}` : '<span class="pill bad">Bloquée</span>';
  const sis = C.place[key] || [], un = C.unplanned.filter(u => (u.task ? u.task.id : u.sub.id) === key || u.sub.id === key);
  return (sis.length ? [...new Set(sis)].sort((a, b) => a - b).map(i => `<span class="pill ${C.sprints[i].over ? 'bad' : 'muted'}">${esc(C.sprints[i].name)}</span>`).join(' ') : '') +
    (un.length ? ` <span class="pill bad">${sis.length ? 'Incomplet' : 'Non planifié'}</span>` : '');
}
function refreshDerived() {
  document.querySelectorAll('[data-derived]').forEach(el => {
    const [k, id, f] = el.dataset.derived.split(':');
    if (k === 'rmph') { const s = C.sprints.find(x => x.id === id); if (s) el.placeholder = fmt(autoMeeting(s)); return; }
    if (k === 'jo' || k === 'wk' || k === 'rm') { const s = C.sprints.find(x => x.id === id); el.textContent = s ? (k === 'jo' ? s.jo : k === 'wk' ? s.weeks : fmt(s.reuEtp) + ' j') : ''; }
    else if (k === 'lv' || k === 'ev') { const l = (k === 'lv' ? S.leaves : S.events).find(x => x.id === id); el.textContent = l ? fmt(workDays(l.start, l.end || l.start) * (Number(l.quot) || 1)) + ' j' : ''; }
    else if (k === 'sx') { const s = S.subjects.find(x => x.id === id); el.textContent = s ? fmt(loadOf(s, f)) : ''; }
    else if (k === 'pl') { const s = S.subjects.find(x => x.id === id); el.innerHTML = s ? placePills(id, s.status === 'out') : ''; }
    else if (k === 'pt') { const s = S.subjects.find(x => tasksOf(x).some(t => t.id === id)); el.innerHTML = s ? placePills(id, s.status === 'out') : ''; }
  });
}

function renderTab() {
  const fk = document.activeElement?.dataset?.f ? [document.activeElement.dataset.c, document.activeElement.dataset.id, document.activeElement.dataset.f] : null;
  document.querySelectorAll('section.panel').forEach(p => p.classList.toggle('on', p.id === 'p-' + tab));
  ({ plan: renderPlan, planning: renderPlanning, sprints: renderSprints, team: renderTeam, subjects: renderSubjects })[tab]();
  refreshDerived();
  if (fk) { const el = document.querySelector(`#p-${tab} [data-c="${fk[0]}"][data-f="${fk[2]}"]${fk[1] ? `[data-id="${fk[1]}"]` : ''}`); el?.focus(); }
}
function renderAll() { C = compute(); renderHeader(); renderTab(); }
function changed(rerender) { C = compute(); renderHeader(); if (rerender) renderTab(); else refreshDerived(); scheduleSave(); }

/* ---------- Évènements ---------- */
function onField(e) {
  const el = e.target.closest('[data-f]'); if (!el) return;
  if (el.type === 'text' && e.type === 'change' && !el.dataset.struct) return;
  if (el.type !== 'text' && el.type !== 'number' && e.type === 'input' && el.tagName !== 'SELECT' && el.type !== 'date') return;
  const c = el.dataset.c, f = el.dataset.f;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.num) v = num(v);
  if (f === 'quot' || f === 'prio') v = Number(v);
  if (c === 'root') S[f] = v;
  else if (c === 'gen') S.gen[f] = v;
  else {
    const o = c === 'tasks' ? tasksOf(S.subjects.find(x => x.id === el.dataset.sub)).find(x => x.id === el.dataset.id) : (S[c] || []).find(x => x.id === el.dataset.id); if (!o) return;
    if (c === 'sprints' && (f === 'ip' || f === 'pip') && v) { o.excluded = true; if (f === 'ip') o.pip = false; else o.ip = false; }
    const old = o[f]; o[f] = v;
    if ((c === 'leaves' || c === 'events') && f === 'start' && validD(v)) {
      if (!validD(o.end) || o.end < v || o.end === old) o.end = v;
      syncDates(c, o);
    }
    if ((c === 'leaves' || c === 'events') && f === 'end' && validD(v) && (!validD(o.start) || v < o.start)) { o.start = v; syncDates(c, o); }
  }
  if (c === 'sprints' && e.type === 'change' && ['start', 'end', 'ip', 'pip'].includes(f)) sortSprints();
  const structural = (el.dataset.struct && e.type === 'change') || (c === 'sprints' && ['name', 'start', 'end'].includes(f) && e.type === 'change');
  changed(structural);
}
document.addEventListener('input', onField);
document.addEventListener('change', onField);

document.addEventListener('click', e => {
  if (picker && !e.target.closest('#rp') && !e.target.closest('[data-act="openPicker"]')) closePicker();
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; renderTab(); renderHeader(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id;
  const move = d => { const i = S.subjects.findIndex(s => s.id === id), j = i + d; if (j < 0 || j >= S.subjects.length) return; [S.subjects[i], S.subjects[j]] = [S.subjects[j], S.subjects[i]]; };
  switch (a) {
    case 'gen': S.sprints = makeSprints(validD(S.gen.start) ? S.gen.start : nextMonday(), Math.max(1, Math.round(num(S.gen.weeks)) || 3), Math.min(12, Math.max(1, Math.round(num(S.gen.count)) || 1)), S.sprints, !!S.gen.ip, Math.max(1, Math.round(num(S.gen.ipWeeks)) || 2), !!S.gen.pip, Math.max(1, Math.round(num(S.gen.pipWeeks)) || 1)); break;
    case 'addSprint': { const l = S.sprints.filter(x => validD(x.end)).reduce((m, x) => !m || x.end > m.end ? x : m, null); const st = l ? toMonday(addDays(l.end, 1)) : nextMonday(); S.sprints.push({ id: uid(), name: 'Sprint', start: st, end: addDays(st, (Math.round(num(S.gen.weeks)) || 3) * 7 - 3), excluded: false }); sortSprints(); break; }
    case 'del': {
      const c = b.dataset.c;
      S[c] = S[c].filter(x => x.id !== id);
      if (c === 'members') { S.leaves = S.leaves.filter(l => l.memberId !== id); S.events.forEach(e => { e.members = e.members.filter(x => x !== id); }); }
      if (c === 'product') { S.leaves = S.leaves.filter(l => l.memberId !== id); S.subjects.forEach(x => { if (x.productId === id) x.productId = ''; }); }
      if (c === 'sprints') S.subjects.forEach(s => { if (s.assign === id) s.assign = 'auto'; });
      break;
    }
    case 'addProduct': S.product.push({ id: uid(), name: 'Personne Produit', role: 'PO' }); break;
    case 'addMember': S.members.push({ id: uid(), name: `Personne ${b.dataset.p}`, profile: b.dataset.p, etp: 1 }); break;
    case 'addLeave': {
      const l = { id: uid(), memberId: S.members[0]?.id, start: '', end: '', quot: 1 }; S.leaves.push(l); changed(true);
      const btn = document.querySelector(`[data-act="openPicker"][data-id="${l.id}"]`); if (btn) openPicker(l.id, btn, 'leaves');
      return;
    }
    case 'openPicker': if (picker && picker.id === id) closePicker(); else openPicker(id, b, b.dataset.c || 'leaves'); return;
    case 'addEvent': {
      const ev = { id: uid(), name: 'Évènement d\'équipe', start: '', end: '', quot: 1, who: 'all', members: [] }; S.events.push(ev); changed(true);
      const btn = document.querySelector(`[data-act="openPicker"][data-id="${ev.id}"]`); if (btn) openPicker(ev.id, btn, 'events');
      return;
    }
    case 'evMember': { const ev = S.events.find(x => x.id === id); if (!ev) return; const mid = b.dataset.m; ev.members = ev.members.includes(mid) ? ev.members.filter(x => x !== mid) : ev.members.concat(mid); break; }
    case 'rpPrev': picker.month = shiftMonth(picker.month, -1); renderPicker(); return;
    case 'rpNext': picker.month = shiftMonth(picker.month, 1); renderPicker(); return;
    case 'rpClose': closePicker(); return;
    case 'rpClear': { const l = pickObj(); if (l) { l.start = ''; l.end = ''; syncDates(picker.coll, l); } picker.a = picker.b = null; changed(false); renderPicker(); return; }
    case 'pickDay': {
      const l = pickObj(); if (!l) return;
      if (!picker.a || picker.b) { picker.a = id; picker.b = null; l.start = id; l.end = id; }
      else { let x = picker.a, y = id; if (y < x) [x, y] = [y, x]; picker.a = x; picker.b = y; l.start = x; l.end = y; }
      syncDates(picker.coll, l); changed(false); renderPicker();
      if (picker.b) setTimeout(closePicker, 250);
      return;
    }
    case 'prevPI': case 'nextPI': { const list = sortedPIs(), i = list.findIndex(p => p.id === S.id), j = i + (a === 'prevPI' ? -1 : 1); if (list[j]) switchPI(list[j].id); return; }
    case 'newPI': openNewDlg(); return;
    case 'exportPI': exportPIs([S]); return;
    case 'exportAll': exportPIs(sortedPIs()); return;
    case 'importPI': $('#importFile').value = ''; $('#importFile').click(); return;
    case 'dlgCancel': $('#newDlg').close(); return;
    case 'dlgCreate': createPI(); return;
    case 'delPI': {
      if (Object.keys(ALL).length < 2) return;
      if (!confirm(`Supprimer « ${S.piName || 'ce PI'} » et toutes ses données ?`)) return;
      const gone = S.id, list = sortedPIs(), i = list.findIndex(p => p.id === gone), next = list[i + 1] || list[i - 1];
      delete ALL[gone]; dirty.delete(gone); removeRemote(gone); switchPI(next.id); persistLocal();
      return;
    }
    case 'addSubject': S.subjects.push(newSubject()); break;
    case 'gToggle': G[id] = !G[id]; renderTab(); return;
    case 'goSubject': {
      const sub = S.subjects.find(x => x.id === id); if (!sub) return;
      if (tasksOf(sub).length) openTasks.add(id);
      tab = 'subjects'; renderTab(); renderHeader();
      document.querySelector(`[data-c="subjects"][data-id="${id}"][data-f="name"]`)?.scrollIntoView({ block: 'center' });
      document.querySelector(`[data-c="subjects"][data-id="${id}"][data-f="name"]`)?.focus({ preventScroll: true });
      return;
    }
    case 'toggleTasks': if (openTasks.has(id)) openTasks.delete(id); else openTasks.add(id); renderTab(); return;
    case 'addTask': {
      const sub = S.subjects.find(x => x.id === id); if (!sub) return;
      const first = !tasksOf(sub).length;
      sub.tasks = tasksOf(sub).concat(normTask(first ? { name: 'Tâche 1', ux: sub.ux, ui: sub.ui, seq: sub.seq } : { name: 'Nouvelle sous-tâche', seq: sub.seq }));
      if (first && sub.assign !== 'auto') { sub.tasks[0].assign = sub.assign; sub.assign = 'auto'; }
      openTasks.add(id); break;
    }
    case 'addWait': {
      const sub = S.subjects.find(x => x.id === id); if (!sub) return;
      const first = !tasksOf(sub).length;
      const pre = first && num(sub.ux) + num(sub.ui) > 0 ? [normTask({ name: 'Tâche 1', ux: sub.ux, ui: sub.ui, seq: sub.seq, assign: sub.assign })] : [];
      if (pre.length) sub.assign = 'auto';
      const last = tasksOf(sub).concat(pre).filter(t => t.kind !== 'wait').slice(-1)[0];
      sub.tasks = tasksOf(sub).concat(pre, normTask({ name: 'Attente retour PO', kind: 'wait', wait: 5, deps: last ? [last.id] : [] }));
      openTasks.add(id); break;
    }
    case 'taskMove': {
      const sub = S.subjects.find(x => x.id === b.dataset.sub); if (!sub) return;
      const i = sub.tasks.findIndex(t => t.id === id), j = i + Number(b.dataset.dir);
      if (i < 0 || j < 0 || j >= sub.tasks.length) return;
      [sub.tasks[i], sub.tasks[j]] = [sub.tasks[j], sub.tasks[i]];
      changed(true);
      document.querySelector(`[data-act="taskMove"][data-id="${id}"][data-dir="${b.dataset.dir}"]:not(:disabled)`)?.focus()
        || document.querySelector(`[data-act="taskMove"][data-id="${id}"]:not(:disabled)`)?.focus();
      return;
    }
    case 'delTask': {
      const sub = S.subjects.find(x => x.id === b.dataset.sub); if (!sub) return;
      sub.tasks = tasksOf(sub).filter(t => t.id !== id); sub.tasks.forEach(t => { t.deps = t.deps.filter(d => d !== id); });
      if (!sub.tasks.length) { sub.ux = 0; sub.ui = 0; }
      break;
    }
    case 'dep': {
      const sub = S.subjects.find(x => x.id === b.dataset.sub), t = tasksOf(sub).find(x => x.id === id), d = b.dataset.dep; if (!t) return;
      if (t.deps.includes(d)) t.deps = t.deps.filter(x => x !== d); else if (!dependsOn(sub, d, t.id)) t.deps.push(d);
      break;
    }
    case 'sortPrio': S.subjects = byPrio(); break;
    case 'up': move(-1); break;
    case 'down': move(1); break;
    case 'import': {
      const lines = ($('#paste').value || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      lines.forEach(l => { const p = l.split(/\t|;/); if (!p[0]) return; S.subjects.push(newSubject(p[0].trim(), num(p[1]), num(p[2]), parsePrio(p[3]), parseSeq(p[4]))); });
      break;
    }
    case 'addHoliday': { const d = $('#hDate').value; if (validD(d) && !S.holidays.some(h => h.date === d)) S.holidays.push({ date: d, label: '' }); break; }
    case 'delHoliday': S.holidays = S.holidays.filter(h => h.date !== id); break;
    case 'frHolidays': {
      if (!S.sprints.length) break;
      const a0 = S.sprints.reduce((m, s) => s.start < m ? s.start : m, S.sprints[0].start), b0 = S.sprints.reduce((m, s) => s.end > m ? s.end : m, S.sprints[0].end);
      for (let y = +a0.slice(0, 4); y <= +b0.slice(0, 4); y++) frHolidays(y).forEach(([d, lab]) => { if (d >= a0 && d <= b0 && !S.holidays.some(h => h.date === d)) S.holidays.push({ date: d, label: lab }); });
      break;
    }
    case 'freeze': S.subjects.filter(s => s.status !== 'out').forEach(s => (tasksOf(s).length ? tasksOf(s) : [s]).forEach(u => {
      const p = C.place[u.id]; if (u.seq !== 'bg' && !C.manualKeys.has(u.id) && p && p.length === 1 && !C.unplanned.some(x => (x.task || x.sub).id === u.id)) u.assign = C.sprints[p[0]].id;
    })); break;
    case 'allauto': S.subjects.forEach(s => { s.assign = 'auto'; tasksOf(s).forEach(t => t.assign = 'auto'); }); break;
    case 'example': S = Object.assign(exampleState(), { id: S.id }); ALL[S.id] = S; tab = 'plan'; break;
    case 'reset': if (!confirm('Effacer toutes les données de ce PI ?')) return; S = Object.assign(defaultState(), { id: S.id }); ALL[S.id] = S; break;
    default: return;
  }
  changed(true); renderHeader();
});

document.addEventListener('change', e => { if (e.target.id === 'piSelect') switchPI(e.target.value); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && picker) { const id = picker.id; closePicker(); document.querySelector(`[data-act="openPicker"][data-id="${id}"]`)?.focus(); } });

/* ---------- Congés : champs liés et calendrier de plage ---------- */
function syncDates(c, l) {
  const st = document.querySelector(`[data-c="${c}"][data-id="${l.id}"][data-f="start"]`), en = document.querySelector(`[data-c="${c}"][data-id="${l.id}"][data-f="end"]`);
  if (st && st.value !== (l.start || '')) st.value = l.start || '';
  if (en) { if (en.value !== (l.end || '')) en.value = l.end || ''; if (validD(l.start)) en.min = l.start; else en.removeAttribute('min'); }
}
let picker = null;
const shiftMonth = (m, n) => { const d = parseD(m + '-01'); d.setUTCMonth(d.getUTCMonth() + n); return isoD(d).slice(0, 7); };
const pickObj = () => picker ? (S[picker.coll] || []).find(x => x.id === picker.id) : null;
function openPicker(id, anchor, coll = 'leaves') {
  const l = (S[coll] || []).find(x => x.id === id); if (!l) return;
  const base = validD(l.start) ? l.start : (S.sprints[0]?.start || isoD(new Date()));
  picker = { id, coll, a: validD(l.start) ? l.start : null, b: validD(l.end) && validD(l.start) ? l.end : null, month: base.slice(0, 7), anchor };
  renderPicker();
  const el = $('#rp'), r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, left = Math.max(8, Math.min(r.right + scrollX - w, scrollX + document.documentElement.clientWidth - w - 8));
  el.style.left = left + 'px'; el.style.top = (r.bottom + scrollY + 6) + 'px';
  el.querySelector('.rp-g button')?.focus({ preventScroll: true });
}
function closePicker() { picker = null; renderPicker(); }
function renderPicker() {
  const el = $('#rp');
  if (!picker) { el.hidden = true; el.innerHTML = ''; return; }
  const two = document.documentElement.clientWidth > 620;
  const months = two ? [picker.month, shiftMonth(picker.month, 1)] : [picker.month];
  const l = pickObj();
  const m = picker.coll === 'leaves' ? personOf(l?.memberId) : null;
  const month = ym => {
    const first = parseD(ym + '-01'), lead = (first.getUTCDay() + 6) % 7, dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    let g = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="dw">${d}</span>`).join('') + '<span></span>'.repeat(lead);
    for (let d = 1; d <= dim; d++) {
      const iso = `${ym}-${String(d).padStart(2, '0')}`, w = parseD(iso).getUTCDay(), hol = holidaySet.has(iso);
      const a = picker.a, b = picker.b || picker.a;
      const cls = [(w === 0 || w === 6 || hol) ? 'off' : '', hol ? 'hol' : '', a && iso >= a && iso <= b ? 'in' : '', iso === picker.a || iso === picker.b ? 'edge' : ''].join(' ');
      g += `<button type="button" class="${cls}" data-act="pickDay" data-id="${iso}" aria-label="${parseD(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}${hol ? ', férié' : ''}" aria-pressed="${!!(a && iso >= a && iso <= b)}">${d}</button>`;
    }
    return `<div class="rp-m"><h4>${first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h4><div class="rp-g">${g}</div></div>`;
  };
  const sum = picker.a ? `Du ${shortD(picker.a)} au ${shortD(picker.b || picker.a)}, ${fmt(workDays(picker.a, picker.b || picker.a) * (Number(l?.quot) || 1))} j ouvrés` : 'Cliquez le premier jour, puis le dernier.';
  el.innerHTML = `<div class="rp-head"><button class="icon" data-act="rpPrev" aria-label="Mois précédent">‹</button><b style="font-size:13.5px">${picker.coll === 'leaves' ? `Congé de ${esc(m?.name || '?')}` : `Évènement : ${esc(l?.name || '')}`}</b><button class="icon" data-act="rpNext" aria-label="Mois suivant">›</button></div>
    <div class="rp-months">${months.map(month).join('')}</div>
    <div class="rp-foot"><span>${sum}${picker.a && !picker.b ? '. Pour un seul jour, cliquez-le à nouveau.' : ''}</span><span><button class="linkbtn" data-act="rpClear">Effacer</button> <button class="btn small" data-act="rpClose">Fermer</button></span></div>`;
  el.hidden = false;
}
document.addEventListener('mouseover', e => {
  const d = e.target.closest?.('#rp [data-act="pickDay"]'); if (!picker || !picker.a || picker.b || !d) return;
  const x = picker.a < d.dataset.id ? picker.a : d.dataset.id, y = picker.a < d.dataset.id ? d.dataset.id : picker.a;
  document.querySelectorAll('#rp [data-act="pickDay"]').forEach(btn => btn.classList.toggle('pre', btn.dataset.id >= x && btn.dataset.id <= y));
});

/* ---------- Export et import ---------- */
const fileSafe = n => String(n || 'PI').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'PI';
async function saveFile(filename, text) {
  let dl = null;
  try { dl = window.claude?.use ? await window.claude.use('downloads') : null; } catch { dl = null; }
  if (dl) {
    try { await dl.save({ filename, data: text }); setSave(`Fichier ${filename} proposé au téléchargement`); }
    catch (err) { setSave(err?.code === 'declined' ? 'Téléchargement annulé' : 'Téléchargement impossible ici'); }
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  setSave(`Fichier ${filename} téléchargé`);
}
function exportPIs(list) {
  flushSave();
  const data = { app: 'pi-planning-ux-ui', format: 1, exportedAt: new Date().toISOString(), pis: list.map(x => JSON.parse(clean(x))) };
  const d = isoD(new Date());
  const name = list.length === 1 ? `${fileSafe(list[0].piName)}_${d}.json` : `PI-planning_${list.length}-PI_${d}.json`;
  saveFile(name, JSON.stringify(data, null, 2));
}
function importText(text) {
  let o;
  try { o = JSON.parse(text); } catch { alert('Ce fichier n\'est pas un fichier JSON valide.'); return; }
  const list = Array.isArray(o?.pis) ? o.pis : (o && Array.isArray(o.sprints) ? [o] : null);
  if (!list || !list.length) { alert('Aucun PI trouvé dans ce fichier.'); return; }
  const added = [];
  list.forEach(raw => {
    let st = migrate(JSON.parse(JSON.stringify(raw)));
    if (ALL[st.id]) {
      const replace = confirm(`« ${ALL[st.id].piName} » existe déjà dans l'outil.\n\nOK : le remplacer par la version du fichier.\nAnnuler : importer le fichier comme un nouveau PI.`);
      if (!replace) { st.id = uid(); st.piName = `${st.piName || 'PI'} (importé)`; }
    }
    ALL[st.id] = st; added.push(st);
    if (col && !readOnly) dirty.add(st.id);
  });
  persistLocal();
  if (col && !readOnly) { clearTimeout(saveTimer); saveTimer = setTimeout(writeDirty, 300); }
  switchPI(added[0].id);
  S = ALL[added[0].id]; renderAll();
  setSave(added.length === 1 ? `PI « ${added[0].piName} » importé` : `${added.length} PI importés`);
}
document.addEventListener('change', e => {
  if (e.target.id !== 'importFile') return;
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => importText(String(r.result || ''));
  r.onerror = () => alert('Impossible de lire ce fichier.');
  r.readAsText(f);
});

/* ---------- Navigation entre PI ---------- */
function switchPI(id) {
  if (!ALL[id] || id === S.id) { renderAll(); return; }
  flushSave(); closePicker();
  S = ALL[id]; pendingRemote = null;
  try { localStorage.setItem(LS_CUR, id); } catch { }
  renderAll();
}
function openNewDlg() {
  const last = S.sprints[S.sprints.length - 1];
  const start = toMonday(last ? addDays(last.end, 1) : nextMonday());
  const open = S.subjects.filter(x => x.status !== 'done').length, outN = S.subjects.filter(x => x.status === 'out').length;
  const dlg = $('#newDlg');
  dlg.innerHTML = `<h3 id="newDlgT">Nouveau PI</h3>
    <label class="f">Nom<input type="text" id="nName" value="${esc(nextName(S.piName))}"></label>
    <div class="row"><label class="f">Début du premier sprint<input type="date" id="nStart" value="${start}"></label>
    <label class="f">Semaines par sprint<input type="number" id="nWeeks" min="1" max="8" value="${Math.round(num(S.gen.weeks)) || 3}"></label>
    <label class="f">Nombre de sprints (PIP et IP compris)<input type="number" id="nCount" min="1" max="12" value="${S.sprints.length || 5}"></label></div>
    <div class="row"><label class="chk" style="margin:0"><input type="checkbox" id="nPip" ${S.gen.pip || S.sprints.some(x => x.pip) ? 'checked' : ''}><span>Le premier est un sprint PIP</span></label>
    <label class="f">Durée du sprint PIP (semaines)<input type="number" id="nPipW" min="1" max="4" value="${Math.round(num(S.gen.pipWeeks)) || 1}"></label></div>
    <div class="row"><label class="chk" style="margin:0"><input type="checkbox" id="nIp" ${S.gen.ip || S.sprints.some(x => x.ip) ? 'checked' : ''}><span>Le dernier est un sprint IP</span></label>
    <label class="f">Durée du sprint IP (semaines)<input type="number" id="nIpW" min="1" max="8" value="${Math.round(num(S.gen.ipWeeks)) || 2}"></label></div>
    <label class="chk"><input type="checkbox" id="nTeam" checked><span>Reprendre l'équipe de « ${esc(S.piName)} »<small>Avec les congés et évènements déjà saisis qui tombent après le début du nouveau PI, les jours fériés et le temps de réunion.</small></span></label>
    <label class="chk"><input type="checkbox" id="nCarry" ${open ? 'checked' : ''} ${open ? '' : 'disabled'}><span>Reprendre les sujets non terminés (${open}${outN ? `, dont ${outN} hors PI` : ''})<small>Ils repartent en placement automatique, sans leurs sous-tâches terminées. Les sujets hors PI repassent « À faire ». Pensez à ajuster les charges déjà consommées.</small></span></label>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-act="dlgCancel">Annuler</button><button class="btn" data-act="dlgCreate">Créer le PI</button></div>`;
  dlg.showModal();
  $('#nName').select();
}
function createPI() {
  const cur = S, clone = o => JSON.parse(JSON.stringify(o));
  const start = validD($('#nStart').value) ? $('#nStart').value : nextMonday();
  const weeks = Math.min(8, Math.max(1, Math.round(num($('#nWeeks').value)) || 2)), count = Math.min(12, Math.max(1, Math.round(num($('#nCount').value)) || 5));
  const n = defaultState();
  n.piName = $('#nName').value.trim() || nextName(cur.piName);
  const ip = $('#nIp').checked, ipWeeks = Math.min(8, Math.max(1, Math.round(num($('#nIpW').value)) || 2));
  const pip = $('#nPip').checked, pipWeeks = Math.min(4, Math.max(1, Math.round(num($('#nPipW').value)) || 1));
  n.gen = { start, weeks, count, ip, ipWeeks, pip, pipWeeks };
  n.sprints = makeSprints(start, weeks, count, [], ip, ipWeeks, pip, pipWeeks);
  n.depMode = cur.depMode; n.orderMode = cur.orderMode;
  if ($('#nTeam').checked) {
    n.members = clone(cur.members); n.product = clone(cur.product || []); n.meeting = cur.meeting; n.meetingWeeks = cur.meetingWeeks; n.holidays = clone(cur.holidays);
    n.leaves = clone(cur.leaves.filter(l => validD(l.start) && (l.end || l.start) >= start));
    n.events = clone((cur.events || []).filter(e => validD(e.start) && (e.end || e.start) >= start));
  }
  if ($('#nCarry').checked) n.subjects = cur.subjects.filter(x => x.status !== 'done').map(x => {
    const c = Object.assign(clone(x), { id: uid(), assign: 'auto', status: x.status === 'out' ? 'todo' : x.status });
    c.tasks = tasksOf(c).filter(t => t.status !== 'done').map(t => Object.assign(t, { assign: 'auto' }));
    const ids = new Set(c.tasks.map(t => t.id)); c.tasks.forEach(t => { t.deps = t.deps.filter(d => ids.has(d)); });
    return c;
  });
  $('#newDlg').close();
  ALL[n.id] = n;
  flushSave();
  S = n; try { localStorage.setItem(LS_CUR, n.id); } catch { }
  tab = n.subjects.length ? 'plan' : 'sprints';
  renderAll(); scheduleSave();
}

// Glisser-déposer sur le plan
let dragId = null;
document.addEventListener('dragstart', e => { const c = e.target.closest?.('[data-drag]'); if (!c) return; dragId = c.dataset.drag; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch { } });
document.addEventListener('dragover', e => { const z = e.target.closest?.('[data-drop]'); if (!z || !dragId) return; e.preventDefault(); document.querySelectorAll('.col.drop').forEach(x => x !== z && x.classList.remove('drop')); z.classList.add('drop'); });
document.addEventListener('dragleave', e => { const z = e.target.closest?.('[data-drop]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('drop'); });
function findUnit(id) { for (const sub of S.subjects) { if (sub.id === id) return { sub, task: null }; const t = tasksOf(sub).find(x => x.id === id); if (t) return { sub, task: t }; } return null; }
document.addEventListener('drop', e => {
  const z = e.target.closest?.('[data-drop]'); if (!z || !dragId) return; e.preventDefault();
  const u = findUnit(dragId); dragId = null; if (!u) return;
  const to = z.dataset.drop;
  if (to === 'out') u.sub.status = 'out';
  else {
    const wasOut = u.sub.status === 'out';
    if (wasOut) u.sub.status = 'todo';
    if (u.task) u.task.assign = to;
    else if (!tasksOf(u.sub).length) u.sub.assign = to;
    else if (!wasOut && to !== 'auto') tasksOf(u.sub).forEach(t => t.assign = to);
  }
  changed(true);
});
document.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.col.drop').forEach(x => x.classList.remove('drop')); });

/* ---------- Sauvegarde ---------- */
const LS = 'pi-planning-v2', LS_OLD = 'pi-planning-v1', LS_CUR = 'pi-planning-current';
let col = null, saveTimer = null, readOnly = false, pendingRemote = null;
const dirty = new Set();
const setSave = t => { $('#saveState').textContent = t; };
const clean = (x = S) => JSON.stringify(x, (k, v) => k.startsWith('_') ? undefined : v);
function persistLocal() {
  try { localStorage.setItem(LS, JSON.stringify({ pis: Object.values(ALL).map(x => JSON.parse(clean(x))) })); localStorage.setItem(LS_CUR, S.id); } catch { }
}
async function writeDirty() {
  saveTimer = null;
  const ids = [...dirty]; dirty.clear();
  try {
    for (const id of ids) if (ALL[id]) await col.doc(id).set({ state: JSON.parse(clean(ALL[id])), updatedAt: new Date().toISOString() });
    setSave('Enregistré et partagé avec l\'équipe');
  } catch (err) {
    ids.forEach(i => dirty.add(i));
    if (err?.code === 'invalid_argument') { readOnly = true; dirty.clear(); setSave('Lecture seule : vos modifications restent dans ce navigateur'); }
    else setSave('Enregistrement impossible pour le moment, nouvel essai à la prochaine modification');
  }
}
function scheduleSave() {
  ALL[S.id] = S;
  persistLocal();
  if (!col) { setSave('Enregistré dans ce navigateur'); return; }
  if (readOnly) return;
  dirty.add(S.id);
  setSave('Enregistrement…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeDirty, 700);
}
function flushSave() { if (saveTimer) { clearTimeout(saveTimer); writeDirty(); } }
function removeRemote(id) { if (col && !readOnly) col.doc(id).delete().catch(() => { }); }
function applyRemote(st) {
  const m = migrate(st);
  if (clean(m) === clean(S)) return;
  S = m; ALL[S.id] = S; closePicker(); renderAll();
}
document.addEventListener('focusout', () => setTimeout(() => {
  if (pendingRemote && !document.activeElement?.dataset?.f) { const p = pendingRemote; pendingRemote = null; if (p.id === S.id) applyRemote(p); }
}, 0));

(async function init() {
  let hadLocal = false;
  try {
    const v2 = localStorage.getItem(LS), v1 = localStorage.getItem(LS_OLD);
    if (v2) { const o = JSON.parse(v2); (o.pis || []).forEach(p => { const m = migrate(p); ALL[m.id] = m; }); }
    else if (v1) { const m = migrate(JSON.parse(v1)); ALL[m.id] = m; }
    const ids = Object.keys(ALL).filter(k => k !== S.id);
    if (ids.length) { delete ALL[S.id]; hadLocal = true; const cur = localStorage.getItem(LS_CUR); S = ALL[cur] || sortedPIs()[0]; }
  } catch { }
  renderAll();
  setSave(hadLocal ? 'Enregistré dans ce navigateur' : '');
  const db = window.claude?.use ? await window.claude.use('db').catch(() => null) : null;
  if (!db) { persistLocal(); return; }
  try {
    col = db.collection('pis');
    const snap = await col.get();
    const remote = {};
    snap.docs.forEach(d => { const st = d.data()?.state; if (st) { const m = migrate(Object.assign({}, st, { id: d.id })); remote[m.id] = m; } });
    if (!Object.keys(remote).length) {
      const old = await db.doc('plans/current').get().catch(() => null);
      if (old?.exists && old.data()?.state) { const m = migrate(old.data().state); remote[m.id] = m; dirty.add(m.id); }
    }
    if (Object.keys(remote).length) {
      const keep = S.id;
      if (hadLocal) Object.keys(ALL).forEach(id => { if (!remote[id]) { remote[id] = ALL[id]; dirty.add(id); } });
      ALL = remote;
      let cur = null; try { cur = localStorage.getItem(LS_CUR); } catch { }
      S = ALL[keep] || ALL[cur] || sortedPIs()[0];
      renderAll();
      if (dirty.size) { saveTimer = setTimeout(writeDirty, 0); } else setSave('Enregistré et partagé avec l\'équipe');
    } else {
      Object.keys(ALL).forEach(id => dirty.add(id));
      if (hadLocal) saveTimer = setTimeout(writeDirty, 0); else { dirty.clear(); setSave('Les modifications seront partagées avec l\'équipe'); }
    }
    persistLocal();
    col.onSnapshot(sn => {
      const seen = new Set();
      sn.docs.forEach(d => {
        const st = d.data()?.state; if (!st) return;
        seen.add(d.id);
        if (dirty.has(d.id)) return;
        const m = migrate(Object.assign({}, st, { id: d.id }));
        if (d.id === S.id) { if (clean(m) === clean(S)) return; if (document.activeElement?.dataset?.f || picker) pendingRemote = m; else applyRemote(m); }
        else ALL[d.id] = m;
      });
      Object.keys(ALL).forEach(id => { if (!seen.has(id) && !dirty.has(id) && id !== S.id) delete ALL[id]; });
      if (!seen.has(S.id) && !dirty.has(S.id) && seen.size && !saveTimer) { const f = sortedPIs().find(p => p.id !== S.id); if (f) { delete ALL[S.id]; S = f; renderAll(); } }
      renderNav(); persistLocal();
    }, () => { });
  } catch { col = null; setSave('Enregistré dans ce navigateur'); persistLocal(); }
})();
