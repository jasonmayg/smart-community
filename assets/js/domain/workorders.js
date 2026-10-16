// Work orders: how a request moves from a resident's sentence to a closed job.
//
//   new ──assign──▶ assigned ──start──▶ in_progress ──complete──▶ done ──confirm──▶ closed
//                     ▲                   │  ▲                       │
//                     │                 hold resume                  │
//                     └──────────── reopen (“not fixed”) ◀──────────┘
//   any open state ──merge (duplicate) / cancel──▶ cancelled
//
// Every change is an event with who, when, what and why. Corrections to AI suggestions are kept as
// structured events so the triage accuracy can be measured from real use.
import { SLA_HOURS } from './triage.js';

export const STATES = {
  new: { label: 'New', tone: 'normal' },
  assigned: { label: 'Assigned', tone: 'normal' },
  in_progress: { label: 'In progress', tone: 'medium' },
  on_hold: { label: 'On hold', tone: 'medium' },
  done: { label: 'Awaiting resident', tone: 'low' },
  closed: { label: 'Closed', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'normal' },
};
export const OPEN = ['new', 'assigned', 'in_progress', 'on_hold'];
export const isOpen = o => OPEN.includes(o.status);

/** Category → department that owns it. */
export const DEPT_OF = { repair: 'maintenance', sanitation: 'maintenance', safety: 'security', care: 'cs', noise: 'cs', services: 'cs', billing: 'finance' };
export const URGENCY = ['normal', 'high', 'urgent'];
export const HOLD_REASONS = ['Waiting for parts', 'Waiting for resident access', 'Needs outside contractor'];
export const CORRECTION_REASONS = ['Wrong category', 'Wrong department', 'Wrong asset', 'Urgency too low', 'Urgency too high', 'Duplicate'];

const ev = (o, t, by, kind, text, data) => { o.events.push({ t, by, kind, text, ...(data ? { data } : {}) }); return o; };

/** Create an order from a triage result. `ai` keeps what the model/rules first suggested. */
export function create({ id, text, who, src, t, ageH = 0, triage, asset = null, household = null, by = 'System' }) {
  const o = {
    id, text, who, src, t, ageH, household,
    cat: triage.cat, urgency: triage.urgency, dept: DEPT_OF[triage.cat] || 'cs', assignee: null,
    status: 'new', assetId: asset?.asset?.id || null, expedites: 0, escalation: 0,
    ai: { cat: triage.cat, urgency: triage.urgency, dept: DEPT_OF[triage.cat] || 'cs', assetId: asset?.asset?.id || null, assetConf: asset?.conf || 0, conf: triage.conf ?? 1, source: triage.source || 'rules', cues: triage.cues || [] },
    events: [],
  };
  ev(o, t, by, 'created', `Filed via ${src}`);
  ev(o, t, 'AI triage', 'ai', `Suggested ${triage.label || triage.cat}, ${triage.urgency}, to ${o.dept}${o.assetId ? `; matched asset ${o.assetId}` : ''}`);
  return o;
}

/** Hours allowed for the current urgency, and hours left. */
export const slaFor = o => SLA_HOURS[o.urgency];
export const hoursLeft = o => slaFor(o) - o.ageH;

/**
 * Escalation ladder for an open order that has run past its deadline:
 *   0 on time · 1 overdue → department lead · 2 overdue by half the SLA → property manager · 3 by a full SLA → group
 */
export function escalationLevel(o) {
  if (!isOpen(o)) return 0;
  const over = -hoursLeft(o);
  if (over <= 0) return 0;
  if (over < slaFor(o) * 0.5) return 1;
  if (over < slaFor(o)) return 2;
  return 3;
}
export const ESCALATION_TO = ['', 'Department lead', 'Property manager', 'Group operations'];

/** Which actions are allowed now, for a user with these permissions. */
export function actions(o, perms, { isAssignee = false, isRequester = false } = {}) {
  const has = p => perms.has(p), a = [];
  if (o.status === 'new' && has('wo.assign')) a.push('assign');
  if (['assigned', 'in_progress', 'on_hold'].includes(o.status) && has('wo.assign')) a.push('reassign');
  if (o.status === 'assigned' && has('wo.work') && isAssignee) a.push('start');
  if (o.status === 'in_progress' && has('wo.work') && isAssignee) a.push('hold', 'complete');
  if (o.status === 'on_hold' && has('wo.work') && isAssignee) a.push('resume');
  if (isOpen(o) && has('wo.expedite') && o.urgency !== 'urgent' && (!isRequester || o.expedites === 0)) a.push('expedite');
  if (isOpen(o) && has('wo.correct')) a.push('correct', 'merge');
  if (o.status === 'done' && (isRequester ? has('wo.verify') : has('wo.assign'))) a.push('confirm', 'reopen');
  return a;
}

// ------------------------------------------------------------------ transitions (mutate and return o)
function need(o, states, action) { if (!states.includes(o.status)) throw new Error(`Can’t ${action} an order that is ${STATES[o.status].label.toLowerCase()}.`); }

export function assign(o, { dept, assignee }, by, t) {
  need(o, ['new', 'assigned', 'in_progress', 'on_hold'], 'assign');
  const re = o.status !== 'new';
  o.dept = dept || o.dept; o.assignee = assignee; o.status = 'assigned';
  return ev(o, t, by, re ? 'reassigned' : 'assigned', `${re ? 'Reassigned' : 'Assigned'} to ${assignee}`);
}
export function start(o, by, t) { need(o, ['assigned'], 'start'); o.status = 'in_progress'; return ev(o, t, by, 'started', 'Work started'); }
export function hold(o, reason, by, t) { need(o, ['in_progress'], 'hold'); o.status = 'on_hold'; o.hold = reason; return ev(o, t, by, 'hold', `On hold: ${reason}`); }
export function resume(o, by, t) { need(o, ['on_hold'], 'resume'); o.status = 'in_progress'; delete o.hold; return ev(o, t, by, 'resumed', 'Work resumed'); }
export function complete(o, note, by, t) { need(o, ['in_progress'], 'complete'); o.status = 'done'; o.fix = note; return ev(o, t, by, 'completed', `Completed: ${note}`); }
export function confirm(o, rating, by, t) { need(o, ['done'], 'confirm'); o.status = 'closed'; o.rating = rating; return ev(o, t, by, 'closed', `Confirmed fixed${rating ? `, rated ${rating}/5` : ''}`); }
export function reopen(o, reason, by, t) {
  need(o, ['done'], 'reopen');
  o.status = 'assigned'; o.reopens = (o.reopens || 0) + 1;
  return ev(o, t, by, 'reopened', `Reopened: ${reason}`);
}

/** Raise urgency one step, restart the clock for the new deadline from the original filing time. */
export function expedite(o, reason, by, t, { requester = false } = {}) {
  if (!isOpen(o)) throw new Error('Only open orders can be expedited.');
  if (requester && o.expedites > 0) throw new Error('You have already expedited this request. The desk has been reminded.');
  const i = URGENCY.indexOf(o.urgency); if (i === URGENCY.length - 1) throw new Error('Already urgent.');
  const from = o.urgency; o.urgency = URGENCY[i + 1]; o.expedites += 1;
  return ev(o, t, by, 'expedited', `Expedited ${from} → ${o.urgency}: ${reason}`, { from, to: o.urgency });
}

/**
 * Correct category, department, asset or urgency. If the field still holds the AI's original value,
 * the correction is recorded against the AI so accuracy can be measured.
 */
export function correct(o, patch, reason, by, t) {
  if (!isOpen(o)) throw new Error('Only open orders can be corrected.');
  const changes = [];
  for (const k of ['cat', 'dept', 'assetId', 'urgency']) {
    if (patch[k] !== undefined && patch[k] !== o[k]) { changes.push({ field: k, from: o[k], to: patch[k], ai: o[k] === o.ai[k] }); o[k] = patch[k]; }
  }
  if (patch.cat && !patch.dept && DEPT_OF[patch.cat] !== o.dept) { changes.push({ field: 'dept', from: o.dept, to: DEPT_OF[patch.cat], ai: o.dept === o.ai.dept }); o.dept = DEPT_OF[patch.cat]; }
  if (!changes.length) throw new Error('Nothing changed.');
  if (changes.some(c => c.field === 'dept')) { o.assignee = null; if (o.status !== 'new') o.status = 'new'; }
  return ev(o, t, by, 'corrected', `Corrected ${changes.map(c => `${c.field} ${c.from ?? 'none'} → ${c.to ?? 'none'}`).join(', ')}: ${reason}`, { changes, reason });
}

/** Close `dup` as a duplicate of `into`. The requester of the duplicate is added as a follower. */
export function merge(dup, into, by, t) {
  if (dup.id === into.id) throw new Error('Can’t merge an order into itself.');
  dup.status = 'cancelled'; dup.dupOf = into.id;
  ev(dup, t, by, 'merged', `Merged into ${into.id} as a duplicate`);
  into.followers = [...new Set([...(into.followers || []), dup.who])];
  ev(into, t, by, 'merged-in', `${dup.who} reported the same problem (${dup.id})`);
  return into;
}

// ------------------------------------------------------------------ AI assistance
const words = s => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3));
/** Open orders that look like the same problem: same asset, or similar words in the same category. */
export function findDuplicates(o, orders) {
  const w = words(o.text);
  return orders.filter(x => x.id !== o.id && isOpen(x)).map(x => {
    const xw = words(x.text), inter = [...w].filter(v => xw.has(v)).length;
    const jac = inter / (new Set([...w, ...xw]).size || 1);
    const score = (o.assetId && x.assetId === o.assetId ? 0.7 : 0) + (x.cat === o.cat ? 0.15 : 0) + jac;
    return { x, score };
  }).filter(d => d.score >= 0.6).sort((a, b) => b.score - a.score).map(d => d.x);
}

/** AI triage quality, measured from the corrections staff actually made. */
export function aiQuality(orders, history = { total: 0, catFixed: 0, deptFixed: 0, urgencyUp: 0 }) {
  let total = history.total, catFixed = history.catFixed, deptFixed = history.deptFixed, urgencyUp = history.urgencyUp;
  for (const o of orders) {
    if (['button', 'lifecycle'].includes(o.ai.source)) continue;
    total++;
    const fixes = o.events.filter(e => e.kind === 'corrected').flatMap(e => e.data.changes).filter(c => c.ai);
    if (fixes.some(c => c.field === 'cat')) catFixed++;
    if (fixes.some(c => c.field === 'dept')) deptFixed++;
    if (o.events.some(e => e.kind === 'corrected' && e.data.changes.some(c => c.field === 'urgency' && URGENCY.indexOf(c.to) > URGENCY.indexOf(c.from)))) urgencyUp++;
  }
  return { total, catAcc: total ? 1 - catFixed / total : 1, deptAcc: total ? 1 - deptFixed / total : 1, urgencyMissed: urgencyUp, catFixed, deptFixed };
}
