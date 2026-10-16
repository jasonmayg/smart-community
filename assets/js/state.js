// App state: one store shared by every view, plus small actions that change it.
// Views read store.data and call these actions; they never write state directly.
import { createStore } from './lib/store.js';
import { timeNow, money } from './lib/format.js';
import { triage } from './domain/triage.js';
import { split } from './domain/ledger.js';
import { SEED_REQUESTS, DEALS, BILL, R, ME } from './domain/data.js';

export const defaults = () => ({
  v: 1,
  wallet: 248.6,
  txns: [
    { t: 'Oct 14', label: 'Lunch, steamed fish', amount: -5.5, kind: 'lunch' },
    { t: 'Oct 12', label: 'Added by your daughter', amount: 60, kind: 'topup' },
    { t: 'Oct 10', label: 'Group buy, whole-wheat loaf', amount: -3.2, kind: 'groupbuy' },
  ],
  billPaid: false,
  lunch: null, // today's order {id, mode, price}
  mealPlan: false, // Mrs. Chen's weekday lunch plan
  checkedIn: false,
  requests: SEED_REQUESTS.map(q => ({ ...q, ...triage(q.text), status: 'open' })),
  tasks: [
    { id: 'b1', kind: 'Delivery', text: 'Route 1: 6 lunches, Buildings A and B', status: 'open' },
    { id: 'b2', kind: 'Errand', text: 'Pick up a prescription for Mrs. Novak, E-405', status: 'open' },
  ],
  mealPaused: {},
  dismissed: {},
  sold: Object.fromEntries(DEALS.map(d => [d.id, d.sold])),
  mine: {}, // group-buy quantities Mrs. Chen joined
  payments: [], // live payments made in this demo, with their splits
  activity: [],
  chat: [{ from: 'bot', text: 'Hello Mrs. Chen. Ask me anything about the community: lunch, bills, repairs, parcels.' }],
  weather: 'sun',
});

export const store = createStore('cm2_state', defaults);
const S = () => store.data;

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

/** File a request into the property desk queue. triaged = result of triage() or fromModel(). */
export function fileRequest(text, triaged, { who = `${R[ME].name}, ${R[ME].apt}`, src = 'App' } = {}) {
  const q = { id: 'q' + Date.now(), who, src, text, t: timeNow(), ageH: 0, ...triaged, status: 'open' };
  store.update(s => { s.requests.unshift(q); });
  return q;
}

export function addTask(task) {
  store.update(s => { s.tasks.unshift({ id: 't' + Date.now(), status: 'open', ...task }); });
}

export const billTotal = () => BILL.lines.reduce((a, l) => a + l[1], 0);
