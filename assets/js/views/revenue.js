// Business model: who pays the platform, and where each resident payment goes.
import { $ } from '../lib/ui.js';
import { ico } from '../lib/icons.js';
import { esc, money, int } from '../lib/format.js';
import { store } from '../state.js';
import { COMMUNITY, FEE_COLLECTION, MTD, LUNCH_PRICE, DEALS } from '../domain/data.js';
import { revenue } from '../domain/ledger.js';

let root;
const COLORS = { 'Property company': '#3B4BC8', Residents: '#F2BE45', Merchants: '#2F8452' };

function paint() {
  if (!root?.isConnected) return;
  const s = store.data;
  const live = { bill: 0, lunch: 0, deliveries: 0, groupbuy: 0 };
  s.payments.forEach(p => { live[p.kind] += p.amount; if (p.kind === 'lunch' && p.parts.length > 1) live.deliveries++; });
  const gmvWeek = DEALS.reduce((a, d) => a + s.sold[d.id] * d.price, 0);
  const m = {
    households: COMMUNITY.households,
    feesCollected: (FEE_COLLECTION.paidOnline) * FEE_COLLECTION.avgBill + live.bill,
    mealsSenior: MTD.mealsSenior + s.payments.filter(p => p.kind === 'lunch').length, mealsRegular: MTD.mealsRegular,
    deliveries: MTD.deliveries + live.deliveries,
    groupBuyGMV: MTD.groupBuyGMV + gmvWeek - DEALS.reduce((a, d) => a + d.sold * d.price, 0),
    prices: LUNCH_PRICE,
  };
  const r = revenue(m);
  $('#payers', root).innerHTML = Object.entries(r.byPayer).map(([p, v]) => `<div class="payer" style="border-top:4px solid ${COLORS[p]}"><span class="small muted">${p}</span><b class="num">${money(v)}</b><span class="tiny muted">${p === 'Property company' ? 'software + fee collection' : p === 'Residents' ? 'meals + delivery' : 'group-buy commission'}</span></div>`).join('');
  $('#stack', root).innerHTML = Object.entries(r.byPayer).map(([p, v]) => `<i style="width:${v / r.total * 100}%;background:${COLORS[p]}" title="${p}"></i>`).join('');
  $('#table', root).innerHTML = `<div class="t-wrap"><table class="t"><thead><tr><th>Paid by</th><th>What</th><th>Basis</th><th class="r">Month to date</th></tr></thead><tbody>
    ${r.rows.map(x => `<tr><td><span class="legend"><span><i style="background:${COLORS[x.payer]}"></i>${x.payer}</span></span></td><td>${x.item}</td><td class="small muted">${x.base}</td><td class="r">${money(x.amount)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="3">Platform revenue</td><td class="r">${money(r.total)}</td></tr></tfoot></table></div>
    <p class="small muted" style="margin:10px 0 0">That is ${money(r.total / COMMUNITY.households)} per household per month, against ${money(1.2)} from software alone. The software gets the platform into the community; the services residents use every day are what make it pay.</p>`;
  $('#ledger', root).innerHTML = s.payments.length ? s.payments.map(p => `<div class="list-item" style="align-items:flex-start"><div class="icon-tile">${ico({ bill: 'receipt', lunch: 'utensils', groupbuy: 'bag' }[p.kind])}</div>
      <div style="flex:1;min-width:0"><div class="row" style="justify-content:space-between"><b>${esc(p.label)}</b><b class="num">${money(p.amount)}</b></div>
      <div class="small muted">${p.t}, from Mrs. Chen’s wallet</div>
      ${p.parts.map(x => `<div class="row small" style="justify-content:space-between"><span>→ ${x.to}</span><span class="num">${money(x.amount)}</span></div>`).join('')}</div></div>`).join('')
    : '<div class="empty">No payments yet in this demo. Pay the bill, order lunch or join a group buy in the <a href="#/resident">resident app</a>, and each payment shows up here split between who receives it.</div>';
}

export function renderRevenue(el) {
  root = el;
  el.innerHTML = `
  <div class="h-page"><div><h2>Revenue</h2><p>Three kinds of customer pay the platform: the property company (software and fee collection), residents (meals and delivery) and merchants (commission on group buys). Figures are month to date for one simulated community of ${int(COMMUNITY.households)} households, and they move as you pay in the demo.</p></div></div>
  <div class="flow" id="payers"></div>
  <div class="stackbar" id="stack" style="margin:14px 0 4px"></div>
  <div class="grid split" style="margin-top:16px">
    <div class="card"><div class="card-h"><h2>Revenue by stream</h2></div><div class="card-b" id="table"></div></div>
    <div class="card"><div class="card-h"><h2>Payments in this demo</h2><span class="sub">and where the money went</span></div><div class="card-b" id="ledger"></div></div>
  </div>`;
  const off = store.onChange(paint);
  paint();
  return off;
}
