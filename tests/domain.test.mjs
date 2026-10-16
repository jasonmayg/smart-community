// Unit tests for the DOM-free domain logic. Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triage, fromModel, merge, slaLeft, residentReply } from '../assets/js/domain/triage.js';
import { assess, watchlist, THRESHOLD } from '../assets/js/domain/wellbeing.js';
import { walkins, groupBuy, paceCurve } from '../assets/js/domain/forecast.js';
import { split, revenue } from '../assets/js/domain/ledger.js';
import { offlineAnswer, parseModelReply } from '../assets/js/domain/assistant.js';
import { RESIDENTS, R, WALKIN_HIST, WEATHER, DEALS, LUNCH_PRICE } from '../assets/js/domain/data.js';

test('triage: categories and urgency from plain words', () => {
  const leak = triage('Water is leaking from my bathroom ceiling');
  assert.equal(leak.cat, 'repair'); assert.equal(leak.urgency, 'high'); assert.ok(leak.cues.includes('leaking'));
  assert.equal(triage('The elevator smells like smoke').cat, 'safety');
  assert.equal(triage('The elevator smells like smoke').urgency, 'urgent');
  assert.equal(triage('I fell and I feel dizzy').cat, 'care');
  assert.equal(triage('I was charged twice for the fee').cat, 'billing');
  assert.equal(triage('Loud music late at night').cat, 'noise');
  const vague = triage('hello there');
  assert.equal(vague.cat, 'services'); assert.equal(vague.urgency, 'normal');
});

test('triage: curly apostrophes and multi-word cues match', () => {
  assert.equal(triage('I can’t get up').urgency, 'urgent');
  assert.equal(triage('there is no   water').urgency, 'urgent');
});

test('triage: model output is validated', () => {
  assert.equal(fromModel({ cat: 'nope', urgency: 'high' }), null);
  assert.equal(fromModel({ cat: 'repair', urgency: 'whenever' }), null);
  const ok = fromModel({ cat: 'repair', urgency: 'high', reason: 'leak' });
  assert.equal(ok.owner, 'Maintenance team');
  assert.equal(slaLeft('urgent', 5), -1);
  assert.match(residentReply(ok), /today/);
});

test('triage: the model can raise urgency but never lower it', () => {
  const rules = triage('There is smoke in the hallway');
  assert.equal(merge(rules, fromModel({ cat: 'safety', urgency: 'normal' })).urgency, 'urgent');
  const calm = triage('the bench paint is peeling');
  const m = merge(calm, fromModel({ cat: 'repair', urgency: 'high', reason: 'x' }));
  assert.equal(m.urgency, 'high'); assert.equal(m.cat, 'repair'); assert.equal(m.rules.cat, calm.cat);
});

test('wellbeing: seeded stories land where the demo expects', () => {
  const zhao = assess(R.r1), haas = assess(R.r2), chen = assess(R.r0);
  assert.equal(zhao.level, 'high');
  assert.ok(zhao.reasons.some(x => x.signal === 'meals'));
  assert.ok(zhao.reasons.some(x => x.signal === 'door'));
  assert.equal(haas.level, 'high');
  assert.ok(haas.reasons[0].text.includes('No front-door activity'));
  assert.equal(chen.level, 'low');
});

test('wellbeing: pausing the meal plan and checking in lower the score', () => {
  const base = assess(R.r1).score;
  assert.ok(assess(R.r1, { mealPaused: true }).score < base);
  assert.ok(assess(R.r1, { checkedInToday: true }).score < base);
});

test('wellbeing: context never flags on its own', () => {
  const calm = { ...R.r0, age: 95, alone: true };
  assert.equal(assess(calm).score, 0);
});

test('wellbeing: watchlist is sorted and respects dismissals', () => {
  const list = watchlist(RESIDENTS, () => ({}));
  assert.ok(list.length >= 2);
  list.forEach((x, i) => { assert.ok(x.score >= THRESHOLD.medium); if (i) assert.ok(list[i - 1].score >= x.score); });
  const without = watchlist(RESIDENTS, () => ({}), { r1: true });
  assert.ok(!without.some(x => x.r.id === 'r1'));
});

test('forecast: walk-ins follow the weather and carry a range', () => {
  const sun = walkins(WALKIN_HIST, 4, WEATHER.sun), rain = walkins(WALKIN_HIST, 4, WEATHER.rain);
  assert.ok(sun.f > 50 && sun.f < 58);
  assert.ok(rain.f < sun.f);
  assert.ok(sun.lo < sun.f && sun.f < sun.hi);
  assert.equal(walkins(WALKIN_HIST, 5, WEATHER.sun), null); // Saturday: closed
});

test('forecast: group-buy pace curve and projections are sane', () => {
  assert.equal(paceCurve(0), 0); assert.equal(paceCurve(1), 1);
  assert.ok(paceCurve(0.5) > 0.5); // front-loaded
  for (const d of DEALS) {
    const g = groupBuy(d);
    assert.ok(g.f >= d.sold, `${d.id} never below orders already placed`);
    assert.ok(g.stock >= Math.ceil(g.f));
    assert.ok(g.pReachMin >= 0 && g.pReachMin <= 1);
  }
  const done = groupBuy({ ...DEALS[0], sold: 200, elapsedH: 47 });
  assert.equal(done.pReachMin, 1);
});

test('ledger: splits always add up to the payment', () => {
  for (const p of [{ kind: 'bill', amount: 186 }, { kind: 'groupbuy', amount: 6.9 }, { kind: 'lunch', amount: 6.5, delivery: 1 }]) {
    const total = split(p).reduce((a, x) => a + x.amount, 0);
    assert.ok(Math.abs(total - p.amount) < 0.005, p.kind);
  }
  assert.throws(() => split({ kind: 'mystery', amount: 1 }));
});

test('ledger: revenue groups by paying customer', () => {
  const r = revenue({ households: 812, feesCollected: 100000, mealsSenior: 100, mealsRegular: 0, deliveries: 10, groupBuyGMV: 1000, prices: LUNCH_PRICE });
  assert.deepEqual(Object.keys(r.byPayer), ['Property company', 'Residents', 'Merchants']);
  assert.equal(r.byPayer.Merchants, 80);
  assert.equal(r.byPayer['Property company'], 974.4 + 600);
  assert.ok(Math.abs(r.total - r.rows.reduce((a, x) => a + x.amount, 0)) < 0.01);
});

test('assistant: offline answers and actions', () => {
  assert.equal(offlineAnswer('When is the canteen open?').matched, 'hours');
  assert.equal(offlineAnswer('How much is my property fee?').action.type, 'open_bills');
  const twice = offlineAnswer('I think I was charged twice');
  assert.equal(twice.action.type, 'file_request');
  assert.equal(offlineAnswer('What is the meaning of life').action.type, 'file_request');
  assert.equal(offlineAnswer('I fell in the kitchen').action.type, 'help');
});

test('assistant: model replies are validated', () => {
  assert.equal(parseModelReply({ reply: 'Hi', action: { type: 'launch_rocket' } }).action.type, 'none');
  assert.equal(parseModelReply(null, 'plain text').reply, 'plain text');
  assert.equal(parseModelReply({ reply: 'ok', action: { type: 'order_lunch' } }).action.type, 'order_lunch');
});
