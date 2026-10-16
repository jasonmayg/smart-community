// App state: one store shared by every view, plus the actions that change it.
// Views read store.data and call these actions; they never write state directly.
import { createStore } from './lib/store.js';
import { timeNow, money } from './lib/format.js';
import { triage } from './domain/triage.js';
import { split } from './domain/ledger.js';
import { SEED_REQUESTS, DEALS, BILL, R, ME } from './domain/data.js';
import { SEED_USERS, checkGrant, checkRevoke, roleLabel } from './domain/org.js';
import { buildRegistry, matchAsset } from './domain/assets.js';
import * as WO from './domain/workorders.js';

/** Facility registry is derived data (rebuilt on load), not saved state. */
export const REGISTRY = buildRegistry();
export const ASSET = Object.fromEntries(REGISTRY.map(a => [a.id, a]));

/** Only physical problems are matched to a facility asset ("not answering her door" is not about a door reader). */
export function assetFor(text, t, who) {
  return ['repair', 'safety'].includes(t.cat) ? matchAsset(text, REGISTRY, homeOf(who)) : null;
}

/** "Mrs. Chen, C-302" → { building: 'C', floor: 3 } so the resident's words can be matched to an asset. */
export function homeOf(who) {
  const m = String(who).match(/\b([A-F])-(\d)\d\d\b/);
  return m ? { building: m[1], floor: +m[2] } : {};
}

function seedOrders() {
  const make = (q, extra = {}) => { const t = triage(q.text); return WO.create({ ...q, triage: t, asset: assetFor(q.text, t, q.who), ...extra }); };
  const [q1, q2, q3, q4, q5] = SEED_REQUESTS;
  const o1 = make(q1); WO.assign(o1, { assignee: 'Raj Patel' }, 'Marco Ruiz', 'Mon 11:02');
  const o2 = make(q2);
  const o3 = make(q3); WO.assign(o3, { assignee: 'Mia Torres' }, 'Priya Nair', '9:07 AM'); WO.start(o3, 'Mia Torres', '9:15 AM');
  const o4 = make(q4);
  const o5 = make(q5); WO.assign(o5, { assignee: 'Tom Weber' }, 'Priya Nair', '10:10 AM');
  const o6 = make({ id: 'q6', who: 'Mr. Silva, C-104', src: 'App', text: 'The card reader at the building C entrance keeps beeping red, I had to wait for a neighbor', t: '7:48 AM', ageH: 4.5 });
  const o7 = make({ id: 'q7', who: 'Mrs. Chen, C-302', src: 'Phone', text: 'Bathroom fan is not working', t: 'Wed 2:15 PM', ageH: 44 });
  WO.assign(o7, { assignee: 'Leo Chang' }, 'Marco Ruiz', 'Wed 3:00 PM'); WO.start(o7, 'Leo Chang', 'Thu 9:10 AM'); WO.complete(o7, 'Replaced fan motor', 'Leo Chang', 'Thu 10:05 AM');
  // A recent AI miss, corrected by staff: "smoke" made the rules call a low-battery chirp an urgent safety case.
  const o8 = make({ id: 'q8', who: 'Mr. Haddad, F-503', src: 'App', text: 'My smoke alarm keeps chirping every minute, I think the battery is low', t: '8:20 AM', ageH: 3.5 });
  WO.correct(o8, { cat: 'repair', urgency: 'normal' }, 'Wrong category', 'Mia Torres', '8:31 AM');
  return [o1, o2, o3, o4, o5, o6, o7, o8];
}

export const defaults = () => ({
  v: 2,
  viewer: 'u2',
  wallet: 248.6,
  txns: [
    { t: 'Oct 14', label: 'Lunch, steamed fish', amount: -5.5, kind: 'lunch' },
    { t: 'Oct 12', label: 'Added by your daughter', amount: 60, kind: 'topup' },
    { t: 'Oct 10', label: 'Group buy, whole-wheat loaf', amount: -3.2, kind: 'groupbuy' },
  ],
  billPaid: false,
  lunch: null,
  mealPlan: false,
  checkedIn: false,
  orders: seedOrders(),
  aiHistory: { total: 186, catFixed: 14, deptFixed: 11, urgencyUp: 3 }, // last 30 days before this demo
  tasks: [
    { id: 'b1', kind: 'Delivery', text: 'Route 1: 6 lunches, Buildings A and B', status: 'open' },
    { id: 'b2', kind: 'Errand', text: 'Pick up a prescription for Mrs. Novak, E-405', status: 'open' },
  ],
  users: SEED_USERS,
  audit: [{ t: 'Oct 1', by: 'Grace Liu', text: 'Granted Property manager to Dana Brooks at Maple Court' }],
  planned: {}, // assetId → work order id for approved preventive replacements
  mealPaused: {},
  dismissed: {},
  sold: Object.fromEntries(DEALS.map(d => [d.id, d.sold])),
  mine: {},
  payments: [],
  activity: [],
  chat: [{ from: 'bot', text: 'Hello Mrs. Chen. Ask me anything about the community: lunch, bills, repairs, parcels.' }],
  weather: 'sun',
});

export const store = createStore('cm3_state', defaults);
const S = () => store.data;

export const viewer = () => S().users.find(u => u.id === S().viewer) || S().users[0];
export const userByName = name => S().users.find(u => u.name === name);

export function log(icon, html) {
  store.update(s => { s.activity.unshift({ t: timeNow(), icon, html }); s.activity = s.activity.slice(0, 40); });
}

/** Charge the resident wallet and record where the money goes. */
export function pay({ kind, amount, label, delivery }) {
  if (S().wallet + 1e-9 < amount) return { ok: false, reason: `Not enough in your wallet (${money(S().wallet)}).` };
  const parts = split({ kind, amount, delivery });
  store.update(s => {
    s.wallet = Math.round((s.wallet - amount) * 100) / 100;
    s.txns.unshift({ t: 'Today', label, amount: -amount, kind });
    s.payments.unshift({ t: timeNow(), label, amount, kind, parts });
  });
  return { ok: true, parts };
}

export function topUp(amount, by = 'your daughter') {
  store.update(s => { s.wallet = Math.round((s.wallet + amount) * 100) / 100; s.txns.unshift({ t: 'Today', label: `Added by ${by}`, amount, kind: 'topup' }); });
}

/** File a request as a work order. `triaged` is a triage() / fromModel() result. */
export function fileRequest(text, triaged, { who = `${R[ME].name}, ${R[ME].apt}`, src = 'App', household = null } = {}) {
  const asset = assetFor(text, triaged, who);
  const o = WO.create({ id: 'q' + Date.now(), text, who, src, t: timeNow(), triage: triaged, asset, household: household || (who.startsWith(R[ME].name) ? 'h1' : null) });
  store.update(s => { s.orders.unshift(o); });
  return o;
}

/**
 * Run a work-order transition by id. `fn(order, orders)` may throw; the error message is returned
 * so the view can show it. Nothing is saved if it throws.
 */
export function act(id, fn) {
  const copy = structuredClone(S().orders);
  const o = copy.find(x => x.id === id);
  try { fn(o, copy); } catch (e) { return { ok: false, reason: e.message }; }
  store.update(s => { s.orders = copy; });
  return { ok: true, order: o };
}

export function addTask(task) {
  store.update(s => { s.tasks.unshift({ id: 't' + Date.now(), status: 'open', ...task }); });
}

// ------------------------------------------------------------------ access management
export function grant(actor, { name, role, scope }) {
  const chk = checkGrant(actor, role, scope);
  if (!chk.ok) return chk;
  if (!name.trim()) return { ok: false, reason: 'Enter a name.' };
  const u = { id: 'u' + Date.now(), name: name.trim(), role, scope: { ...scope } };
  store.update(s => {
    s.users.push(u);
    s.audit.unshift({ t: timeNow(), by: actor.name, text: `Granted ${roleLabel(u)} to ${u.name}` });
  });
  return { ok: true, user: u };
}

export function revoke(actor, userId) {
  const target = S().users.find(u => u.id === userId);
  const chk = checkRevoke(actor, target);
  if (!chk.ok) return chk;
  store.update(s => {
    s.users = s.users.filter(u => u.id !== userId);
    s.audit.unshift({ t: timeNow(), by: actor.name, text: `Removed ${roleLabel(target)} access for ${target.name}` });
    if (s.viewer === userId) s.viewer = actor.id;
  });
  return { ok: true };
}

export function updateUser(actor, userId, patch, what) {
  store.update(s => {
    Object.assign(s.users.find(u => u.id === userId), patch);
    s.audit.unshift({ t: timeNow(), by: actor.name, text: what });
  });
}

export const billTotal = () => BILL.lines.reduce((a, l) => a + l[1], 0);
