// Organization and access: who manages what, and who can give access to whom.
import { $, toast } from '../lib/ui.js';
import { ico } from '../lib/icons.js';
import { esc, int, pct, money } from '../lib/format.js';
import { store, viewer, grant, revoke, updateUser, ASSET, REGISTRY, orders } from '../state.js';
import { GROUP, PROPERTIES, DEPARTMENTS, HOUSEHOLDS, ROLES, CAPABILITIES, permsOf, can, checkGrant, checkRevoke, contains, roleLabel, HOUSEHOLD_ROLES } from '../domain/org.js';
import { assess } from '../domain/assets.js';
import * as WO from '../domain/workorders.js';
import { FEE_COLLECTION } from '../domain/data.js';
import { kpi } from './shared.js';

let root, node = null;
const S = () => store.data;

// ------------------------------------------------------------------ nodes
const NODES = (() => {
  const n = { g1: { id: 'g1', kind: 'group', label: GROUP.name, scope: { group: 'g1' } } };
  PROPERTIES.forEach(p => { n[p.id] = { id: p.id, kind: 'property', label: p.name, scope: { group: 'g1', property: p.id } }; });
  Object.entries(DEPARTMENTS).forEach(([k, d]) => { n['p1:' + k] = { id: 'p1:' + k, kind: 'department', label: d.name, scope: { group: 'g1', property: 'p1', dept: k } }; });
  HOUSEHOLDS.forEach(h => { n[h.id] = { id: h.id, kind: 'household', label: `${h.name}, ${h.apt}`, scope: { group: 'g1', property: h.property, household: h.id } }; });
  return n;
})();
const exactly = (u, sc) => ['group', 'property', 'dept', 'household'].every(k => (u.scope[k] || null) === (sc[k] || null));
const membersAt = sc => S().users.filter(u => exactly(u, sc));
function homeNode(u) {
  if (u.scope.household) return u.scope.household;
  if (u.scope.dept) return `p1:${u.scope.dept}`;
  return u.scope.property || u.scope.group || 'g1';
}
const visible = (u, nd) => contains(u.scope, nd.scope) || contains(nd.scope, u.scope);

// ------------------------------------------------------------------ portfolio (group view)
function portfolio() {
  const s = S(), open = orders().filter(WO.isOpen);
  const live = { open: open.length, overdue: open.filter(o => WO.escalationLevel(o) > 0).length, fees: (FEE_COLLECTION.paidOnline + FEE_COLLECTION.paidDesk + (s.billPaid ? 1 : 0)) / FEE_COLLECTION.billed, atRisk: REGISTRY.filter(a => ['replace', 'failed'].includes(assess(a).status)).length, flags: 3 };
  return `<div class="grid cols-3">${PROPERTIES.map(p => { const k = p.live ? live : p.kpi; const pm = S().users.find(u => u.role === 'property_manager' && u.scope.property === p.id);
    return `<button class="card prop ${node === p.id ? 'on' : ''}" data-node="${p.id}"><div class="row"><div class="icon-tile">${ico('building')}</div><div style="text-align:left"><b>${p.name}</b><div class="tiny muted">${int(p.households)} households, ${p.buildings} buildings</div></div>${p.live ? '<span class="badge green" style="margin-left:auto">Live demo</span>' : ''}</div>
      <div class="facts" style="margin-top:12px"><div><span>Open orders</span><b>${k.open}</b></div><div><span>Overdue</span><b style="color:${k.overdue ? 'var(--rose)' : 'inherit'}">${k.overdue}</b></div><div><span>Fees collected</span><b>${pct(k.fees, 0)}</b></div><div><span>Assets to replace</span><b>${k.atRisk}</b></div></div>
      <div class="tiny muted" style="margin-top:8px;text-align:left">Manager: ${pm ? esc(pm.name) : '<span style="color:var(--rose)">vacant</span>'}</div></button>`; }).join('')}</div>`;
}

// ------------------------------------------------------------------ tree
function tree(u) {
  const item = (id, depth, extra = '') => {
    const nd = NODES[id]; if (!visible(u, nd)) return '';
    const n = S().users.filter(x => contains(nd.scope, x.scope)).length;
    const icon = { group: 'building', property: 'home', department: 'users', household: 'heart' }[nd.kind];
    return `<button class="tree-item ${node === id ? 'on' : ''}" data-node="${id}" style="padding-left:${10 + depth * 18}px">${ico(icon)}<span>${esc(nd.label)}</span><span class="count">${n}</span></button>${extra}`;
  };
  return item('g1', 0, PROPERTIES.map(p => item(p.id, 1, p.id === 'p1'
    ? `<div class="tree-label" style="padding-left:46px">Departments</div>${Object.keys(DEPARTMENTS).map(k => item('p1:' + k, 2)).join('')}<div class="tree-label" style="padding-left:46px">Households</div>${HOUSEHOLDS.map(h => item(h.id, 2)).join('')}`
    : '')).join(''));
}

// ------------------------------------------------------------------ node panel
function panel(u) {
  const nd = NODES[node]; if (!nd) return '';
  const people = membersAt(nd.scope);
  const roles = Object.keys(ROLES).filter(r => checkGrant(u, r, nd.scope).ok);
  const isHH = nd.kind === 'household';
  return `<div class="row wrap"><h3 style="margin:0">${esc(nd.label)}</h3><span class="badge">${{ group: 'Group', property: 'Property', department: 'Department', household: 'Household' }[nd.kind]}</span></div>
    <div class="list" style="margin-top:8px">${people.length ? people.map(p => {
      const rv = checkRevoke(u, p);
      return `<div class="list-item"><div class="avatar">${esc(p.name.replace(/^(Mrs?\.|Ms\.) /, '').split(' ').map(w => w[0]).join('').slice(0, 2))}</div>
        <div style="flex:1;min-width:0"><b>${esc(p.name)}</b>${p.id === u.id ? ' <span class="badge blue">You</span>' : ''}<div class="tiny muted">${roleLabel(p)}${p.age ? `, ${p.age}` : ''}${p.note ? ` · ${esc(p.note)}` : ''}</div>
          ${isHH ? householdControls(u, p) : ''}</div>
        ${rv.ok ? `<button class="btn ghost sm" data-revoke="${p.id}" title="Remove access">${ico('x')}Remove</button>` : ''}</div>`; }).join('') : `<div class="empty small">No one at this level yet.</div>`}</div>
    ${roles.length ? `<form class="grant" id="grantForm">
      <div class="strong small" style="margin-bottom:8px">${isHH ? 'Add a family member' : 'Grant access here'}</div>
      <div class="row wrap" style="gap:8px"><input class="input" id="gName" placeholder="Full name" style="flex:1;min-width:150px" required>
        <select class="input" id="gRole" style="width:auto">${roles.map(r => `<option value="${r}">${r === 'staff' || r === 'dept_lead' ? (r === 'staff' ? DEPARTMENTS[nd.scope.dept].staffTitle : DEPARTMENTS[nd.scope.dept].leadTitle) : ROLES[r].label}</option>`).join('')}</select>
        <button class="btn primary">${ico('plus')}Add</button></div>
      <p class="tiny muted" style="margin:8px 0 0">You can grant: ${roles.map(r => ROLES[r].label.toLowerCase()).join(', ')}. Everything you grant is logged.</p></form>`
    : `<p class="small muted" style="margin:12px 0 0">${ico('lock')} As ${roleLabel(u)}, you can’t grant access here.${blockedWhy(u, nd)}</p>`}`;
}
function blockedWhy(u, nd) {
  const probe = { group: 'property_manager', property: 'dept_lead', department: 'staff', household: 'adult' }[nd.kind];
  const r = checkGrant(u, probe, { ...nd.scope, dept: nd.scope.dept || 'cs', household: nd.scope.household || (nd.kind === 'household' ? nd.scope.household : undefined) });
  return r.ok ? '' : ` ${esc(r.reason)}`;
}

function householdControls(u, p) {
  const canManage = can(u, 'household.manage') && u.scope.household === p.scope.household && u.id !== p.id || ['property_manager', 'group_admin', 'platform_admin'].includes(u.role);
  const perms = permsOf(p);
  const chips = [perms.has('pay') ? 'Can pay' : 'No payments', perms.has('wo.create') ? 'Can file requests' : 'Can’t file requests', p.role === 'older_adult' || p.age >= 75 ? `Care alerts to: ${esc(p.careShare || (p.scope.household === 'h1' ? 'Lily Chen' : 'Daniel Okafor'))}` : ''].filter(Boolean);
  return `<div class="row wrap" style="gap:6px;margin-top:6px">${chips.map(c => `<span class="pill">${c}</span>`).join('')}
    ${p.role === 'child' ? `<span class="pill">Daily limit ${money(p.limits?.daily ?? 10)}</span>${canManage ? `<button class="btn ghost sm" data-limit="${p.id}" data-d="-2">${ico('minus')}</button><button class="btn ghost sm" data-limit="${p.id}" data-d="2">${ico('plus')}</button>` : ''}` : ''}</div>`;
}

function matrix() {
  const reps = [
    ['Group admin', { role: 'group_admin', scope: { group: 'g1' } }], ['Property manager', { role: 'property_manager', scope: {} }],
    ['Maintenance lead', { role: 'dept_lead', scope: { dept: 'maintenance' } }], ['Technician', { role: 'staff', scope: { dept: 'maintenance' } }],
    ['Service agent', { role: 'staff', scope: { dept: 'cs' } }], ['Finance lead', { role: 'dept_lead', scope: { dept: 'finance' } }],
    ['Household head', { role: 'household_head', scope: {} }], ['Adult', { role: 'adult', scope: {} }], ['Child', { role: 'child', scope: {} }],
  ].map(([l, u]) => [l, permsOf(u)]);
  return `<div class="t-wrap"><table class="t matrix"><thead><tr><th>Can…</th>${reps.map(([l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
    ${CAPABILITIES.map(([k, l]) => `<tr><td>${l}</td>${reps.map(([, p]) => `<td class="c">${p.has(k) ? ico('check') : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// ------------------------------------------------------------------ paint
function paint() {
  if (!root?.isConnected) return;
  const u = viewer();
  if (!node || !visible(u, NODES[node])) node = homeNode(u);
  $('#portfolio', root).hidden = !can(u, 'portfolio.view');
  if (can(u, 'portfolio.view')) $('#portfolioBody', root).innerHTML = portfolio();
  $('#tree', root).innerHTML = tree(u);
  $('#panel', root).innerHTML = panel(u);
  $('#audit', root).innerHTML = S().audit.slice(0, 12).map(a => `<div class="list-item small"><span class="muted" style="min-width:58px">${a.t}</span><span style="flex:1"><b>${esc(a.by)}</b>: ${esc(a.text)}</span></div>`).join('');
  $('#me', root).innerHTML = `<b>${esc(u.name)}</b>, ${roleLabel(u)}. You see ${S().users.filter(x => contains(u.scope, x.scope)).length} people in your scope.`;
}

export function renderOrg(el) {
  root = el;
  const u = viewer();
  node = homeNode(u);
  el.innerHTML = `
  <div class="h-page"><div><h2>${u.scope.household && !u.scope.dept ? 'My household' : 'Organization and access'}</h2><p>A group runs several properties; each property has departments; each household has a head who manages the family. Everyone can grant access only below their own level and only inside what they manage, and every change is logged.</p></div></div>
  <div class="card" style="margin-bottom:16px"><div class="card-b small" id="me"></div></div>
  <div class="card" id="portfolio" style="margin-bottom:16px"><div class="card-h"><h2>Portfolio</h2><span class="sub">${GROUP.name}</span></div><div class="card-b" id="portfolioBody"></div></div>
  <div class="grid org-layout">
    <div class="card"><div class="card-h"><h2>Structure</h2></div><div class="card-b tree" id="tree"></div></div>
    <div class="stack"><div class="card"><div class="card-b" id="panel"></div></div>
      <div class="card"><div class="card-h"><h2>Access log</h2></div><div class="card-b" id="audit"></div></div></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h2>What each role can do</h2><span class="sub">Department roles add their department’s permissions</span></div><div class="card-b">${matrix()}</div></div>`;
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const me = viewer();
    if (b.dataset.node) { node = b.dataset.node; return paint(); }
    if (b.dataset.revoke) { const res = revoke(me, b.dataset.revoke); return toast(res.ok ? 'Access removed' : res.reason, res.ok ? 'check' : 'alert'); }
    if (b.dataset.limit) {
      const p = S().users.find(x => x.id === b.dataset.limit), v = Math.max(0, Math.min(30, (p.limits?.daily ?? 10) + +b.dataset.d));
      updateUser(me, p.id, { limits: { ...(p.limits || {}), daily: v } }, `Set ${p.name}’s daily spending limit to ${money(v)}`);
    }
  };
  el.onsubmit = e => {
    e.preventDefault();
    const me = viewer(), nd = NODES[node];
    const res = grant(me, { name: $('#gName', root).value, role: $('#gRole', root).value, scope: nd.scope });
    toast(res.ok ? `${res.user.name} added as ${roleLabel(res.user)}` : res.reason, res.ok ? 'check' : 'alert');
  };
  const off = store.onChange(paint);
  paint();
  return off;
}
