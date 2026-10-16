// Facility lifecycle: when each light, door reader, elevator door, pump and circuit will wear out,
// when to replace it, and how long a failure goes unnoticed.
//
// Method, per asset type:
//  • Life is a Weibull distribution over *usage* (hours on, or open/close cycles), so a stairwell
//    light that is on 6 h a day ages four times slower than a corridor light on 24 h.
//  • Probability of failing in the next 30 days is the conditional Weibull probability given its age.
//  • Planned replacement age T* minimizes long-run cost per unit of use:
//        C(T) = [Cp·R(T) + Cf·(1 − R(T))] / ∫₀ᵀ R(u) du        (classic age-replacement policy)
//    where Cp is a planned swap and Cf a failure (emergency call-out plus impact on residents).
//  • Connected assets report a health signal. A recent shift against the asset's own baseline
//    (z-score of the last 7 days vs the 23 before) raises the failure probability and says why.
//  • Detection time: connected assets raise an alert within minutes; others wait for a resident to
//    notice, which depends on how busy the location is.
import { rng, gauss, mean } from '../lib/format.js';

export const TYPES = {
  light: { label: 'Corridor light', unit: 'h', beta: 3.0, eta: 60000, cp: 45, cf: 75, signal: 'Driver current drift', signalUnit: '%', baseline: 0, part: 'LED fixture' },
  stairlight: { label: 'Stairwell light', unit: 'h', beta: 3.0, eta: 60000, cp: 45, cf: 95, signal: 'Driver current drift', signalUnit: '%', baseline: 0, part: 'LED fixture' },
  door: { label: 'Entrance door reader', unit: 'cycles', beta: 2.4, eta: 1400000, cp: 260, cf: 900, signal: 'Failed card reads', signalUnit: '%', baseline: 1.2, part: 'Card reader + strike' },
  elevator: { label: 'Elevator door operator', unit: 'cycles', beta: 2.6, eta: 2600000, cp: 1800, cf: 6500, signal: 'Door close time', signalUnit: 's', baseline: 3.1, part: 'Door operator' },
  pump: { label: 'Water booster pump', unit: 'h', beta: 2.8, eta: 45000, cp: 2400, cf: 9000, signal: 'Vibration', signalUnit: 'mm/s', baseline: 2.0, part: 'Pump set' },
  circuit: { label: 'Lighting circuit', unit: 'years', beta: 4.0, eta: 32, cp: 900, cf: 2600, signal: 'Leakage current', signalUnit: 'mA', baseline: 4, part: 'Breaker + wiring check' },
};

// Hours until a failure is noticed when nobody is watching a sensor, by location traffic.
export const DETECT = { connected: 0.1, high: 6, medium: 20, low: 60 };
export const PLAN_SETUP = 60; // fixed cost per maintenance visit (travel, lift access, sign-off)

// ------------------------------------------------------------------ Weibull math
export const R = (t, b, e) => Math.exp(-Math.pow(Math.max(t, 0) / e, b));
/** P(fail within the next d units | survived to t). */
export const pFail = (t, d, b, e) => 1 - R(t + d, b, e) / R(t, b, e);
/** Median remaining life given survival to t. */
export const medianResidual = (t, b, e) => e * Math.pow(Math.pow(t / e, b) + Math.LN2, 1 / b) - t;

/** Optimal age-replacement interval T* (same unit as eta). Returns {T, costRate, curve}. */
export function optimalReplacement(b, e, cp, cf) {
  const N = 240, max = 2.5 * e, dt = max / N;
  let integral = 0, prevR = 1, best = null; const curve = [];
  for (let i = 1; i <= N; i++) {
    const T = i * dt, r = R(T, b, e);
    integral += (prevR + r) / 2 * dt; prevR = r;
    const c = (cp * r + cf * (1 - r)) / integral;
    curve.push([T, c]);
    if (!best || c < best.costRate) best = { T, costRate: c };
  }
  const runToFail = cf / (e * gammaFn(1 + 1 / b)); // cost rate with no planned replacement
  const saving = 1 - best.costRate / runToFail;
  // When planned replacement saves little, the better policy is to run to failure and watch.
  return { ...best, runToFail, saving, policy: saving >= 0.1 ? 'planned' : 'run-to-failure', curve };
}
function gammaFn(z) { // Lanczos approximation
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5; return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/** Shift in an asset's health signal: last 7 days vs the 23 before. */
export function drift(series) {
  if (!series || series.length < 14) return { z: 0, recent: null, base: null };
  const base = series.slice(0, -7), recent = series.slice(-7);
  const m = mean(base), sd = Math.sqrt(mean(base.map(v => (v - m) ** 2))) || 0.01;
  const z = (mean(recent) - m) / sd;
  return { z, recent: mean(recent), base: m };
}

// ------------------------------------------------------------------ registry
const DAY = 86400000;
/**
 * Build the Maple Court registry. Ages and signals are simulated with a fixed seed; a few assets carry
 * fixed stories so the demo always shows the same cases.
 */
export function buildRegistry(today = new Date('2026-10-16')) {
  const r = rng(77), list = [];
  const bldgs = ['A', 'B', 'C', 'D', 'E', 'F'];
  const connected = b => b === 'C' || b === 'D'; // retrofitted with smart lighting drivers and breakers
  const add = (a) => {
    const T = TYPES[a.type];
    const series = a.connected ? Array.from({ length: 30 }, () => Math.max(0, T.baseline + gauss(r) * (T.baseline * 0.12 + 0.3))) : null;
    list.push({ ...a, series });
  };
  const ago = years => new Date(today.getTime() - years * 365 * DAY);
  for (const b of bldgs) {
    const lightAge = 2 + r() * 4.5; // building-wide fit-out year
    for (let f = 1; f <= 6; f++) {
      for (let k = 1; k <= 2; k++) add({ id: `${b}-${f}-L${k}`, type: 'light', building: b, floor: f, where: `Floor ${f} corridor, light ${k}`, installed: ago(Math.max(0.3, lightAge + (r() - 0.5) * 0.6)), use: 24, traffic: 'high', connected: connected(b) });
      add({ id: `${b}-${f}-S`, type: 'stairlight', building: b, floor: f, where: `Floor ${f} stairwell`, installed: ago(lightAge), use: 6 + r() * 3, traffic: 'low', connected: connected(b) });
    }
    add({ id: `${b}-DOOR`, type: 'door', building: b, floor: 0, where: 'Main entrance', installed: ago(0.6 + r() * 3), use: 450 + r() * 500, traffic: 'high', connected: true });
    add({ id: `${b}-ELV`, type: 'elevator', building: b, floor: 0, where: 'Elevator door', installed: ago(0.8 + r() * 2.5), use: 900 + r() * 900, traffic: 'high', connected: true });
    add({ id: `${b}-CIR`, type: 'circuit', building: b, floor: 0, where: 'Common-area lighting circuit', installed: ago(8 + r() * 18), use: 1, traffic: 'medium', connected: connected(b) });
  }
  add({ id: 'P-1', type: 'pump', building: 'B', floor: -1, where: 'Basement pump room, pump 1', installed: ago(3.1), use: 11, traffic: 'low', connected: true });
  add({ id: 'P-2', type: 'pump', building: 'B', floor: -1, where: 'Basement pump room, pump 2', installed: ago(1.4), use: 9, traffic: 'low', connected: true });
  add({ id: 'G-GATE', type: 'door', building: 'A', floor: -1, where: 'Garage gate reader', installed: ago(2.7), use: 700, traffic: 'medium', connected: true });

  const fix = (id, patch) => Object.assign(list.find(x => x.id === id), patch);
  // Mr. Brennan's hallway light: failed, not connected, found by a resident a day later.
  fix('A-4-L2', { installed: ago(6.1), failed: { hoursAgo: 75, detectedAfterH: 26, by: 'Resident report (phone)' } });
  // Building C entrance reader: failed reads climbing.
  const c = list.find(x => x.id === 'C-DOOR'); c.installed = ago(2.4);
  c.series = c.series.map((v, i) => (i < 23 ? v : v + 1.2 + (i - 23) * 0.75));
  // Building D elevator door: old and slowing.
  const d = list.find(x => x.id === 'D-ELV'); d.installed = ago(3.4); d.use = 1650;
  d.series = d.series.map((v, i) => (i < 23 ? v : v + 0.25 + (i - 23) * 0.06));
  // Pump 1 vibration slightly up, but within noise.
  const p = list.find(x => x.id === 'P-1'); p.series = p.series.map((v, i) => (i < 25 ? v : v + 0.15));
  // Building D lighting circuit: leakage rising (connected building).
  const k = list.find(x => x.id === 'D-CIR'); k.installed = ago(24);
  k.series = k.series.map((v, i) => (i < 23 ? v : v + 2.5 + (i - 23) * 1.1));
  return list;
}

/** Everything the UI needs about one asset. */
export function assess(a, today = new Date('2026-10-16')) {
  const T = TYPES[a.type];
  const days = (today - a.installed) / DAY;
  const perDay = T.unit === 'years' ? 1 / 365 : a.use; // usage units per day
  const age = days * perDay;
  const horizon = 30 * perDay;
  const dr = a.series ? drift(a.series) : { z: 0 };
  let p30 = pFail(age, horizon, T.beta, T.eta);
  const reasons = [];
  // Condition adjustment: a clear shift multiplies the hazard, explained in words.
  const k = dr.z > 3 ? 1 + (dr.z - 3) * 0.8 : 1;
  if (k > 1) { p30 = 1 - Math.pow(1 - p30, k); reasons.push(`${T.signal} ${dr.recent.toFixed(1)} ${T.signalUnit} this week vs ${dr.base.toFixed(1)} usual (${dr.z.toFixed(1)}σ)`); }
  const opt = optimalReplacement(T.beta, T.eta, T.cp, T.cf);
  const planned = opt.policy === 'planned';
  const dueInDays = planned ? (opt.T - age) / perDay : Infinity;
  const lifeUsed = planned ? age / opt.T : age / T.eta;
  const remainingDays = medianResidual(age, T.beta, T.eta) / perDay / Math.max(1, k);
  if (planned && lifeUsed >= 1) reasons.push(`Past its planned replacement age (${fmtUse(opt.T, T)})`);
  else if (dueInDays < 90) reasons.push(`Planned replacement in ${Math.max(0, Math.round(dueInDays))} days`);
  const detectH = a.connected ? DETECT.connected : DETECT[a.traffic];
  if (!planned && p30 >= 0.03) reasons.push(`${(p30 * 100).toFixed(1)}% chance of failing in 30 days; for this type, running to failure costs less than early replacement`);
  if (dr.z > 6) reasons.push('Health signal has shifted sharply: inspect now');
  const status = a.failed ? 'failed' : (p30 >= 0.15 || dr.z > 6 || (planned && lifeUsed >= 1)) ? 'replace' : (p30 >= 0.03 || dr.z > 3 || dueInDays < 90) ? 'watch' : 'ok';
  return {
    age, perDay, days, p30, k, drift: dr,
    /** Failure probability over any horizon (days), with the same condition adjustment as p30. */
    pIn: d => 1 - Math.pow(1 - pFail(age, d * perDay, T.beta, T.eta), k), opt, dueInDays, lifeUsed, remainingDays, reasons, detectH, status,
    replaceBy: planned ? new Date(today.getTime() + Math.max(0, dueInDays) * DAY) : null,
    expectedLossNoAction: p30 * (T.cf - T.cp), // extra cost of waiting a month vs replacing now
  };
}

export function fmtUse(v, T) {
  if (T.unit === 'years') return `${v.toFixed(0)} years`;
  if (T.unit === 'cycles') return `${Math.round(v / 1000).toLocaleString('en-US')}k cycles`;
  return `${Math.round(v / 1000).toLocaleString('en-US')}k hours`;
}

/** Group replacements due in the next `days` into visits by building, to share the setup cost. */
export function batchPlan(items, days = 90, today = new Date('2026-10-16')) {
  const due = items.filter(x => x.st.status !== 'failed' && (x.st.status === 'replace' || x.st.dueInDays <= days || x.st.p30 >= 0.15));
  const byB = {};
  due.forEach(x => (byB[x.a.building] ||= []).push(x));
  return Object.entries(byB).map(([b, xs]) => {
    const parts = {};
    xs.forEach(x => { const p = TYPES[x.a.type].part; parts[p] = (parts[p] || 0) + 1; });
    const when = new Date(Math.max(today.getTime(), Math.min(...xs.map(x => (x.st.replaceBy || today).getTime()))));
    return { building: b, items: xs, parts, when, cost: xs.reduce((s, x) => s + TYPES[x.a.type].cp, 0) + PLAN_SETUP, saved: PLAN_SETUP * (xs.length - 1) };
  }).sort((a, b) => a.when - b.when);
}

/**
 * Match a resident's words to the asset they are probably talking about.
 * Uses building and floor from the text or from where the resident lives, plus type words.
 */
const TYPE_WORDS = { light: ['light', 'lights', 'lamp', 'bulb', 'hallway', 'corridor', 'dark'], stairlight: ['stair', 'stairs', 'stairwell'], door: ['door', 'entrance', 'card', 'fob', 'reader', 'gate', 'lock'], elevator: ['elevator', 'lift'], pump: ['water pressure', 'no water', 'pump'], circuit: ['power', 'outlet', 'breaker', 'flicker', 'flickering'] };
export function matchAsset(text, registry, home = {}) {
  const t = ' ' + String(text).toLowerCase() + ' ';
  const b = (t.match(/building\s+([a-f])\b/) || [])[1]?.toUpperCase() || home.building;
  const fl = +((t.match(/floor\s+(\d)/) || t.match(/(\d)(?:st|nd|rd|th)\s+floor/) || [])[1] || home.floor || 0);
  let type = null;
  for (const [k, ws] of Object.entries(TYPE_WORDS)) if (ws.some(w => t.includes(w))) { type = k; if (k === 'stairlight') break; }
  if (type === 'light' && /stair/.test(t)) type = 'stairlight';
  if (!type) return null;
  const cands = registry.filter(a => a.type === type && (!b || a.building === b) && (type === 'light' || type === 'stairlight' ? (!fl || a.floor === fl) : true));
  if (!cands.length) return null;
  // Prefer an asset already failed or at risk: that is most likely what they saw.
  const ranked = cands.map(a => ({ a, s: (a.failed ? 2 : 0) + (assess(a).p30) })).sort((x, y) => y.s - x.s);
  const conf = Math.min(0.95, 0.35 + (b ? 0.25 : 0) + (fl ? 0.2 : 0) + (cands.length === 1 ? 0.15 : 0));
  return { asset: ranked[0].a, conf, candidates: cands.length, why: [b && `building ${b}`, fl && `floor ${fl}`, TYPES[type].label.toLowerCase()].filter(Boolean) };
}
