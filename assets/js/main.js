// App shell and router. Each view exports render(root) and may return a cleanup function,
// which the router calls before the next view mounts (unsubscribes store listeners, stops speech).
import { $, $$, modal, toast } from './lib/ui.js';
import { ico } from './lib/icons.js';
import { esc } from './lib/format.js';
import { llm } from './lib/llm.js';
import { store, viewer, isOffline, goOffline, goOnline, simulateDeskChange, resolveConflict } from './state.js';
import { canSee, can, roleLabel } from './domain/org.js';

/** Sync conflicts go to the person whose device made the change, and to anyone who can assign work. */
const myConflicts = () => store.data.conflicts.map((c, i) => ({ c, i })).filter(({ c }) => can(viewer(), 'wo.assign') || c.ops[0].user === viewer().name);
import { startTour, tourSeen } from './lib/tour.js';
import { renderOverview } from './views/overview.js';
import { renderResident } from './views/resident.js';
import { renderOrders } from './views/orders.js';
import { renderFacilities } from './views/facilities.js';
import { renderOrg } from './views/org.js';
import { renderCare } from './views/care.js';
import { renderCanteen } from './views/canteen.js';
import { renderMarket } from './views/market.js';
import { renderRevenue } from './views/revenue.js';
import { renderEvaluation } from './views/evaluation.js';

const ROUTES = {
  overview: { title: 'Overview', group: 'Product', icon: 'sparkles', render: renderOverview },
  resident: { title: 'Resident app', group: 'Residents', icon: 'home', render: renderResident, badge: 'AI' },
  orders: { title: 'Work orders', group: 'Operations', icon: 'wrench', render: renderOrders, badge: 'AI' },
  evaluation: { title: 'Triage evaluation', group: 'Operations', icon: 'chart', render: renderEvaluation, badge: 'AI' },
  facilities: { title: 'Facilities', group: 'Operations', icon: 'bolt', render: renderFacilities, badge: 'AI' },
  care: { title: 'Care', group: 'Operations', icon: 'heart', render: renderCare, badge: 'AI' },
  canteen: { title: 'Canteen', group: 'Services', icon: 'utensils', render: renderCanteen },
  market: { title: 'Group buying', group: 'Services', icon: 'bag', render: renderMarket },
  revenue: { title: 'Revenue', group: 'Business', icon: 'chart', render: renderRevenue },
  org: { title: 'Organization', group: 'Business', icon: 'users', render: renderOrg },
};

const TOUR = [
  { title: 'Smart Community in one minute', body: 'One system for a property group and its aging neighborhoods: requests, repairs, facilities, care, a canteen and group buying. Fictional data, real algorithms. Six quick stops.' },
  { route: 'resident', sel: '#phoneScreen', title: 'Built for a 78-year-old', body: 'Mrs. Chen reports a problem in one sentence or by voice. AI works out what it is, how urgent, and who should fix it, then tells her in plain words what happens next.' },
  { route: 'orders', sel: '#list', title: 'Every request becomes a work order', body: 'Each order shows the AI’s category and the cues behind it, a response deadline, escalation when it runs late, and corrections that measure how good the triage really is.' },
  { route: 'facilities', sel: '#kpis', title: 'Fix things before residents notice', body: 'Every light, door reader and elevator door has a predicted chance of failing and a best replacement date, from a usage-based life model with a cost check.' },
  { sel: '#netBtn', title: 'Works offline', body: 'Click <b>Online</b> to cut the connection. Staff keep working; changes sync on reconnect, and real clashes go to a person to decide.' },
  { sel: '#viewerSel', title: 'Same product, every role', body: 'Switch between a group admin, a property manager, a technician or a household head. Access is delegated level by level, and every grant is logged.' },
  { sel: '#tourBtn', title: 'That’s the tour', body: 'Replay it any time from here. <b>Settings → Reset demo</b> starts everything fresh.' },
];

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
  ['Management', ['u0', 'u1', 'u2']], ['Departments', ['u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u10', 'u11']], ['Households', ['u12', 'u14', 'u17']],
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
      <header class="topbar"><button class="btn icon ghost menu-btn" id="menuBtn" aria-label="Open navigation">${ico('menu')}</button><h1 id="pageTitle"></h1><span class="badge amber">Demo data</span><span class="spacer"></span><span id="netBox"></span><span id="viewerBox"></span><button class="btn ghost sm" id="tourBtn" aria-label="Take the tour">${ico('sparkles')}<span class="hide-sm">Tour</span></button><button class="btn secondary sm" id="settingsBtn" aria-label="Settings">${ico('settings')}<span class="hide-sm">Settings</span></button></header>
      <div id="netBanner"></div>
      <main class="content" id="content" tabindex="-1"></main>
    </div>
  </div>`;
  $('#menuBtn').onclick = () => $('#app').classList.add('nav-open');
  $('#scrim').onclick = () => $('#app').classList.remove('nav-open');
  $('#settingsBtn').onclick = openSettings;
  $('#tourBtn').onclick = () => startTour(TOUR);
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

// ------------------------------------------------------------------ offline
function paintNet() {
  const s = store.data, off = s.offline;
  $('#netBox').innerHTML = `<button class="net ${off ? 'off' : 'on'}" id="netBtn" title="${off ? 'Reconnect and sync' : 'Simulate losing the connection'}"><i></i>${off ? `Offline${off.outbox.length ? ` · ${off.outbox.length} queued` : ''}` : 'Online'}</button>`;
  const b = $('#netBanner');
  if (off) {
    b.innerHTML = `<div class="net-banner off">${ico('clock')}<div><b>Offline since ${off.since}.</b> Everything still works: changes are saved on this device${off.outbox.length ? ` (${off.outbox.length} waiting)` : ''} and sync when you reconnect. Payments and live AI pause until then.</div>
      <div class="row wrap" style="gap:8px">${off.outbox.length ? `<button class="btn secondary sm" id="deskChange">${ico('users')}Meanwhile, the desk changes something</button>` : ''}${off.reason === 'network' ? '<span class="small">Waiting for the network…</span>' : `<button class="btn primary sm" id="reconnect">${ico('refresh')}Reconnect and sync</button>`}</div></div>`;
  } else if (myConflicts().length) {
    const k = myConflicts().length;
    b.innerHTML = `<div class="net-banner warn">${ico('alert')}<div><b>${k} offline change${k > 1 ? 's need' : ' needs'} review.</b> They clashed with changes made at the desk while the device was offline.</div><button class="btn primary sm" id="review">Review</button></div>`;
  } else b.innerHTML = '';
}

function syncReport(r) {
  const n = r.applied.length + r.merged.length;
  modal('Back online', `<div class="stack" style="gap:12px">
    <div class="grid cols-3"><div class="mini"><span>Synced as is</span><b>${r.applied.length}</b></div><div class="mini"><span>Merged with desk changes</span><b>${r.merged.length}</b></div><div class="mini"><span>Need review</span><b>${r.conflicts.length}</b></div></div>
    <p class="small muted" style="margin:0">${n ? `${n} change${n > 1 ? 's' : ''} made offline ${n > 1 ? 'are' : 'is'} now on the server.` : 'Nothing was waiting.'}${r.skipped.length ? ` ${r.skipped.length} already applied or no longer needed.` : ''}</p>
    ${r.conflicts.length && myConflicts().length ? '<button class="btn primary" id="toReview">Review conflicts</button>' : r.conflicts.length ? `<p class="small" style="margin:0">${r.conflicts.length} change${r.conflicts.length > 1 ? 's were' : ' was'} sent to ${esc(r.conflicts[0].ops[0].user)} and the department lead to review.</p><button class="btn primary" data-close>Done</button>` : '<button class="btn primary" data-close>Done</button>'}</div>`, {
    width: 520, onMount(m, close) { const t = $('#toReview', m); if (t) t.onclick = () => { close(); reviewConflicts(); }; },
  });
}

function reviewConflicts() {
  const draw = m => {
    const cs = myConflicts();
    if (!cs.length) { m.closest('.modal-back').remove(); toast('All offline changes resolved'); return; }
    $('.modal-b', m).innerHTML = `<div class="stack" style="gap:12px">${cs.map(({ c, i }) => { const o = store.data.orders.find(x => x.id === c.orderId);
      return `<div class="conflict"><div class="small"><b>${c.orderId.toUpperCase()}</b>${o ? `: ${esc(o.text.slice(0, 70))}` : ''}</div>
        <div class="small" style="color:var(--rose-ink)">${esc(c.reason)}</div>
        <div class="tiny muted">Offline on ${esc(c.ops[0].device)}: ${c.ops.map(op => `${op.action}${op.args.note ? ` (“${esc(op.args.note)}”)` : ''} at ${op.t}`).join(', ')}</div>
        <div class="row wrap" style="gap:8px;margin-top:8px"><button class="btn primary sm" data-res="${i}" data-c="mine">Apply the offline change</button><button class="btn secondary sm" data-res="${i}" data-c="server">Keep the desk’s version</button></div></div>`; }).join('')}
      <p class="tiny muted" style="margin:0">Either way, the decision is written to the order’s history, so nothing is lost silently.</p></div>`;
  };
  modal('Review offline changes', '', { width: 560, onMount(m) { draw(m); m.addEventListener('click', e => { const b = e.target.closest('[data-res]'); if (!b) return; resolveConflict(+b.dataset.res, b.dataset.c); draw(m); }); } });
}

function wireNet() {
  document.addEventListener('click', e => {
    const id = e.target.closest('button')?.id;
    if ((id === 'netBtn' || id === 'reconnect') && isOffline() && navigator.onLine === false) return toast('Still no network on this device. Your changes are safe here.', 'clock');
    if (id === 'netBtn') { if (isOffline()) { const r = goOnline(); if (r) syncReport(r); } else { goOffline('manual'); toast('Offline mode: you can keep working. Changes sync when you reconnect.', 'clock'); } }
    if (id === 'reconnect') { const r = goOnline(); if (r) syncReport(r); }
    if (id === 'deskChange') { const t = simulateDeskChange(); toast(t ? `At the desk: ${t}` : 'Nothing to change at the desk', 'users'); }
    if (id === 'review') reviewConflicts();
  });
  window.addEventListener('offline', () => { goOffline('network'); toast('Connection lost. You can keep working; changes are saved on this device.', 'clock'); });
  window.addEventListener('online', () => { const r = goOnline(); if (r) syncReport(r); });
  if (navigator.onLine === false) goOffline('network');
  store.onChange(paintNet);
  paintNet();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
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
wireNet();
window.addEventListener('hashchange', route);
route();
if (!tourSeen() && !/[?&]tour=0\b/.test(location.search)) setTimeout(() => startTour(TOUR), 500);
