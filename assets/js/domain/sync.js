// Offline-first sync for work orders.
//
// Every change is an *operation* (who, which order, which transition, arguments) recorded against the
// order's version at the time. Online, operations are applied to the server copy at once. Offline, they
// are applied to the device's copy and queued in an outbox. When the device reconnects, the outbox is
// replayed against the server:
//
//   • same version on both sides  → fast-forward, apply as is
//   • server moved on, but the change still makes sense (expedite, a correction to a different field,
//     a resident confirming) → merge automatically
//   • server moved on in a way that contradicts the change (order reassigned to someone else, closed,
//     cancelled, or the same field corrected) → conflict, bundled per order, for a person to review
//
// Replays are idempotent: an operation id is applied at most once, so a flaky reconnect can resend safely.
import * as WO from './workorders.js';

const WORK = ['start', 'hold', 'resume', 'complete'];

/** Run one transition on an order (mutates). Throws if the transition isn't allowed. */
export const RUN = {
  assign: (o, a, by, t) => { if (a.dept && a.dept !== o.dept) WO.correct(o, { dept: a.dept }, 'Wrong department', by, t); return WO.assign(o, { dept: a.dept, assignee: a.assignee }, by, t); },
  start: (o, a, by, t) => WO.start(o, by, t),
  hold: (o, a, by, t) => WO.hold(o, a.reason, by, t),
  resume: (o, a, by, t) => WO.resume(o, by, t),
  complete: (o, a, by, t) => WO.complete(o, a.note, by, t),
  confirm: (o, a, by, t) => WO.confirm(o, a.rating, by, t),
  reopen: (o, a, by, t) => WO.reopen(o, a.reason, by, t),
  expedite: (o, a, by, t) => WO.expedite(o, a.reason, by, t, { requester: !!a.requester }),
  correct: (o, a, by, t) => WO.correct(o, a.patch, a.reason, by, t),
};

/** Build an operation for `order` as it is right now on this device. */
export function makeOp({ id, device, user, order, action, args = {}, t }) {
  return { id, device, user, orderId: order.id, kind: 'transition', action, args, base: order.v || 0, baseEvents: order.events.length, t };
}
export const makeCreate = ({ id, device, user, order, t }) => ({ id, device, user, orderId: order.id, kind: 'create', order: structuredClone(order), t });

/** Apply an operation to a list of orders (mutates the matching order). Bumps the version. */
export function apply(orders, op) {
  if (op.kind === 'create') { if (!orders.some(o => o.id === op.orderId)) orders.unshift(structuredClone(op.order)); return orders.find(o => o.id === op.orderId); }
  const o = orders.find(x => x.id === op.orderId);
  if (!o) throw new Error('This order no longer exists.');
  RUN[op.action](o, op.args, op.user, op.t);
  o.v = (o.v || 0) + 1;
  return o;
}

/** Fields the server changed since the device's copy (from events after the base). */
function serverChangedFields(o, op) {
  const fields = new Set();
  for (const e of o.events.slice(op.baseEvents)) {
    if (e.kind === 'corrected') e.data.changes.forEach(c => fields.add(c.field));
    if (e.kind === 'expedited') fields.add('urgency');
    if (e.kind === 'assigned' || e.kind === 'reassigned') fields.add('assignee');
  }
  return fields;
}

/** Why an op can't be merged into a server copy that moved on, or null if it can. */
function conflictReason(o, op) {
  const later = o.events.slice(op.baseEvents);
  const lastBy = later.length ? later[later.length - 1].by : 'someone';
  if (o.status === 'cancelled') return `Merged into ${String(o.dupOf || '').toUpperCase()} as a duplicate by ${lastBy} while the device was offline.`;
  if (o.status === 'closed' && op.action !== 'reopen') return `Closed by ${lastBy} while the device was offline.`;
  if (WORK.includes(op.action) && o.assignee && o.assignee !== op.user) return `Reassigned to ${o.assignee} while the device was offline.`;
  if (op.action === 'correct') {
    const clash = Object.keys(op.args.patch).filter(k => serverChangedFields(o, op).has(k) && op.args.patch[k] !== o[k]);
    if (clash.length) return `The desk also changed ${clash.join(' and ')} while the device was offline.`;
  }
  if (op.action === 'assign' && serverChangedFields(o, op).has('assignee') && o.assignee !== op.args.assignee) return `Already assigned to ${o.assignee} while the device was offline.`;
  return null;
}

/**
 * Replay an outbox against the server copy.
 * @returns {{orders, applied:string[], merged:string[], skipped:string[], conflicts:{orderId,reason,ops}[], appliedIds:string[]}}
 */
export function sync(serverOrders, outbox, appliedIds = []) {
  const orders = structuredClone(serverOrders), seen = new Set(appliedIds);
  const out = { orders, applied: [], merged: [], skipped: [], conflicts: [], appliedIds: [...appliedIds] };
  const blocked = {}; // orderId → conflict, so later ops on the same order join it
  for (const op of outbox) {
    if (seen.has(op.id)) { out.skipped.push(op.id); continue; }
    if (blocked[op.orderId]) { blocked[op.orderId].ops.push(op); continue; }
    const done = how => { out[how].push(op.id); out.appliedIds.push(op.id); seen.add(op.id); };
    if (op.kind === 'create') { apply(orders, op); done('applied'); continue; }
    const o = orders.find(x => x.id === op.orderId);
    if (!o) { blocked[op.orderId] = { orderId: op.orderId, reason: 'The order was removed on the server.', ops: [op] }; out.conflicts.push(blocked[op.orderId]); continue; }
    const fastForward = (o.v || 0) === op.base;
    if (!fastForward) {
      if (op.action === 'expedite' && o.urgency === 'urgent') { out.skipped.push(op.id); out.appliedIds.push(op.id); continue; } // already as urgent as it gets
      const why = conflictReason(o, op);
      if (why) { blocked[op.orderId] = { orderId: op.orderId, reason: why, ops: [op] }; out.conflicts.push(blocked[op.orderId]); continue; }
    }
    try { apply(orders, op); done(fastForward ? 'applied' : 'merged'); }
    catch (e) { blocked[op.orderId] = { orderId: op.orderId, reason: e.message, ops: [op] }; out.conflicts.push(blocked[op.orderId]); }
  }
  return out;
}

/** Outcome of a bundle of work ops, applied over whatever the server has (used for "apply mine"). */
export function applyOverride(orders, conflict, reviewer, t) {
  const o = orders.find(x => x.id === conflict.orderId); if (!o) return null;
  for (const op of conflict.ops) {
    const a = op.args;
    if (WORK.includes(op.action)) { o.assignee = op.user; o.status = { start: 'in_progress', hold: 'on_hold', resume: 'in_progress', complete: 'done' }[op.action]; if (op.action === 'hold') o.hold = a.reason; if (op.action === 'complete') o.fix = a.note; }
    if (op.action === 'correct') Object.assign(o, a.patch);
    if (op.action === 'expedite' && o.urgency !== 'urgent') o.urgency = WO.URGENCY[WO.URGENCY.indexOf(o.urgency) + 1];
    if (op.action === 'reopen') o.status = 'assigned';
    if (op.action === 'confirm') { o.status = 'closed'; o.rating = a.rating; }
    if (op.action === 'assign') { o.assignee = a.assignee; if (a.dept) o.dept = a.dept; if (o.status === 'new') o.status = 'assigned'; }
  }
  o.v = (o.v || 0) + 1;
  o.events.push({ t, by: reviewer, kind: 'sync', text: `Applied ${conflict.ops.length} offline change${conflict.ops.length > 1 ? 's' : ''} from ${conflict.ops[0].user} (${conflict.ops.map(x => x.action).join(', ')}, made ${conflict.ops[0].t}) after review` });
  return o;
}

/** "Keep the server's version": record that offline changes were discarded, so nothing is silently lost. */
export function discard(orders, conflict, reviewer, t) {
  const o = orders.find(x => x.id === conflict.orderId); if (!o) return null;
  o.events.push({ t, by: reviewer, kind: 'sync', text: `Kept the desk’s version; discarded ${conflict.ops.length} offline change${conflict.ops.length > 1 ? 's' : ''} from ${conflict.ops[0].user} (${conflict.ops.map(x => x.action).join(', ')})` });
  return o;
}
