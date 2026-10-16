// App shell and router. Each view exports render(root) and may return a cleanup function,
// which the router calls before the next view mounts (unsubscribes store listeners, stops speech).
import { $, $$, modal, toast } from './lib/ui.js';
import { ico } from './lib/icons.js';
import { esc } from './lib/format.js';
import { llm } from './lib/llm.js';
import { store, viewer } from './state.js';
import { canSee, can, roleLabel } from './domain/org.js';
import { renderOverview } from './views/overview.js';
import { renderResident } from './views/resident.js';
import { renderOrders } from './views/orders.js';
import { renderFacilities } from './views/facilities.js';
import { renderOrg } from './views/org.js';
import { renderCare } from './views/care.js';
import { renderCanteen } from './views/canteen.js';
import { renderMarket } from './views/market.js';
import { renderRevenue } from './views/revenue.js';

const ROUTES = {
  overview: { title: 'Overview', group: 'Product', icon: 'sparkles', render: renderOverview },
  resident: { title: 'Resident app', group: 'Residents', icon: 'home', render: renderResident, badge: 'AI' },
  orders: { title: 'Work orders', group: 'Operations', icon: 'wrench', render: renderOrders, badge: 'AI' },
  facilities: { title: 'Facilities', group: 'Operations', icon: 'bolt', render: renderFacilities, badge: 'AI' },
  care: { title: 'Care', group: 'Operations', icon: 'heart', render: renderCare, badge: 'AI' },
  canteen: { title: 'Canteen', group: 'Services', icon: 'utensils', render: renderCanteen },
  market: { title: 'Group buying', group: 'Services', icon: 'bag', render: renderMarket },
  revenue: { title: 'Revenue', group: 'Business', icon: 'chart', render: renderRevenue },
  org: { title: 'Organization', group: 'Business', icon: 'users', render: renderOrg },
};

function openSettings() {
  modal('Settings', `
    <div class="stack">
      <div><div class="strong">Live AI (optional)</div>
        <p class="small muted" style="margin:4px 0 10px">Everything works offline. With an Anthropic API key, the assistant and request triage use Claude instead. The key stays in this tab’s memory, is sent only to the model provider, and is gone when you close the tab.</p>
        <label class="field">API key<input class="input" id="apiKey" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(llm.apiKey)}"></label>
        <label class="field" style="margin-top:10px">Model<input class="input" id="model" value="${esc(llm.model)}"></label></div>
      <div class="row"><button class="btn primary" id="saveKey">Save</button>${llm.apiKey ? '<button class="btn ghost" id="clearKey">Remove key</button>' : ''}</div>
      <div class="divider"></div>
      <div><div class="strong">Demo data</div><p class="small muted" style="margin:4px 0 10px">Orders, payments and requests are saved in this browser.</p>
        <button class="btn secondary" id="resetDemo">${ico('refresh')}Reset demo</button></div>
    </div>`, {
    width: 480,
    onMount(m, close) {
      $('#saveKey', m).onclick = () => { llm.apiKey = $('#apiKey', m).value.trim(); llm.model = $('#model', m).value.trim() || llm.model; close(); toast(llm.apiKey ? 'Live AI on for this tab' : 'Settings saved'); route(); };
      const c = $('#clearKey', m); if (c) c.onclick = () => { llm.apiKey = ''; close(); toast('Key removed'); route(); };
      $('#resetDemo', m).onclick = () => { store.reset(); close(); toast('Demo reset'); route(); };
    },
  });
}

/** Page visibility for the current viewer. The resident app shows Mrs. Chen's phone, so it is open
 *  to her household and, as a preview, to property management. */
function allowed(u, key) {
  if (key === 'resident') return can(u, 'resident.preview') || (can(u, 'resident.app') && u.scope.household === 'h1');
  return canSee(u, key);
}
const homeRoute = u => ['overview', 'orders', 'resident', 'org'].find(k => k !== 'overview' && allowed(u, k) && (k !== 'orders' || !u.scope.household)) || 'overview';

const VIEWERS = [
  ['Management', ['u0', 'u1', 'u2']], ['Departments', ['u3', 'u4', 'u5', 'u6', 'u8', 'u10', 'u11']], ['Households', ['u12', 'u14', 'u17']],
];
function viewerSelect() {
  const users = store.data.users, me = viewer();
  return `<label class="viewer"><span>${ico('user')}Viewing as</span><select id="viewerSel" aria-label="Viewing as">${VIEWERS.map(([g, ids]) => `<optgroup label="${g}">${ids.map(id => users.find(u => u.id === id)).filter(Boolean).map(u => `<option value="${u.id}" ${u.id === me.id ? 'selected' : ''}>${esc(u.name)}, ${esc(roleLabel(u))}</option>`).join('')}</optgroup>`).join('')}
    ${VIEWERS.flatMap(v => v[1]).includes(me.id) ? '' : `<option value="${me.id}" selected>${esc(me.name)}, ${esc(roleLabel(me))}</option>`}</select></label>`;
}

function shell() {
  const groups = {};
  Object.entries(ROUTES).forEach(([k, r]) => (groups[r.group] ||= []).push([k, r]));
  document.body.innerHTML = `
  <div class="app" id="app">
    <aside class="sidebar" aria-label="Main navigation">
      <div class="logo"><svg width="28" height="26" viewBox="0 0 28 26" aria-hidden="true"><path d="M2 12 L14 2 L26 12 V24 H2 Z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><rect x="11" y="15" width="6" height="9" rx="1" fill="#F2BE45"/></svg>Smart Community</div>
      ${Object.entries(groups).map(([g, rs]) => `<nav class="nav nav-group" data-group="${g}" aria-label="${g}"><div class="nav-label">${g}</div>${rs.map(([k, r]) => `<a href="#/${k}" data-route="${k}">${ico(r.icon)}${r.title}${r.badge ? `<span class="badge dark">${r.badge}</span>` : ''}</a>`).join('')}</nav>`).join('')}
      <div class="sidebar-foot">Portfolio prototype by Jason Geng. Fictional data, real algorithms. <a href="https://github.com/jasonmayg/smart-community">Source and PRD</a></div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main">
      <header class="topbar"><button class="btn icon ghost menu-btn" id="menuBtn" aria-label="Open navigation">${ico('menu')}</button><h1 id="pageTitle"></h1><span class="badge amber">Demo data</span><span class="spacer"></span><span id="viewerBox"></span><button class="btn secondary sm" id="settingsBtn" aria-label="Settings">${ico('settings')}<span class="hide-sm">Settings</span></button></header>
      <main class="content" id="content" tabindex="-1"></main>
    </div>
  </div>`;
  $('#menuBtn').onclick = () => $('#app').classList.add('nav-open');
  $('#scrim').onclick = () => $('#app').classList.remove('nav-open');
  $('#settingsBtn').onclick = openSettings;
  $('#viewerBox').onchange = e => {
    if (e.target.id !== 'viewerSel') return;
    store.update(s => { s.viewer = e.target.value; });
    const u = viewer();
    toast(`Now viewing as ${u.name}, ${roleLabel(u)}`, 'user');
    const key = location.hash.replace(/^#\/?/, '').split('/')[0] || 'overview';
    if (!allowed(u, key)) location.hash = '#/' + homeRoute(u); else route();
  };
}

function paintNav(u) {
  $$('.nav a').forEach(a => { a.hidden = !allowed(u, a.dataset.route); });
  $$('.nav-group').forEach(g => { g.hidden = ![...g.querySelectorAll('a')].some(a => !a.hidden); });
  $('#viewerBox').innerHTML = viewerSelect();
}

function noAccess(c, u, r) {
  const ok = Object.keys(ROUTES).filter(k => allowed(u, k));
  c.innerHTML = `<div class="card" style="max-width:640px"><div class="card-b"><div class="row"><div class="icon-tile" style="background:var(--rose-soft);color:var(--rose)">${ico('lock')}</div><b>${esc(r.title)} isn’t available to ${esc(roleLabel(u))}</b></div>
    <p class="small muted">Access follows the organization: ${esc(u.name)} can open ${ok.map(k => `<a href="#/${k}">${ROUTES[k].title}</a>`).join(', ')}. Switch “Viewing as” at the top to see the product from another role.</p></div></div>`;
}

let cleanup = null;
function route() {
  const [key, sub] = location.hash.replace(/^#\/?/, '').split('/');
  const current = ROUTES[key] ? key : 'overview', r = ROUTES[current];
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  const u = viewer();
  paintNav(u);
  $$('.nav a').forEach(a => a.setAttribute('aria-current', a.dataset.route === current ? 'page' : 'false'));
  $('#pageTitle').textContent = r.title;
  document.title = `${r.title} | Smart Community`;
  const c = $('#content'); c.onclick = null; c.onchange = null; c.oninput = null; c.onsubmit = null; c.onkeydown = null;
  if (allowed(u, current)) cleanup = r.render(c, sub && decodeURIComponent(sub));
  else noAccess(c, u, r);
  $('#app').classList.remove('nav-open');
  window.scrollTo(0, 0);
}

shell();
window.addEventListener('hashchange', route);
route();
