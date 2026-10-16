// Who pays, who receives, and what the platform keeps.
// Three paying customers: the property company, residents and merchants.
import { PRICING, MEAL_COST_RATIO } from './data.js';

const r2 = n => Math.round(n * 100) / 100;

/**
 * Split one resident payment between its recipients.
 * @param {{kind:'bill'|'lunch'|'groupbuy', amount:number, delivery?:number}} p
 * @returns {{to:string, amount:number}[]} parts that add up to p.amount
 */
export function split(p) {
  if (p.kind === 'bill') {
    const fee = r2(p.amount * PRICING.paymentRate);
    return [{ to: 'Property company', amount: r2(p.amount - fee) }, { to: 'Platform (payment fee, paid by property)', amount: fee }];
  }
  if (p.kind === 'groupbuy') {
    const fee = r2(p.amount * PRICING.commission);
    return [{ to: 'Merchant', amount: r2(p.amount - fee) }, { to: 'Platform (commission, paid by merchant)', amount: fee }];
  }
  if (p.kind === 'lunch') {
    const parts = [{ to: 'Community canteen', amount: r2(p.amount - (p.delivery || 0)) }];
    if (p.delivery) parts.push({ to: 'Delivery', amount: p.delivery });
    return parts;
  }
  throw new Error('Unknown payment kind: ' + p.kind);
}

/**
 * Month-to-date platform revenue by paying customer.
 * @param m { households, feesCollected, mealsSenior, mealsRegular, deliveries, groupBuyGMV, prices }
 */
export function revenue(m) {
  const mealSales = m.mealsSenior * m.prices.senior + m.mealsRegular * m.prices.regular;
  const rows = [
    { payer: 'Property company', item: 'Software subscription', base: `${m.households} households × $${PRICING.saasPerHousehold.toFixed(2)}`, amount: m.households * PRICING.saasPerHousehold },
    { payer: 'Property company', item: 'In-app fee collection', base: `${(PRICING.paymentRate * 100).toFixed(1)}% of $${Math.round(m.feesCollected).toLocaleString('en-US')}`, amount: m.feesCollected * PRICING.paymentRate },
    { payer: 'Residents', item: 'Canteen meals, gross margin', base: `${Math.round((1 - MEAL_COST_RATIO) * 100)}% of $${Math.round(mealSales).toLocaleString('en-US')}`, amount: mealSales * (1 - MEAL_COST_RATIO) },
    { payer: 'Residents', item: 'Lunch delivery', base: `${m.deliveries} × $${PRICING.delivery.toFixed(2)}`, amount: m.deliveries * PRICING.delivery },
    { payer: 'Merchants', item: 'Group-buy commission', base: `${(PRICING.commission * 100).toFixed(0)}% of $${Math.round(m.groupBuyGMV).toLocaleString('en-US')}`, amount: m.groupBuyGMV * PRICING.commission },
  ].map(x => ({ ...x, amount: r2(x.amount) }));
  const byPayer = {};
  rows.forEach(x => { byPayer[x.payer] = r2((byPayer[x.payer] || 0) + x.amount); });
  return { rows, byPayer, total: r2(rows.reduce((a, x) => a + x.amount, 0)), mealSales };
}
