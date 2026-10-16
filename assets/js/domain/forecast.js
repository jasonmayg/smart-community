// Demand forecasts: canteen walk-ins and group-buy final orders.
import { mean, sum } from '../lib/format.js';

const weighted = arr => { const w = arr.map((_, i) => i + 1); return sum(arr.map((v, i) => v * w[i])) / sum(w); };

/**
 * Walk-in lunches for a weekday: recency-weighted same-weekday average × weather factor.
 * The 80% range comes from back-testing the same method on the history.
 * @param hist  daily walk-ins, Mon-first weeks, 0 = closed
 * @param wd    0 = Monday … 4 = Friday
 */
export function walkins(hist, wd, weather) {
  const same = hist.filter((v, i) => i % 7 === wd && v > 0);
  if (!same.length) return null;
  const base = weighted(same);
  const errs = [];
  for (let k = 1; k < same.length; k++) errs.push(same[k] - weighted(same.slice(0, k)));
  const sd = Math.max(2, Math.sqrt(mean(errs.map(e => e * e))));
  const f = base * weather.walk;
  return { base, f, lo: f - 1.28 * sd, hi: f + 1.28 * sd, sd, weeks: same.length };
}

/** Share of a group buy's final orders typically in by fraction x of the window (front-loaded). */
export const paceCurve = x => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 1.6);

const normCdf = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };

/**
 * Final orders for a group buy still open.
 * Blends the current pace (orders so far ÷ expected share by now) with the item's weekly history,
 * trusting pace more as the window closes. Recommends stock at the 70th percentile.
 */
export function groupBuy(deal) {
  const x = deal.elapsedH / deal.windowH;
  const histMean = weighted(deal.history);
  const histSd = Math.sqrt(mean(deal.history.map(v => (v - mean(deal.history)) ** 2)));
  const share = paceCurve(x);
  const pace = share > 0.02 ? deal.sold / share : histMean;
  const w = Math.min(0.9, x);
  const f = Math.max(deal.sold, w * pace + (1 - w) * histMean);
  const sd = Math.max(1.5, histSd * Math.sqrt(1 - x) + Math.abs(pace - histMean) * 0.15);
  const pMin = 1 - normCdf((deal.minGroup - f) / sd);
  return {
    f, lo: Math.max(deal.sold, f - 1.28 * sd), hi: f + 1.28 * sd, sd, pace, histMean, share, w,
    stock: Math.ceil(f + 0.52 * sd),
    pReachMin: deal.sold >= deal.minGroup ? 1 : pMin,
    hoursLeft: deal.windowH - deal.elapsedH,
  };
}
