// Wellbeing risk for older residents living at home.
// Explainable by design: every point in the score comes from a named signal with a sentence the
// care coordinator can read and check. The model only suggests who to check on; people decide.
import { mean } from '../lib/format.js';

export const THRESHOLD = { medium: 35, high: 60 };

/**
 * @param r resident record (see data.js)
 * @param ctx { mealPaused?: boolean, checkedInToday?: boolean }
 * @returns {{score:number, level:'low'|'medium'|'high', reasons:{signal:string,text:string,pts:number}[]}}
 */
export function assess(r, ctx = {}) {
  const reasons = [];
  const add = (signal, pts, text) => reasons.push({ signal, pts, text });
  const last = arr => arr[arr.length - 1];

  // 1. Meal routine: a subscribed lunch skipped without pausing the plan
  if (r.mealPlan && !ctx.mealPaused) {
    const missed = [...r.meals].reverse().findIndex(x => x === 1);
    const run = missed === -1 ? r.meals.length : missed;
    if (run >= 2) add('meals', 35, `Missed subscribed lunch ${run} days running, plan not paused`);
    else if (run === 1) add('meals', 10, 'Missed today’s subscribed lunch');
  }

  // 2. Door sensor: activity against the resident's own 12-day baseline
  if (r.door) {
    const base = mean(r.door.slice(0, -2));
    const today = last(r.door), recent = mean(r.door.slice(-2));
    if (today === 0 && base >= 3) add('door', 45, `No front-door activity today (usually ${base.toFixed(0)} a day)`);
    else if (recent < base * 0.45) add('door', 20, `Door activity down to ${recent.toFixed(1)} a day over 2 days (usually ${base.toFixed(0)})`);
  }

  // 3. Daily "I'm OK" check-in
  if (r.checkins) {
    const ci = ctx.checkedInToday ? [...r.checkins.slice(0, -1), 1] : r.checkins;
    const gap = [...ci].reverse().findIndex(x => x === 1);
    const days = gap === -1 ? ci.length : gap;
    if (days >= 2) add('checkin', Math.min(30, 15 + (days - 2) * 5), `No "I'm OK" check-in for ${days} days`);
  }

  // Context only matters once something is off
  if (reasons.length) {
    if (r.alone) add('context', 10, 'Lives alone');
    if (r.age >= 85) add('context', 5, `Age ${r.age}`);
  }

  const score = Math.min(100, reasons.reduce((a, x) => a + x.pts, 0));
  const level = score >= THRESHOLD.high ? 'high' : score >= THRESHOLD.medium ? 'medium' : 'low';
  return { score, level, reasons };
}

/** Everyone at or above the medium threshold, highest first, excluding dismissed. */
export function watchlist(residents, ctxFor, dismissed = {}) {
  return residents
    .map(r => ({ r, ...assess(r, ctxFor(r)) }))
    .filter(x => x.score >= THRESHOLD.medium && !dismissed[x.r.id])
    .sort((a, b) => b.score - a.score);
}
