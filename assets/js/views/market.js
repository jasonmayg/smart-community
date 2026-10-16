// Group buying, merchant side: live deals, demand forecast, stock advice and settlement.
import { $ } from '../lib/ui.js';
import { ico } from '../lib/icons.js';
import { esc, int, money, pct } from '../lib/format.js';
import { store } from '../state.js';
import { DEALS, MERCHANTS, COMMISSION } from '../domain/data.js';
import { groupBuy } from '../domain/forecast.js';
import { dealArt, kpi } from './shared.js';

let root;

function dealRow(d, sold) {
  const g = groupBuy({ ...d, sold });
  const scale = Math.max(g.hi, d.minGroup) * 1.1;
  const at = v => Math.min(100, v / scale * 100);
  const ok = sold >= d.minGroup;
  return `<div class="deal-row">
    ${dealArt(d.emoji)}
    <div><b>${esc(d.name)}</b><div class="small muted">${esc(MERCHANTS[d.merchant].name)}, ${money(d.price)} (retail ${money(d.retail)})</div>
      <div class="tiny muted">${g.hoursLeft} h left of ${d.windowH} h</div></div>
    <div><div class="progress" aria-label="${sold} ordered, forecast ${Math.round(g.f)}">
        <span class="range" style="left:${at(g.lo)}%;width:${Math.max(1, at(g.hi) - at(g.lo))}%"></span>
        <i style="width:${at(sold)}%;background:${ok ? 'var(--leaf)' : 'var(--brand)'}"></i>
        <span class="mark" style="left:${at(d.minGroup)}%" title="Minimum ${d.minGroup}"></span></div>
      <div class="tiny muted" style="margin-top:8px">${sold} ordered, minimum ${d.minGroup}. Forecast <b style="color:var(--ink)">${Math.round(g.f)}</b> (${Math.round(g.lo)}–${Math.round(g.hi)}).
        ${ok ? 'Deal is on.' : `${pct(g.pReachMin)} chance to reach the minimum.`}</div></div>
    <div style="text-align:right"><div class="small muted">Stock</div><div class="bignum" style="font-size:30px">${g.stock}</div><div class="tiny muted">${g.stock - sold > 0 ? `${g.stock - sold} more than ordered` : 'covered'}</div></div>
  </div>`;
}

function paint() {
  if (!root?.isConnected) return;
  const s = store.data;
  const rows = DEALS.map(d => ({ d, sold: s.sold[d.id], gmv: s.sold[d.id] * d.price }));
  const gmv = rows.reduce((a, x) => a + x.gmv, 0);
  const histAvg = DEALS.reduce((a, d) => a + d.history.reduce((x, y) => x + y, 0) / d.history.length, 0);
  $('#kpis', root).innerHTML = [
    kpi('bag', 'Orders this week', int(rows.reduce((a, x) => a + x.sold, 0)), `usual week ends near ${int(histAvg)}`),
    kpi('store', 'Sales this week', money(gmv), `${DEALS.length} deals, ${Object.keys(MERCHANTS).length} merchants`),
    kpi('receipt', 'Commission', money(gmv * COMMISSION), `${pct(COMMISSION)} of sales, paid by merchants`),
    kpi('users', 'On track', `${rows.filter(x => groupBuy({ ...x.d, sold: x.sold }).pReachMin >= 0.8).length} of ${DEALS.length}`, 'deals likely to reach minimum'),
  ].join('');
  $('#deals', root).innerHTML = rows.map(x => dealRow(x.d, x.sold)).join('');
  $('#settle', root).innerHTML = `<div class="t-wrap"><table class="t"><thead><tr><th>Merchant</th><th class="r">Sales</th><th class="r">Commission</th><th class="r">Payout Friday</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td>${esc(MERCHANTS[x.d.merchant].name)}</td><td class="r">${money(x.gmv)}</td><td class="r">${money(x.gmv * COMMISSION)}</td><td class="r">${money(x.gmv * (1 - COMMISSION))}</td></tr>`).join('')}
    </tbody><tfoot><tr><td>Total</td><td class="r">${money(gmv)}</td><td class="r">${money(gmv * COMMISSION)}</td><td class="r">${money(gmv * (1 - COMMISSION))}</td></tr></tfoot></table></div>
    <p class="small muted" style="margin:10px 0 0">Residents’ money is held until pickup; deals that miss the minimum are refunded automatically.</p>`;
}

export function renderMarket(el) {
  root = el;
  el.innerHTML = `
  <div class="h-page"><div><h2>Group buying</h2><p>Local merchants post weekly deals; neighbors join, and the order is delivered in one drop to the front desk. The forecast tells each merchant how much to bring before the window closes, so less is wasted and fewer residents are turned away.</p></div></div>
  <div class="grid cols-4" id="kpis"></div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h2>Live deals</h2><span class="sub">${ico('sparkles')} Forecast of final orders and stock advice</span>
    <div class="right legend"><span><i style="background:var(--brand)"></i>Ordered</span><span><i style="background:rgba(59,75,200,.18);border:1px dashed var(--brand)"></i>Forecast range</span><span><i style="background:var(--ink);width:3px"></i>Minimum</span></div></div>
    <div class="card-b" id="deals"></div></div>
  <div class="grid cols-2" style="margin-top:16px">
    <div class="card"><div class="card-h"><h2>Merchant settlement</h2></div><div class="card-b" id="settle"></div></div>
    <div class="card"><div class="card-h"><h2>How the forecast works</h2></div><div class="card-b small">
      <p style="margin-top:0">Orders come in fast at the start of a deal and slow down near the end. From past deals, the share of final orders in by a point in the window follows a curve, so <b>orders so far ÷ expected share</b> gives a pace estimate.</p>
      <p>Early on the pace is noisy, so it is blended with the item’s last 8 weeks. The weight on pace grows as the window closes.</p>
      <p style="margin-bottom:0">Stock advice is the 70th percentile of the forecast: enough to cover most outcomes without a lot left over. Try joining a deal in the resident app and watch the forecast move.</p>
    </div></div>
  </div>`;
  const off = store.onChange(paint);
  paint();
  return off;
}
