// Offline sync tests. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as WO from '../assets/js/domain/workorders.js';
import { triage } from '../assets/js/domain/triage.js';
import { makeOp, makeCreate, apply, sync, applyOverride, discard } from '../assets/js/domain/sync.js';

let n = 0;
const order = (text = 'The hallway light flickers at night') => { const o = WO.create({ id: 'o' + (++n), text, who: 'Mrs. Chen, C-302', src: 'App', t: '9:00', triage: triage(text) }); o.v = 0; return o; };
const op = (device, o, action, args, user = 'Leo Chang') => { const x = makeOp({ id: 'op' + (++n), device, user, order: o, action, args, t: '10:00' }); apply(device, x); return x; };
const clone = x => structuredClone(x);

function assigned() { const o = order(); WO.assign(o, { assignee: 'Leo Chang' }, 'Marco', '9:10'); return o; }

test('sync: offline work fast-forwards when the server did not move', () => {
  const server = [assigned()], device = clone(server);
  const box = [op(device, device[0], 'start'), op(device, device[0], 'complete', { note: 'New bulb' })];
  const r = sync(server, box);
  assert.deepEqual(r.applied.length, 2); assert.equal(r.conflicts.length, 0);
  assert.equal(r.orders[0].status, 'done'); assert.equal(r.orders[0].v, 2);
});

test('sync: replay is idempotent', () => {
  const server = [assigned()], device = clone(server);
  const box = [op(device, device[0], 'start')];
  const r1 = sync(server, box);
  const r2 = sync(r1.orders, box, r1.appliedIds);
  assert.equal(r2.skipped.length, 1); assert.equal(r2.orders[0].events.length, r1.orders[0].events.length);
});

test('sync: reassignment while offline is a conflict, bundled per order', () => {
  const server = [assigned()], device = clone(server);
  const box = [op(device, device[0], 'start'), op(device, device[0], 'complete', { note: 'Fixed' })];
  WO.assign(server[0], { assignee: 'Raj Patel' }, 'Marco', '10:30'); server[0].v = 1;
  const r = sync(server, box);
  assert.equal(r.conflicts.length, 1); assert.equal(r.conflicts[0].ops.length, 2);
  assert.match(r.conflicts[0].reason, /Reassigned to Raj Patel/);
  assert.equal(r.orders[0].assignee, 'Raj Patel', 'server untouched until review');
  const o = applyOverride(r.orders, r.conflicts[0], 'Marco', '11:00');
  assert.equal(o.status, 'done'); assert.equal(o.assignee, 'Leo Chang'); assert.equal(o.events.at(-1).kind, 'sync');
});

test('sync: closed on the server blocks offline work; discard leaves a record', () => {
  const server = [assigned()], device = clone(server);
  const box = [op(device, device[0], 'start')];
  WO.start(server[0], 'Leo', 't'); WO.complete(server[0], 'x', 'Leo', 't'); WO.confirm(server[0], 5, 'Mrs. Chen', 't'); server[0].v = 3;
  const r = sync(server, box);
  assert.match(r.conflicts[0].reason, /Closed/);
  discard(r.orders, r.conflicts[0], 'Dana', '11:00');
  assert.match(r.orders[0].events.at(-1).text, /discarded 1 offline change/);
});

test('sync: expedite and confirmations merge when the server moved on', () => {
  const server = [assigned()], device = clone(server);
  const box = [op(device, device[0], 'expedite', { reason: 'Dark', requester: true }, 'Mrs. Chen')];
  WO.start(server[0], 'Leo Chang', '10:10'); server[0].v = 1;
  const r = sync(server, box);
  assert.equal(r.merged.length, 1); assert.equal(r.orders[0].urgency, 'high'); assert.equal(r.orders[0].status, 'in_progress');
});

test('sync: expedite is skipped if the desk already made it urgent', () => {
  const server = [assigned()], device = clone(server);
  const box = [op(device, device[0], 'expedite', { reason: 'Dark' }, 'Mrs. Chen')];
  server[0].urgency = 'urgent'; server[0].v = 1;
  assert.equal(sync(server, box).skipped.length, 1);
});

test('sync: corrections conflict only on the same field', () => {
  const server = [assigned()], device = clone(server);
  const box = [op(device, device[0], 'correct', { patch: { urgency: 'high' }, reason: 'Urgency too low' }, 'Mia Torres')];
  WO.correct(server[0], { cat: 'safety' }, 'Wrong category', 'Priya', '10:20'); server[0].v = 1;
  assert.equal(sync(server, box).merged.length, 1, 'different field merges');
  const s2 = [assigned()], d2 = clone(s2);
  const b2 = [op(d2, d2[0], 'correct', { patch: { urgency: 'high' }, reason: 'Urgency too low' }, 'Mia Torres')];
  WO.correct(s2[0], { urgency: 'urgent' }, 'Urgency too low', 'Priya', '10:20'); s2[0].v = 1;
  assert.match(sync(s2, b2).conflicts[0].reason, /also changed urgency/);
});

test('sync: orders created offline are added once, with their follow-up changes', () => {
  const server = [], device = [];
  const o = order('Stairwell light is out');
  const c = makeCreate({ id: 'c1', device, user: 'Mrs. Chen', order: o, t: '9:00' }); apply(device, c);
  const e = op(device, device[0], 'expedite', { reason: 'Dark', requester: true }, 'Mrs. Chen');
  const r = sync(server, [c, e]);
  assert.equal(r.orders.length, 1); assert.equal(r.orders[0].urgency, 'high'); assert.equal(r.applied.length, 2);
  assert.equal(sync(r.orders, [c, e], r.appliedIds).orders.length, 1);
});
