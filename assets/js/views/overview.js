// Landing page: the product in one screen.
import { ico } from '../lib/icons.js';
import { int } from '../lib/format.js';
import { COMMUNITY } from '../domain/data.js';
import { currentWatchlist } from './care.js';
import { store, orders } from '../state.js';

const MODULES = [
  ['resident', 'home', 'Resident app', 'Lunch, repairs, “I’m OK”, bills, group buys and an assistant, built for a 78-year-old: big buttons, voice input, read-aloud.'],
  ['orders', 'wrench', 'Work orders', 'One queue from every channel. AI triage, a full lifecycle, resident expediting, escalation and corrections that measure the AI.'],
  ['facilities', 'bolt', 'Facilities', 'Every light, door reader, elevator door, pump and circuit: wear, failure risk, best replacement date and how fast a failure is noticed.'],
  ['care', 'heart', 'Care', 'Explainable risk flags from missed lunches, door sensors and check-ins. Volunteers, family, a person decides.'],
  ['canteen', 'utensils', 'Canteen', 'Plan subscribers plus a weather-aware walk-in forecast, and delivery routes by building.'],
  ['market', 'bag', 'Group buying', 'Weekly merchant deals with a forecast of final orders and stock advice.'],
  ['revenue', 'chart', 'Revenue', 'Property company, residents and merchants: what each pays and where every payment goes.'],
  ['org', 'users', 'Organization', 'Group, properties, departments and households. Everyone delegates access only below themselves.'],
];

export function renderOverview(el) {
  const s = store.data;
  const open = orders().filter(o => ['new', 'assigned', 'in_progress', 'on_hold'].includes(o.status)).length, flags = currentWatchlist().length;
  el.innerHTML = `
  <div class="h-page"><div><h2>One app for an aging neighborhood</h2><p>${COMMUNITY.name} has ${int(COMMUNITY.households)} households and ${COMMUNITY.over65} residents over 65. The property office, the community canteen, care volunteers and local merchants each used to run their own channel. Here they share one system, so a skipped lunch can start a wellbeing check and a sentence typed by a resident reaches the right person.</p></div></div>
  <div class="grid cols-3">
    ${MODULES.map(([k, i, t, d]) => `<a class="card" href="#/${k}" style="text-decoration:none;color:inherit"><div class="card-b"><div class="row"><div class="icon-tile">${ico(i)}</div><b style="font-size:16px">${t}</b><span style="margin-left:auto;color:var(--faint)">${ico('chevron')}</span></div><p class="small muted" style="margin:10px 0 0">${d}</p></div></a>`).join('')}
  </div>
  <div class="grid cols-2" style="margin-top:16px">
    <div class="card"><div class="card-h"><h2>Right now</h2><span class="sub">live from the demo</span></div><div class="card-b">
      <div class="list-item"><div class="icon-tile">${ico('wrench')}</div><div style="flex:1">Open work orders</div><b class="num">${open}</b></div>
      <div class="list-item"><div class="icon-tile" style="background:var(--rose-soft);color:var(--rose)">${ico('heart')}</div><div style="flex:1">Residents to check on today</div><b class="num">${flags}</b></div>
      <div class="list-item"><div class="icon-tile" style="background:var(--leaf-soft);color:var(--leaf)">${ico('check')}</div><div style="flex:1">Mrs. Chen checked in today</div><b>${s.checkedIn ? 'Yes' : 'Not yet'}</b></div>
    </div></div>
    <div class="card"><div class="card-h"><h2>Targets</h2><span class="sub">from the PRD, not measured results</span></div><div class="card-b">
      ${[['Flagged residents checked within 24 h', '> 95%'], ['Urgent requests answered', '< 4 h'], ['AI triage accepted without change', '> 85%'], ['Taps for an older resident to order lunch', '≤ 3'], ['Group-buy stock left over', '< 5%']].map(([a, b]) => `<div class="list-item"><div style="flex:1">${a}</div><b>${b}</b></div>`).join('')}
    </div></div>
  </div>
  <p class="demo-note">Suggested path: <a href="#/resident">Resident app</a> (report a problem, mark it urgent) → <a href="#/orders">Work orders</a> (assign, correct the AI) → <a href="#/facilities">Facilities</a> (what will fail next) → <a href="#/org">Organization</a>. Use “Viewing as” at the top to switch between a group admin, a technician and a household head. All people, places, merchants and figures are fictional. Triage, risk scores, forecasts and payment splits are real code running in your browser.</p>`;
}
