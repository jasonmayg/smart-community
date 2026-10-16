// Pure helpers. No DOM access, so domain modules and tests can import them in Node.

export const money = n => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const int = n => Math.round(n).toLocaleString('en-US');
export const pct = (n, d = 0) => (n * 100).toFixed(d) + '%';
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = arr => arr.reduce((a, b) => a + b, 0);
export const mean = arr => (arr.length ? sum(arr) / arr.length : 0);
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const timeNow = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** Deterministic PRNG (mulberry32) so the simulated community looks the same on every load. */
export function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Standard normal sample from a uniform PRNG (Box–Muller). */
export function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
