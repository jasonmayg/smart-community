// App shell and router. Each view exports render(root) and may return a cleanup function,
// which the router calls before the next view mounts (unsubscribes store listeners, stops speech).
import { $, $$, modal, toast } from './lib/ui.js';
import { ico } from './lib/icons.js';
import { esc } from './lib/format.js';
import { llm } from './lib/llm.js';
import { store } from './state.js';
import { renderOverview } from './views/overview.js';
import { renderResident } from './views/resident.js';
import { renderDesk } from './views/desk.js';
import { renderCare } from './views/care.js';
import { renderCanteen } from './views/canteen.js';
import { renderMarket } from './views/market.js';
import { renderRevenue } from './views/revenue.js';

const ROUTES = {
  overview: { title: 'Overview', group: 'Product', icon: 'sparkles', render: renderOverview },
  resident: { title: 'Resident app', group: 'Residents', icon: 'home', render: renderResident, badge: 'AI' },
  desk: { title: 'Property desk', group: 'Property company', icon: 'wrench', render: renderDesk, badge: 'AI' },
  care: { title: 'Care', group: 'Property company', icon: 'heart', render: renderCare, badge: 'AI' },
  canteen: { title: 'Canteen', group: 'Services', icon: 'utensils', render: renderCanteen },
  market: { title: 'Group buying', group: 'Services', icon: 'bag', render: renderMarket },
  revenue: { title: 'Revenue', group: 'Business', icon: 'chart', render: renderRevenue },
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

function shell() {
  const groups = {};
  Object.entries(ROUTES).forEach(([k, r]) => (groups[r.group] ||= []).push([k, r]));
  document.body.innerHTML = `
  <div class="app" id="app">
    <aside class="sidebar" aria-label="Main navigation">
      <div class="logo"><svg width="28" height="26" viewBox="0 0 28 26" aria-hidden="true"><path d="M2 12 L14 2 L26 12 V24 H2 Z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><rect x="11" y="15" width="6" height="9" rx="1" fill="#F2BE45"/></svg>Smart Community</div>
      ${Object.entries(groups).map(([g, rs]) => `<nav class="nav nav-group" aria-label="${g}"><div class="nav-label">${g}</div>${rs.map(([k, r]) => `<a href="#/${k}" data-route="${k}">${ico(r.icon)}${r.title}${r.badge ? `<span class="badge dark">${r.badge}</span>` : ''}</a>`).join('')}</nav>`).join('')}
      <div class="sidebar-foot">Portfolio prototype by Jason Geng. Fictional data, real algorithms. <a href="https://github.com/jasonmayg/smart-community">Source and PRD</a></div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main">
      <header class="topbar"><button class="btn icon ghost menu-btn" id="menuBtn" aria-label="Open navigation">${ico('menu')}</button><h1 id="pageTitle"></h1><span class="badge amber">Demo data</span><span class="spacer"></span><button class="btn secondary sm" id="settingsBtn">${ico('settings')}Settings</button></header>
      <main class="content" id="content" tabindex="-1"></main>
    </div>
  </div>`;
  $('#menuBtn').onclick = () => $('#app').classList.add('nav-open');
  $('#scrim').onclick = () => $('#app').classList.remove('nav-open');
  $('#settingsBtn').onclick = openSettings;
}

let cleanup = null;
function route() {
  const key = location.hash.replace(/^#\/?/, '').split('/')[0];
  const current = ROUTES[key] ? key : 'overview', r = ROUTES[current];
  if (typeof cleanup === 'function') cleanup();
  $$('.nav a').forEach(a => a.setAttribute('aria-current', a.dataset.route === current ? 'page' : 'false'));
  $('#pageTitle').textContent = r.title;
  document.title = `${r.title} | Smart Community`;
  const c = $('#content'); c.onclick = null; c.onchange = null;
  cleanup = r.render(c);
  $('#app').classList.remove('nav-open');
  window.scrollTo(0, 0);
}

shell();
window.addEventListener('hashchange', route);
route();
