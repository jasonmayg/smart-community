// Community canteen: today's orders, tomorrow's forecast, delivery routes.
import { $ } from '../lib/ui.js';
import { ico } from '../lib/icons.js';
import { esc, int, money } from '../lib/format.js';
import { store } from '../state.js';
import { RESIDENTS, ME, R, MENU, LUNCH_PRICE, WALKIN_HIST, WEATHER, MTD } from '../domain/data.js';
import { walkins } from '../domain/forecast.js';
import { kpi } from './shared.js';
import { routes } from '../domain/routes.js';

let root;
const BASE = { planDine: 31, planDeliver: 12, appOrders: 9, walkinsSoFar: 37 }; // households outside the 24 demo residents

function tomorrowWd() { const d = (new Date().getDay() + 1) % 7; return d === 0 || d === 6 ? 0 : d - 1; }

function paint() {
  if (!root?.isConnected) return;
  const s = store.data;
  const onPlan = RESIDENTS.filter(r => (r.id === ME ? s.mealPlan : r.mealPlan) && !s.mealPaused[r.id]);
  const deliverPlan = onPlan.filter((_, i) => i % 2 === 0);
  const chenDeliver = s.lunch?.mode === 'deliver';
  const rows = [
    ['Lunch plan, dine-in', onPlan.length - deliverPlan.length + BASE.planDine],
    ['Lunch plan, delivery', deliverPlan.length + BASE.planDeliver],
    ['Ordered in the app today', BASE.appOrders + (s.lunch ? 1 : 0)],
    ['Walk-ins so far', BASE.walkinsSoFar],
  ];
  const total = rows.reduce((a, r) => a + r[1], 0);
  const wd = tomorrowWd(), w = WEATHER[s.weather], fc = walkins(WALKIN_HIST, wd, w);
  const deliveriesTmr = (deliverPlan.length + BASE.planDeliver) * w.deliver;
  const prep = Math.ceil((fc.f + 0.5 * fc.sd + deliveriesTmr + onPlan.length - deliverPlan.length + BASE.planDine) / 5) * 5;
  const stops = [...deliverPlan, ...(chenDeliver && !deliverPlan.includes(R[ME]) ? [R[ME]] : [])];

  $('#kpis', root).innerHTML = [
    kpi('utensils', 'Lunches today', total, `${rows[1][1]} delivered`),
    kpi('trend', 'Prep for tomorrow', prep, `${w.label.toLowerCase()} forecast`),
    kpi('receipt', 'Meal sales this month', money(MTD.mealsSenior * LUNCH_PRICE.senior + MTD.mealsRegular * LUNCH_PRICE.regular), `${int(MTD.mealsSenior + MTD.mealsRegular)} meals`),
    kpi('truck', 'Delivery routes today', routes(stops).length, `${stops.length} demo residents + ${BASE.planDeliver} others`),
  ].join('');
  $('#orders', root).innerHTML = `<div class="t-wrap"><table class="t"><thead><tr><th>Source</th><th class="r">Meals</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td class="r">${r[1]}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="r">${total}</td></tr></tfoot></table></div>
    <div class="small muted" style="margin-top:10px">Menu: ${MENU.map(m => esc(m.name)).join('; ')}. All soft-cooked.</div>`;
  $('#weather', root).innerHTML = Object.entries(WEATHER).map(([k, v]) => `<button data-w="${k}" aria-pressed="${k === s.weather}">${v.label}</button>`).join('');
  $('#forecast', root).innerHTML = `
    <div class="row wrap" style="gap:28px;margin-top:14px">
      <div><div class="small muted">Walk-ins</div><div class="bignum">${int(fc.f)}</div><div class="tiny muted">80% range ${int(fc.lo)}–${int(fc.hi)}</div></div>
      <div><div class="small muted">Deliveries</div><div class="bignum">${int(deliveriesTmr)}</div><div class="tiny muted">${w.deliver === 1 ? 'no change' : `+${Math.round((w.deliver - 1) * 100)}% in ${w.label.toLowerCase()}`}</div></div>
      <div><div class="small muted">Prep in total</div><div class="bignum" style="color:var(--leaf)">${prep}</div><div class="tiny muted">rounded up to 5</div></div>
    </div>
    <p class="small muted" style="margin:12px 0 0">Recency-weighted average of the same weekday over the last ${fc.weeks} weeks (${int(fc.base)}), ${w.walk === 1 ? 'no weather adjustment' : `× ${w.walk} because ${w.label.toLowerCase()} keeps people home`}. The range comes from back-testing the same method; walk-ins are prepped at the forecast plus half a standard deviation.</p>`;
  const rs = routes(stops);
  $('#routes', root).innerHTML = rs.map((bt, i) => `<div class="route"><b>Route ${i + 1}</b>, Building${new Set(bt.list.map(r => r.building)).size > 1 ? 's' : ''} ${[...new Set(bt.list.map(r => r.building))].join(', ')}, ${bt.list.length} stop${bt.list.length > 1 ? 's' : ''}<div class="small muted">${bt.list.map(r => `${esc(r.name)} ${r.apt}${r.soft ? ' (soft food)' : ''}`).join('; ')}</div></div>`).join('') + '<p class="small muted" style="margin:0">Routes go to volunteers at 11:00.</p>';
}

export function renderCanteen(el) {
  root = el;
  el.innerHTML = `
  <div class="h-page"><div><h2>Community canteen</h2><p>Hot lunch for older residents, eaten in or delivered. Plan subscribers are known in advance; walk-ins are forecast. A skipped plan lunch also feeds the care watchlist.</p></div></div>
  <div class="grid cols-4" id="kpis"></div>
  <div class="grid cols-2" style="margin-top:16px">
    <div class="card"><div class="card-h"><h2>Today’s orders</h2></div><div class="card-b" id="orders"></div></div>
    <div class="card"><div class="card-h"><h2>Tomorrow’s forecast</h2><span class="sub">${ico('sparkles')}</span></div><div class="card-b"><div class="seg" id="weather" role="group" aria-label="Tomorrow’s weather"></div><div id="forecast"></div></div></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h2>Delivery routes</h2><span class="sub">Grouped by building and floor, at most six stops each</span></div><div class="card-b" id="routes"></div></div>`;
  el.onclick = e => { const b = e.target.closest('[data-w]'); if (b) store.update(s => { s.weather = b.dataset.w; }); };
  const off = store.onChange(paint);
  paint();
  return off;
}
