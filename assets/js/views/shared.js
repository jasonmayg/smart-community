// Small view helpers used by more than one page.
import { esc, cap } from '../lib/format.js';
import { ico } from '../lib/icons.js';
import { DEAL_ART } from '../domain/data.js';

/** Highlight the words that drove a triage decision. */
export function highlight(text, cues = []) {
  let out = esc(text);
  [...cues].sort((a, b) => b.length - a.length).forEach(c => {
    const re = new RegExp('\\b(' + c.replace(/[-'\s]/g, m => (m === ' ' ? '\\s+' : '\\' + m)) + ')\\b', 'gi');
    out = out.replace(re, '<mark class="cue">$1</mark>');
  });
  return out;
}

export const urgencyPill = u => `<span class="pill ${u}">${cap(u)}</span>`;

export const kpi = (icon, label, value, delta = '') =>
  `<div class="card kpi"><div class="label">${ico(icon)}${label}</div><div class="value">${value}</div>${delta ? `<div class="delta">${delta}</div>` : ''}</div>`;

export function feed(items, empty) {
  if (!items.length) return `<div class="card empty">${empty}</div>`;
  return `<div class="activity">${items.map(e => `<div class="ev"><div class="icon-tile">${ico(e.icon)}</div><div><time>${e.t}</time><div>${e.html}</div></div></div>`).join('')}</div>`;
}

/** Simple product illustration for a group-buy item. */
export function dealArt(kind, cls = 'deal-art') {
  const [bg, fg] = DEAL_ART[kind] || ['#E1E9F5', '#3B4BC8'];
  const shapes = {
    eggs: `<ellipse cx="24" cy="40" rx="9" ry="11" fill="#fff" stroke="${fg}" stroke-width="2"/><ellipse cx="40" cy="38" rx="9" ry="11" fill="#fff" stroke="${fg}" stroke-width="2"/><ellipse cx="32" cy="26" rx="9" ry="11" fill="#FFFDF6" stroke="${fg}" stroke-width="2"/>`,
    fish: `<path d="M12 32c8-11 26-13 36 0-10 13-28 11-36 0z" fill="${fg}"/><path d="M48 32l9-8v16z" fill="${fg}"/><circle cx="21" cy="30" r="2" fill="#fff"/>`,
    bread: `<path d="M12 36c0-10 9-16 20-16s20 6 20 16v10H12z" fill="${fg}"/><path d="M22 28l3 6m6-8 2 7m6-5 1 6" stroke="#F6E7CF" stroke-width="2" stroke-linecap="round"/>`,
    apples: `<circle cx="24" cy="38" r="10" fill="${fg}"/><circle cx="40" cy="38" r="10" fill="${fg}" opacity=".85"/><circle cx="32" cy="25" r="9" fill="${fg}" opacity=".7"/><path d="M32 16c1-3 3-5 6-5" stroke="#3B6E3B" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  };
  return `<svg class="${cls}" viewBox="0 0 64 64" style="background:${bg}" aria-hidden="true">${shapes[kind] || ''}</svg>`;
}

/** 14-day signal strip for one resident. */
export function signalStrip(r) {
  const cells = (arr, kind) => arr
    ? arr.map(v => kind === 'door'
      ? `<span class="c ${v === 0 ? 'miss' : 'on'}" style="opacity:${v === 0 ? 1 : Math.min(1, .25 + v / 8)}" title="${v} door openings"></span>`
      : `<span class="c ${v ? 'on' : (kind === 'meals' && !r.mealPlan ? '' : 'miss')}"></span>`).join('')
    : Array(14).fill('<span class="c na"></span>').join('');
  return `<div class="signals" aria-label="Last 14 days of signals">
    <div class="s"><span>Lunch</span>${cells(r.meals, 'meals')}</div>
    <div class="s"><span>Door</span>${cells(r.door, 'door')}</div>
    <div class="s"><span>I'm OK</span>${cells(r.checkins, 'ci')}</div></div>`;
}
