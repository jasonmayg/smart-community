// Work orders: one queue, a clear lifecycle, expediting, escalation and corrections — all role-aware.
import { $, $$, toast, modal } from '../lib/ui.js';
import { ico } from '../lib/icons.js';
import { esc, pct, int } from '../lib/format.js';
import { llmReady, ask, extractJSON } from '../lib/llm.js';
import { store, viewer, act, log, ASSET, REGISTRY } from '../state.js';
import { CATEGORIES, triage, fromModel, merge as mergeTriage, TRIAGE_SYSTEM } from '../domain/triage.js';
import { DEPARTMENTS, permsOf, roleLabel } from '../domain/org.js';
import * as WO from '../domain/workorders.js';
import { assess, TYPES } from '../domain/assets.js';
import { highlight, urgencyPill, kpi } from './shared.js';

let root, selected = null, filter = 'open', tryText = 'My smoke alarm keeps chirping, I think the battery is low', tryModel = null;
const S = () => store.data;

// ------------------------------------------------------------------ scope
function visibleOrders(u) {
  const p = permsOf(u);
  if (p.has('wo.view.all')) return S().orders;
  if (p.has('wo.view.dept')) return S().orders.filter(o => o.dept === u.scope.dept);
  return [];
}
const statusPill = o => `<span class="pill st-${o.status}">${WO.STATES[o.status].label}</span>`;
const deptName = d => DEPARTMENTS[d]?.name || d;
const staffOf = dept => S().users.filter(u => u.scope.property === 'p1' && u.scope.dept === dept && ['staff', 'dept_lead'].includes(u.role));
const load = name => S().orders.filter(o => WO.isOpen(o) && o.assignee === name).length;
function recommend(dept) {
  const people = staffOf(dept).filter(u => u.role === 'staff');
  const pool = people.length ? people : staffOf(dept);
  return pool.sort((a, b) => load(a.name) - load(b.name))[0];
}

function slaText(o) {
  if (!WO.isOpen(o)) return '';
  const left = WO.hoursLeft(o);
  if (left < 0) return `<span class="sla late">${ico('clock')}${Math.abs(left).toFixed(0)} h overdue</span>`;
  return `<span class="sla">${ico('clock')}${left < 1 ? '< 1' : left.toFixed(0)} h left</span>`;
}
const escBadge = o => { const l = WO.escalationLevel(o); return l ? `<span class="pill esc">${ico('arrowUp')}${WO.ESCALATION_TO[l]}</span>` : ''; };
const corrected = o => o.events.some(e => e.kind === 'corrected');

// ------------------------------------------------------------------ list
function row(o) {
  return `<button class="wo-row ${selected === o.id ? 'on' : ''} ${WO.isOpen(o) ? '' : 'closed'}" data-open="${o.id}">
    <div class="row wrap" style="gap:6px">${urgencyPill(o.urgency)}${statusPill(o)}${escBadge(o)}${o.assetId ? `<span class="pill asset">${ico('bolt')}${o.assetId}</span>` : ''}${corrected(o) ? '<span class="pill">Corrected</span>' : ''}</div>
    <div class="wo-text">${esc(o.text)}</div>
    <div class="meta">${esc(o.who)} · ${deptName(o.dept)}${o.assignee ? ` → ${esc(o.assignee)}` : ', unassigned'} ${slaText(o)}</div>
  </button>`;
}

// ------------------------------------------------------------------ detail
function detail(o, u) {
  if (!o) return `<div class="empty">${ico('wrench')}<div>Pick a work order to see its history and what you can do with it.</div></div>`;
  const perms = permsOf(u);
  const isAssignee = o.assignee === u.name;
  const acts = WO.actions(o, perms, { isAssignee });
  const asset = o.assetId ? ASSET[o.assetId] : null, ast = asset && assess(asset);
  const dups = WO.isOpen(o) ? WO.findDuplicates(o, S().orders) : [];
  const rec = WO.isOpen(o) && !o.assignee ? recommend(o.dept) : null;
  const ai = o.ai, cat = CATEGORIES[ai.cat];
  const fixes = o.events.filter(e => e.kind === 'corrected');
  const label = { assign: ['Assign', 'primary', 'user'], reassign: ['Reassign', 'secondary', 'users'], start: ['Start work', 'primary', 'wrench'], hold: ['Put on hold', 'secondary', 'clock'], resume: ['Resume', 'primary', 'wrench'], complete: ['Mark complete', 'ok', 'check'], expedite: ['Expedite', 'danger', 'bolt'], correct: ['Correct', 'secondary', 'refresh'], merge: ['Merge duplicate', 'secondary', 'x'], confirm: ['Close for resident', 'ok', 'check'], reopen: ['Reopen', 'secondary', 'refresh'] };
  return `
  <div class="row wrap" style="gap:6px">${urgencyPill(o.urgency)}${statusPill(o)}${escBadge(o)}<span class="tiny muted" style="margin-left:auto">${o.id.toUpperCase()}</span></div>
  <h3 class="wo-title">${highlight(o.text, ai.cues)}</h3>
  <div class="small muted">${esc(o.who)}, via ${esc(o.src)}, ${o.t}${o.followers?.length ? ` · also reported by ${o.followers.map(esc).join(', ')}` : ''}</div>
  <div class="facts">
    <div><span>Category</span><b>${CATEGORIES[o.cat]?.label || o.cat}</b></div>
    <div><span>Department</span><b>${deptName(o.dept)}</b></div>
    <div><span>Assignee</span><b>${o.assignee ? esc(o.assignee) : '—'}</b></div>
    <div><span>Deadline</span><b>${WO.isOpen(o) ? slaText(o) : WO.STATES[o.status].label}</b></div>
  </div>
  ${acts.length ? `<div class="row wrap" style="gap:8px;margin:14px 0">${acts.map(a => `<button class="btn ${label[a][1]} sm" data-act="${a}">${ico(label[a][2])}${label[a][0]}</button>`).join('')}</div>` : `<p class="small muted" style="margin:14px 0">${WO.isOpen(o) ? `As ${roleLabel(u)}, you can view this order but not change it.` : 'This order is finished.'}</p>`}
  <div class="ai-box">
    <div class="row"><span class="badge blue">${ico('sparkles')}AI assist</span><span class="tiny muted">${ai.source === 'model' ? 'Claude' : ai.source === 'button' ? 'Help button' : 'Rules'}${ai.source === 'rules' ? `, ${Math.round(ai.conf * 100)}% confidence` : ''}</span></div>
    <div class="small">First read as <b>${cat?.label || ai.cat}</b>, <b>${ai.urgency}</b>, for ${deptName(ai.dept)}.${fixes.length ? ` <span class="corr">${fixes.map(f => `${esc(f.by)} corrected: ${f.data.changes.map(c => `${c.field} ${c.from} → ${c.to}`).join(', ')} (${esc(f.data.reason)})`).join('; ')}</span>` : ''}</div>
    ${asset ? `<div class="small"><b>Asset:</b> <a href="#/facilities/${asset.id}">${asset.id}</a>, ${TYPES[asset.type].label.toLowerCase()}, ${esc(asset.where)}, Building ${asset.building}. ${ai.assetId === asset.id ? `Matched from the words (${Math.round(ai.assetConf * 100)}%).` : 'Set by staff.'}
      ${ast.status === 'failed' ? `It failed about ${asset.failed.hoursAgo} h ago; ${asset.connected ? 'its sensor caught it' : `nobody noticed for ${asset.failed.detectedAfterH} h because it has no sensor`}.` : ast.status === 'replace' ? '<b>The lifecycle model had already flagged it for replacement</b> before this report.' : ast.status === 'watch' ? 'It was already on the watch list.' : ''}</div>` : ''}
    ${rec ? `<div class="small"><b>Suggested assignee:</b> ${esc(rec.name)} (${load(rec.name)} open job${load(rec.name) === 1 ? '' : 's'}, lightest load in ${deptName(o.dept)}).</div>` : ''}
    ${dups.length ? `<div class="small"><b>Possible duplicate${dups.length > 1 ? 's' : ''}:</b> ${dups.map(d => `<button class="linkish" data-open="${d.id}">${d.id.toUpperCase()}</button> “${esc(d.text.slice(0, 60))}”`).join('; ')}</div>` : ''}
    ${llmReady() && WO.isOpen(o) && ai.source === 'rules' && perms.has('wo.correct') ? `<button class="btn secondary sm" data-claude style="margin-top:6px">${ico('sparkles')}Second opinion from Claude</button>` : ''}
  </div>
  <h4 style="margin:18px 0 8px">History</h4>
  <ol class="timeline">${[...o.events].reverse().map(e => `<li class="k-${e.kind}"><b>${esc(e.text)}</b><span>${esc(e.by)} · ${e.t}</span></li>`).join('')}</ol>`;
}

// ------------------------------------------------------------------ AI quality
function quality() {
  const q = WO.aiQuality(S().orders, S().aiHistory);
  const r = triage(tryText), mx = Math.max(...Object.values(r.scores), 1);
  return `<div class="grid cols-3" style="margin-bottom:12px">
      <div class="mini"><span>Category right first time</span><b>${pct(q.catAcc, 1)}</b></div>
      <div class="mini"><span>Department right first time</span><b>${pct(q.deptAcc, 1)}</b></div>
      <div class="mini"><span>Urgency raised by staff</span><b>${q.urgencyMissed}</b></div></div>
    <p class="tiny muted" style="margin:0 0 12px">Measured from staff corrections on ${int(q.total)} orders in the last 30 days, including the ones you correct here. Target: 85%+ category accuracy before triage is allowed to assign automatically.</p>
    <label class="field">Try a request<textarea class="input" id="tryText" rows="2">${esc(tryText)}</textarea></label>
    <div id="tryOut" style="margin-top:8px"><p style="margin:0 0 6px">${urgencyPill(r.urgency)} <b>${r.label}</b> <span class="muted">→ ${deptName(WO.DEPT_OF[r.cat])}</span></p>
      <div class="small">${highlight(tryText, r.cues)}</div>
      <div class="bars">${Object.entries(r.scores).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `<div><span>${CATEGORIES[k].label}</span><span class="track"><i style="width:${v / mx * 100}%"></i></span><span class="num">${v.toFixed(1)}</span></div>`).join('')}</div>
      ${tryModel ? `<div class="why" style="margin-top:10px"><b>Claude:</b> ${urgencyPill(tryModel.urgency)} <b>${tryModel.label}</b>. ${esc(tryModel.reason)}</div>` : ''}
      ${llmReady() ? `<button class="btn secondary sm" id="tryClaude" style="margin-top:8px">${ico('sparkles')}Compare with Claude</button>` : ''}</div>`;
}

// ------------------------------------------------------------------ paint
function paint() {
  if (!root?.isConnected) return;
  const u = viewer(), all = visibleOrders(u);
  const open = all.filter(WO.isOpen);
  const q = WO.aiQuality(S().orders, S().aiHistory);
  $('#kpis', root).innerHTML = [
    kpi('wrench', 'Open', open.length, `${open.filter(o => o.status === 'new').length} not yet assigned`),
    kpi('arrowUp', 'Overdue and escalated', open.filter(o => WO.escalationLevel(o) > 0).length, `${open.filter(o => WO.escalationLevel(o) >= 2).length} at property manager or above`),
    kpi('check', 'Awaiting resident', all.filter(o => o.status === 'done').length, 'closes on confirmation or after 72 h'),
    kpi('sparkles', 'AI triage accuracy', pct(q.catAcc, 0), 'category, from staff corrections'),
  ].join('');
  const lists = {
    open, mine: open.filter(o => o.assignee === u.name), unassigned: open.filter(o => o.status === 'new'),
    overdue: open.filter(o => WO.escalationLevel(o) > 0), resident: all.filter(o => o.status === 'done'), closed: all.filter(o => !WO.isOpen(o) && o.status !== 'done'),
  };
  $('#filters', root).innerHTML = [['open', 'Open'], ['mine', 'Mine'], ['unassigned', 'Unassigned'], ['overdue', 'Overdue'], ['resident', 'Awaiting resident'], ['closed', 'Closed']]
    .map(([k, l]) => `<button data-filter="${k}" aria-pressed="${filter === k}">${l} <span class="count">${lists[k].length}</span></button>`).join('');
  const ORD = { urgent: 0, high: 1, normal: 2 };
  const shown = [...lists[filter]].sort((a, b) => WO.escalationLevel(b) - WO.escalationLevel(a) || ORD[a.urgency] - ORD[b.urgency] || b.ageH - a.ageH);
  $('#list', root).innerHTML = shown.length ? shown.map(row).join('') : '<div class="empty">Nothing here.</div>';
  const o = all.find(x => x.id === selected);
  $('#detail', root).innerHTML = detail(o, u);
  $('#quality', root).innerHTML = quality();
  $('#scopeNote', root).textContent = permsOf(u).has('wo.view.all') ? 'All departments at Maple Court' : `${deptName(u.scope.dept)} only`;
}

export function renderOrders(el, sub) {
  root = el;
  if (sub) selected = sub;
  el.innerHTML = `
  <div class="h-page"><div><h2>Work orders</h2><p>Every request, from any channel, becomes a work order with an owner, a deadline and a full history. Residents can expedite and confirm; overdue orders climb the escalation ladder; staff fix the AI’s mistakes in two clicks, and every fix is counted.</p></div><div class="right"><span class="badge" id="scopeNote"></span></div></div>
  <div class="grid cols-4" id="kpis"></div>
  <div class="seg wo-filters" id="filters" role="group" aria-label="Filter" style="margin:16px 0 12px"></div>
  <div class="grid wo-layout">
    <div class="card"><div class="card-b wo-list" id="list"></div></div>
    <div class="stack">
      <div class="card"><div class="card-b" id="detail"></div></div>
      <div class="card"><div class="card-h"><h2>AI triage quality</h2></div><div class="card-b" id="quality"></div></div>
    </div>
  </div>`;
  el.onclick = onClick;
  el.oninput = e => { if (e.target.id === 'tryText') { tryText = e.target.value; tryModel = null; const pos = e.target.selectionStart; $('#quality', root).innerHTML = quality(); const t = $('#tryText', root); t.focus(); t.setSelectionRange(pos, pos); } };
  const off = store.onChange(paint);
  if (!selected) selected = visibleOrders(viewer()).filter(WO.isOpen).sort((a, b) => WO.escalationLevel(b) - WO.escalationLevel(a))[0]?.id;
  paint();
  return off;
}

// ------------------------------------------------------------------ actions
const done = (res, msg, icon) => { if (!res.ok) toast(res.reason, 'alert'); else if (msg) toast(msg, icon); return res.ok; };

async function onClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  const u = viewer();
  if (b.dataset.filter) { filter = b.dataset.filter; return paint(); }
  if (b.dataset.open) { selected = b.dataset.open; paint(); if (matchMedia('(max-width:1100px)').matches) $('#detail', root).scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (b.id === 'tryClaude') {
    b.disabled = true;
    try { tryModel = fromModel(extractJSON(await ask({ system: TRIAGE_SYSTEM, messages: [{ role: 'user', content: tryText }], maxTokens: 300 }))); } catch (err) { toast(err.message, 'alert'); }
    return paint();
  }
  const o = S().orders.find(x => x.id === selected); if (!o) return;
  const t = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (b.hasAttribute('data-claude')) {
    b.disabled = true; b.textContent = 'Asking…';
    try {
      const m = fromModel(extractJSON(await ask({ system: TRIAGE_SYSTEM, messages: [{ role: 'user', content: o.text }], maxTokens: 300 })));
      if (!m) throw new Error('The model’s answer could not be read.');
      const merged = mergeTriage(triage(o.text), m);
      if (merged.cat === o.cat && merged.urgency === o.urgency) toast('Claude agrees with the current triage.', 'sparkles');
      else modal('Claude suggests a change', `<p>${urgencyPill(merged.urgency)} <b>${CATEGORIES[merged.cat].label}</b> for ${deptName(WO.DEPT_OF[merged.cat])}.</p><p class="small muted">${esc(m.reason)}</p><p class="tiny muted">Urgency can only go up from the rules’ reading, never down.</p><button class="btn primary" id="apply">Apply as a correction</button>`, {
        onMount(mm, close) { $('#apply', mm).onclick = () => { done(act(o.id, x => WO.correct(x, { cat: merged.cat, urgency: merged.urgency }, 'Claude second opinion', `${u.name} + Claude`, t)), 'Corrected'); close(); }; },
      });
    } catch (err) { toast(err.message, 'alert'); }
    return paint();
  }
  const a = b.dataset.act; if (!a) return;
  if (a === 'start') return done(act(o.id, x => WO.start(x, u.name, t)), 'Work started');
  if (a === 'resume') return done(act(o.id, x => WO.resume(x, u.name, t)), 'Work resumed');
  if (a === 'assign' || a === 'reassign') return assignModal(o, u, t);
  if (a === 'hold') return pickModal('Put on hold', 'Why is it on hold?', WO.HOLD_REASONS, r => act(o.id, x => WO.hold(x, r, u.name, t)), 'On hold');
  if (a === 'complete') return textModal('Mark complete', 'What was done?', 'e.g. Replaced LED fixture', note => act(o.id, x => WO.complete(x, note, u.name, t)), 'Completed. The resident is asked to confirm.');
  if (a === 'expedite') return textModal('Expedite', 'Why does this need to go faster?', 'e.g. Resident is 84 and the corridor is dark at night', r => act(o.id, x => WO.expedite(x, r, u.name, t)), 'Expedited. The department lead was notified.', 'bolt');
  if (a === 'confirm') return pickModal('Close for the resident', 'How did the resident rate it?', ['5', '4', '3', '2', '1'], r => act(o.id, x => WO.confirm(x, +r, `${u.name} for resident`, t)), 'Closed');
  if (a === 'reopen') return textModal('Reopen', 'What is still wrong?', 'e.g. Light works but flickers', r => act(o.id, x => WO.reopen(x, r, u.name, t)), 'Reopened and sent back to the assignee');
  if (a === 'merge') return mergeModal(o, u, t);
  if (a === 'correct') return correctModal(o, u, t);
}

function assignModal(o, u, t) {
  const rec = recommend(o.dept);
  const opts = dept => staffOf(dept).map(p => `<option value="${esc(p.name)}" ${rec && p.name === rec.name && dept === o.dept ? 'selected' : ''}>${esc(p.name)}, ${roleLabel(p)} (${load(p.name)} open)</option>`).join('');
  modal(o.status === 'new' ? 'Assign' : 'Reassign', `
    <div class="stack" style="gap:12px">
      <label class="field">Department<select class="input" id="d">${Object.entries(DEPARTMENTS).map(([k, d]) => `<option value="${k}" ${k === o.dept ? 'selected' : ''}>${d.name}</option>`).join('')}</select></label>
      <label class="field">Person<select class="input" id="p">${opts(o.dept)}</select></label>
      ${rec ? `<p class="small muted" style="margin:0">${ico('sparkles')} Suggested: ${esc(rec.name)}, lightest load.</p>` : ''}
      <button class="btn primary" id="go">Assign</button></div>`, {
    onMount(m, close) {
      $('#d', m).onchange = e => { $('#p', m).innerHTML = opts(e.target.value); };
      $('#go', m).onclick = () => {
        const dept = $('#d', m).value, who = $('#p', m).value;
        if (!who) return toast('Pick a person', 'alert');
        if (done(act(o.id, x => { if (dept !== x.dept) WO.correct(x, { dept }, 'Wrong department', u.name, t); WO.assign(x, { dept, assignee: who }, u.name, t); }), `Assigned to ${who}`)) close();
      };
    },
  });
}

function pickModal(title, q, options, run, msg) {
  modal(title, `<div class="stack" style="gap:10px"><div class="small">${q}</div>${options.map(r => `<button class="btn secondary" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div>`, {
    onMount(m, close) { m.onclick = e => { const b = e.target.closest('[data-r]'); if (b && done(run(b.dataset.r), msg)) close(); }; },
  });
}

function textModal(title, q, ph, run, msg, icon) {
  modal(title, `<div class="stack" style="gap:10px"><label class="field">${q}<textarea class="input" id="v" rows="3" placeholder="${esc(ph)}"></textarea></label><button class="btn primary" id="go">${title}</button></div>`, {
    onMount(m, close) { $('#go', m).onclick = () => { const v = $('#v', m).value.trim(); if (!v) return toast('Add a short note first', 'alert'); if (done(run(v), msg, icon)) close(); }; },
  });
}

function mergeModal(o, u, t) {
  const dups = WO.findDuplicates(o, S().orders);
  const others = S().orders.filter(x => x.id !== o.id && WO.isOpen(x) && !dups.includes(x));
  modal('Merge as duplicate', `<p class="small" style="margin-top:0">Close <b>${o.id.toUpperCase()}</b> and add ${esc(o.who)} as a follower of the original, so they get the same updates.</p>
    <div class="stack" style="gap:8px">${[...dups, ...others].slice(0, 8).map(x => `<button class="btn ${dups.includes(x) ? 'primary' : 'secondary'}" data-into="${x.id}" style="justify-content:flex-start;white-space:normal;text-align:left">${dups.includes(x) ? `${ico('sparkles')}` : ''}${x.id.toUpperCase()}: ${esc(x.text.slice(0, 70))}</button>`).join('')}</div>`, {
    width: 520,
    onMount(m, close) {
      m.onclick = e => {
        const b = e.target.closest('[data-into]'); if (!b) return;
        const res = act(o.id, (x, all) => WO.merge(x, all.find(y => y.id === b.dataset.into), u.name, t));
        if (done(res, 'Merged')) { selected = b.dataset.into; close(); paint(); }
      };
    },
  });
}

function correctModal(o, u, t) {
  const near = REGISTRY.filter(a => !o.assetId || a.building === ASSET[o.assetId]?.building || a.id === o.assetId).slice(0, 60);
  modal('Correct this work order', `
    <div class="stack" style="gap:12px">
      <div class="grid cols-2">
        <label class="field">Category<select class="input" id="c">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}" ${k === o.cat ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>
        <label class="field">Urgency<select class="input" id="g">${WO.URGENCY.map(x => `<option ${x === o.urgency ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field">Department<select class="input" id="d">${Object.entries(DEPARTMENTS).map(([k, d]) => `<option value="${k}" ${k === o.dept ? 'selected' : ''}>${d.name}</option>`).join('')}</select></label>
        <label class="field">Asset<select class="input" id="a"><option value="">None</option>${near.map(a => `<option ${a.id === o.assetId ? 'selected' : ''}>${a.id}</option>`).join('')}</select></label>
      </div>
      <label class="field">Reason<select class="input" id="r">${WO.CORRECTION_REASONS.filter(x => x !== 'Duplicate').map(x => `<option>${x}</option>`).join('')}</select></label>
      <p class="tiny muted" style="margin:0">Changing the department sends the order back to unassigned. Corrections to the AI’s first reading are counted in triage accuracy.</p>
      <button class="btn primary" id="go">Save correction</button></div>`, {
    width: 520,
    onMount(m, close) {
      $('#c', m).onchange = e => { $('#d', m).value = WO.DEPT_OF[e.target.value]; };
      $('#go', m).onclick = () => {
        const patch = { cat: $('#c', m).value, urgency: $('#g', m).value, dept: $('#d', m).value, assetId: $('#a', m).value || null };
        const res = act(o.id, x => WO.correct(x, patch, $('#r', m).value, u.name, t));
        if (done(res, 'Corrected. Logged for triage accuracy.')) { close(); log('refresh', `<b>Work order ${o.id.toUpperCase()}</b> corrected by ${esc(u.name)}: ${esc($('#r', m)?.value || '')}.`); }
      };
    },
  });
}
