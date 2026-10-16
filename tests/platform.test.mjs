// Tests for organization/access, facility lifecycle and work orders. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_USERS, can, checkGrant, checkRevoke, grantableRoles, visibleUsers, canSee, permsOf } from '../assets/js/domain/org.js';
import { R, pFail, medianResidual, optimalReplacement, drift, buildRegistry, assess, batchPlan, matchAsset, TYPES } from '../assets/js/domain/assets.js';
import * as WO from '../assets/js/domain/workorders.js';
import { triage } from '../assets/js/domain/triage.js';

const U = Object.fromEntries(SEED_USERS.map(u => [u.name, u]));
const P1 = { group: 'g1', property: 'p1' };

// ---------------------------------------------------------------- access
test('access: each level grants only below itself and inside its scope', () => {
  assert.ok(checkGrant(U['Grace Liu'], 'property_manager', { group: 'g1', property: 'p2' }).ok);
  assert.ok(!checkGrant(U['Grace Liu'], 'group_admin', { group: 'g1' }).ok, 'no peer grants');
  assert.ok(checkGrant(U['Dana Brooks'], 'dept_lead', { ...P1, dept: 'security' }).ok);
  assert.ok(!checkGrant(U['Dana Brooks'], 'staff', { group: 'g1', property: 'p2', dept: 'cs' }).ok, 'other property');
  assert.ok(checkGrant(U['Marco Ruiz'], 'staff', { ...P1, dept: 'maintenance' }).ok);
  assert.ok(!checkGrant(U['Marco Ruiz'], 'staff', { ...P1, dept: 'finance' }).ok, 'other department');
  assert.ok(!checkGrant(U['Leo Chang'], 'staff', { ...P1, dept: 'maintenance' }).ok, 'staff cannot grant');
});

test('access: household heads manage only their own family', () => {
  const d = U['Daniel Okafor'];
  assert.ok(checkGrant(d, 'child', { ...P1, household: 'h2' }).ok);
  assert.ok(checkGrant(d, 'older_adult', { ...P1, household: 'h2' }).ok);
  assert.ok(!checkGrant(d, 'adult', { ...P1, household: 'h1' }).ok, 'other household');
  assert.ok(!checkGrant(d, 'staff', { ...P1, dept: 'cs' }).ok, 'no staff roles');
  assert.ok(!checkGrant(d, 'household_head', { ...P1, household: 'h2' }).ok, 'cannot create another head');
  assert.deepEqual(grantableRoles(d).sort(), ['adult', 'child', 'older_adult']);
  assert.ok(checkGrant(U['Dana Brooks'], 'household_head', { ...P1, household: 'h2' }).ok);
});

test('access: revoking follows the same rule, never yourself', () => {
  assert.ok(checkRevoke(U['Dana Brooks'], U['Leo Chang']).ok);
  assert.ok(!checkRevoke(U['Leo Chang'], U['Dana Brooks']).ok);
  assert.ok(!checkRevoke(U['Dana Brooks'], U['Dana Brooks']).ok);
});

test('access: department sets what staff can do', () => {
  assert.ok(can(U['Leo Chang'], 'wo.work')); assert.ok(!can(U['Leo Chang'], 'wo.assign'));
  assert.ok(can(U['Marco Ruiz'], 'assets.plan'));
  assert.ok(can(U['Mia Torres'], 'wo.correct')); assert.ok(!can(U['Mia Torres'], 'wo.work'));
  assert.ok(!can(U['Tobi Okafor'], 'pay'));
  assert.ok(canSee(U['Leo Chang'], 'orders') && canSee(U['Leo Chang'], 'facilities') && !canSee(U['Leo Chang'], 'revenue'));
  assert.ok(!canSee(U['Daniel Okafor'], 'orders') && canSee(U['Daniel Okafor'], 'resident'));
  assert.ok(permsOf(U['Grace Liu']).has('portfolio.view'));
  assert.equal(visibleUsers(U['Daniel Okafor'], SEED_USERS).length, 4);
  assert.equal(visibleUsers(U['Marco Ruiz'], SEED_USERS).length, 3);
});

// ---------------------------------------------------------------- lifecycle
test('lifecycle: Weibull helpers behave', () => {
  assert.equal(R(0, 2, 100), 1);
  assert.ok(pFail(50, 10, 3, 100) > pFail(10, 10, 3, 100), 'wear-out: older fails sooner');
  assert.ok(Math.abs(pFail(10, 10, 1, 100) - pFail(80, 10, 1, 100)) < 1e-9, 'beta 1 is memoryless');
  assert.ok(medianResidual(0, 1, 100) - 100 * Math.LN2 < 1e-6);
});

test('lifecycle: planned replacement pays only for wear-out with costly failures', () => {
  const steep = optimalReplacement(3, 100, 1, 10), flat = optimalReplacement(1, 100, 1, 10);
  assert.ok(steep.T < 100 && steep.saving > 0.3);
  assert.equal(flat.policy, 'run-to-failure');
  assert.equal(optimalReplacement(3, 60000, 45, 75).policy, 'run-to-failure');
});

test('lifecycle: drift flags a shifted health signal', () => {
  assert.ok(drift([...Array(23).fill(1), ...Array(7).fill(3)]).z > 5);
  assert.equal(drift([1, 2]).z, 0);
});

test('lifecycle: registry stories and batch plan', () => {
  const reg = buildRegistry(); const st = id => assess(reg.find(a => a.id === id));
  assert.equal(st('A-4-L2').status, 'failed');
  assert.equal(st('C-DOOR').status, 'replace');
  assert.ok(st('C-DOOR').reasons[0].includes('Failed card reads'));
  assert.equal(st('D-ELV').status, 'replace');
  assert.ok(st('C-1-L1').detectH < 1 && st('A-1-L1').detectH >= 6, 'connected buildings detect in minutes');
  const plan = batchPlan(reg.map(a => ({ a, st: assess(a) })));
  assert.ok(plan.length >= 3);
  plan.forEach(v => assert.ok(v.cost > 0 && v.saved === 60 * (v.items.length - 1)));
});

test('lifecycle: resident words map to the right asset', () => {
  const reg = buildRegistry();
  assert.equal(matchAsset('Hallway light on floor 4 is out', reg, { building: 'A' }).asset.id, 'A-4-L2');
  assert.equal(matchAsset('the card reader at building C entrance keeps failing', reg).asset.id, 'C-DOOR');
  assert.equal(matchAsset('elevator in building D is slow to close', reg).asset.id, 'D-ELV');
  assert.equal(matchAsset('my neighbor is noisy', reg), null);
});

// ---------------------------------------------------------------- work orders
const mk = (text, extra = {}) => WO.create({ id: 'w' + Math.random(), text, who: 'Mrs. Chen, C-302', src: 'App', t: '9:00', triage: triage(text), ...extra });

test('work orders: full happy path with resident confirmation', () => {
  const o = mk('Water is leaking from my bathroom ceiling');
  assert.equal(o.dept, 'maintenance'); assert.equal(o.status, 'new');
  WO.assign(o, { assignee: 'Leo Chang' }, 'Marco', '9:05'); WO.start(o, 'Leo', '9:30');
  WO.hold(o, 'Waiting for parts', 'Leo', '9:45'); WO.resume(o, 'Leo', '13:00');
  WO.complete(o, 'Replaced seal', 'Leo', '14:00'); WO.confirm(o, 5, 'Mrs. Chen', '15:00');
  assert.equal(o.status, 'closed');
  assert.deepEqual(o.events.map(e => e.kind), ['created', 'ai', 'assigned', 'started', 'hold', 'resumed', 'completed', 'closed']);
  assert.throws(() => WO.start(o, 'Leo', '16:00'));
});

test('work orders: reopen sends it back to the assignee', () => {
  const o = mk('Hallway light is broken'); WO.assign(o, { assignee: 'Leo Chang' }, 'M', 't'); WO.start(o, 'L', 't'); WO.complete(o, 'Bulb', 'L', 't');
  WO.reopen(o, 'Still dark', 'Mrs. Chen', 't');
  assert.equal(o.status, 'assigned'); assert.equal(o.reopens, 1);
});

test('work orders: expedite raises urgency once for residents', () => {
  const o = mk('The hallway light flickers'); assert.equal(o.urgency, 'normal');
  WO.expedite(o, 'Dark at night, I might fall', 'Mrs. Chen', 't', { requester: true });
  assert.equal(o.urgency, 'high');
  assert.throws(() => WO.expedite(o, 'again', 'Mrs. Chen', 't', { requester: true }));
  WO.expedite(o, 'Resident is 78 and lives alone', 'Mia', 't');
  assert.equal(o.urgency, 'urgent');
  assert.throws(() => WO.expedite(o, 'more', 'Mia', 't'));
});

test('work orders: escalation ladder follows time past deadline', () => {
  const o = mk('Hallway light is broken'); o.urgency = 'high';
  o.ageH = 10; assert.equal(WO.escalationLevel(o), 0);
  o.ageH = 30; assert.equal(WO.escalationLevel(o), 1);
  o.ageH = 40; assert.equal(WO.escalationLevel(o), 2);
  o.ageH = 60; assert.equal(WO.escalationLevel(o), 3);
  o.status = 'closed'; assert.equal(WO.escalationLevel(o), 0);
});

test('work orders: corrections are recorded against the AI and move departments', () => {
  const o = mk('I was charged twice for my fee'); WO.assign(o, { assignee: 'Tom Weber' }, 'x', 't');
  WO.correct(o, { cat: 'services' }, 'Wrong category', 'Mia', 't');
  assert.equal(o.dept, 'cs'); assert.equal(o.status, 'new'); assert.equal(o.assignee, null);
  const q = WO.aiQuality([o]);
  assert.equal(q.catFixed, 1); assert.equal(q.deptFixed, 1);
  assert.throws(() => WO.correct(o, { cat: 'services' }, 'x', 'Mia', 't'), /Nothing changed/);
});

test('work orders: duplicates by asset or words, and merge', () => {
  const reg = buildRegistry();
  const a = mk('Hallway light on floor 4 is out', { asset: matchAsset('Hallway light on floor 4', reg, { building: 'A' }) });
  const b = mk('Floor 4 corridor is dark, light broken', { asset: matchAsset('floor 4 light', reg, { building: 'A' }) });
  const c = mk('Loud music at night');
  assert.deepEqual(WO.findDuplicates(b, [a, b, c]).map(x => x.id), [a.id]);
  WO.merge(b, a, 'Mia', 't');
  assert.equal(b.status, 'cancelled'); assert.equal(b.dupOf, a.id); assert.ok(a.followers.length === 1);
});

test('work orders: actions depend on state and permissions', () => {
  const o = mk('Hallway light is broken');
  const lead = permsOf(U['Marco Ruiz']), tech = permsOf(U['Leo Chang']), head = permsOf(U['Mrs. Chen']);
  assert.ok(WO.actions(o, lead).includes('assign'));
  assert.ok(!WO.actions(o, tech).includes('assign'));
  WO.assign(o, { assignee: 'Leo Chang' }, 'M', 't');
  assert.deepEqual(WO.actions(o, tech, { isAssignee: true }), ['start']);
  assert.deepEqual(WO.actions(o, tech, { isAssignee: false }), []);
  assert.ok(WO.actions(o, head, { isRequester: true }).includes('expedite'));
});
