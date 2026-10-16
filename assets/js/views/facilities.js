// Facilities: lifecycle prediction for every light, door reader, elevator door, pump and circuit.
import { $, toast } from '../lib/ui.js';
import { ico } from '../lib/icons.js';
import { esc, int, money, pct } from '../lib/format.js';
import { llmReady, ask } from '../lib/llm.js';
import { store, viewer, REGISTRY, ASSET } from '../state.js';
import { TYPES, assess, batchPlan, fmtUse, pFail, DETECT } from '../domain/assets.js';
import { can } from '../domain/org.js';
import * as WO from '../domain/workorders.js';
import { kpi } from './shared.js';

const ITEMS = REGISTRY.map(a => ({ a, st: assess(a) }));
const BY = Object.fromEntries(ITEMS.map(x => [x.a.id, x]));
const RETROFIT = { light: 35, stairlight: 35, circuit: 420 }; // smart driver / smart breaker per unit
let root, sel = 'C-DOOR', fStatus = 'action', fType = 'all', fB = 'all', aiPlan = null, showAll = false;
const ORDER = { failed: 0, replace: 1, watch: 2, ok: 3 };
const STATUS = { failed: ['Failed', 'urgent'], replace: ['Replace', 'highrisk'], watch: ['Watch', 'medium'], ok: ['OK', 'ok'] };
const yrs = d => (d / 365).toFixed(1) + ' y';
const when = st => ['replace', 'failed'].includes(st.status) ? 'Now' : st.replaceBy ? st.replaceBy.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Run to failure';
const detectText = h => (h < 1 ? `~${Math.round(h * 60)} min` : `~${Math.round(h)} h`);

function openOrderFor(id) { return store.data.orders.find(o => o.assetId === id && WO.isOpen(o)); }

// ------------------------------------------------------------------ charts
function costCurve(x) {
  const T = TYPES[x.a.type], c = x.st.opt.curve, W = 420, H = 150, pl = 8, pr = 8, pt = 14, pb = 22;
  const maxX = c[c.length - 1][0], ys = c.map(p => p[1]).filter(Number.isFinite);
  const lo = Math.min(...ys), hi = Math.min(Math.max(...ys), lo * 4);
  const X = v => pl + v / maxX * (W - pl - pr), Y = v => pt + (1 - (Math.min(v, hi) - lo) / (hi - lo || 1)) * (H - pt - pb);
  const path = c.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const age = Math.min(x.st.age, maxX);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cost per unit of use by replacement age">
    <line x1="${pl}" x2="${W - pr}" y1="${Y(x.st.opt.runToFail)}" y2="${Y(x.st.opt.runToFail)}" stroke="var(--faint)" stroke-dasharray="4 4"/>
    <text x="${W - pr}" y="${Y(x.st.opt.runToFail) - 4}" text-anchor="end" font-size="10" fill="var(--muted)">run to failure</text>
    <path d="${path}" fill="none" stroke="var(--brand)" stroke-width="2"/>
    <line x1="${X(x.st.opt.T)}" x2="${X(x.st.opt.T)}" y1="${pt}" y2="${H - pb}" stroke="var(--leaf)" stroke-width="2"/>
    <text x="${X(x.st.opt.T) + 4}" y="${pt + 8}" font-size="10" fill="var(--leaf-ink)">best age ${fmtUse(x.st.opt.T, T)}</text>
    <line x1="${X(age)}" x2="${X(age)}" y1="${pt}" y2="${H - pb}" stroke="var(--rose)" stroke-width="2" stroke-dasharray="3 3"/>
    <text x="${X(age) + 4}" y="${H - pb - 4}" font-size="10" fill="var(--rose-ink)">now</text>
    <text x="${pl}" y="${H - 6}" font-size="10" fill="var(--muted)">0</text><text x="${W - pr}" y="${H - 6}" font-size="10" text-anchor="end" fill="var(--muted)">${fmtUse(maxX, T)}</text>
  </svg>`;
}

function spark(x) {
  const s = x.a.series; if (!s) return '';
  const T = TYPES[x.a.type], W = 420, H = 90, p = 6, lo = Math.min(...s) * 0.9, hi = Math.max(...s) * 1.05;
  const X = i => p + i / (s.length - 1) * (W - 2 * p), Y = v => p + (1 - (v - lo) / (hi - lo || 1)) * (H - 2 * p);
  const b = x.st.drift.base;
  return `<div class="small muted" style="margin:10px 0 2px">${T.signal}, last 30 days</div>
  <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T.signal} over 30 days">
    <rect x="${X(0)}" y="${p}" width="${X(22) - X(0)}" height="${H - 2 * p}" fill="var(--sky)" opacity=".6"/>
    ${b != null ? `<line x1="${p}" x2="${W - p}" y1="${Y(b)}" y2="${Y(b)}" stroke="var(--faint)" stroke-dasharray="3 3"/>` : ''}
    <path d="${s.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}" fill="none" stroke="${x.st.drift.z > 3 ? 'var(--rose)' : 'var(--brand)'}" stroke-width="2"/>
    <text x="${X(0) + 4}" y="${H - p - 4}" font-size="10" fill="var(--muted)">baseline</text>
  </svg>`;
}

// ------------------------------------------------------------------ panels
function detail(x, u) {
  if (!x) return '<div class="empty">Pick an asset.</div>';
  const T = TYPES[x.a.type], st = x.st, [sl, tone] = STATUS[st.status];
  const p90 = st.pIn(90), p365 = st.pIn(365);
  const wo = openOrderFor(x.a.id);
  return `
  <div class="row wrap" style="gap:6px"><span class="pill ${tone}">${sl}</span><span class="pill">${T.label}</span>${x.a.connected ? `<span class="pill ok">${ico('bolt')}Sensor</span>` : '<span class="pill">No sensor</span>'}<span class="tiny muted" style="margin-left:auto">${x.a.id}</span></div>
  <h3 class="wo-title">${esc(x.a.where)}, Building ${x.a.building}</h3>
  <div class="facts">
    <div><span>In service</span><b>${yrs(st.days)}</b></div>
    <div><span>Use so far</span><b>${fmtUse(st.age, T)}</b></div>
    <div><span>Fail in 30 / 90 / 365 days</span><b>${pct(st.p30, 1)} / ${pct(p90, 0)} / ${pct(p365, 0)}</b></div>
    <div><span>Replace</span><b>${when(st)}</b></div>
  </div>
  ${st.reasons.length ? `<ul class="reasons" style="margin-top:12px">${st.reasons.map(r => `<li>${ico('alert')}${esc(r)}</li>`).join('')}</ul>` : ''}
  ${x.a.failed ? `<div class="why" style="margin-top:12px">${ico('clock')} Failed about ${x.a.failed.hoursAgo} h ago and went unnoticed for <b>${x.a.failed.detectedAfterH} h</b> until a ${esc(x.a.failed.by.toLowerCase())}. With a sensor it would have raised an alert in minutes.</div>` : ''}
  ${spark(x)}
  <div class="small muted" style="margin:12px 0 2px">Long-run cost per ${T.unit === 'years' ? 'year' : T.unit === 'h' ? 'hour' : 'cycle'} if replaced at each age · ${st.opt.policy === 'planned' ? `planned replacement at the best age saves ${pct(st.opt.saving, 0)} vs running to failure` : `planned replacement saves only ${pct(st.opt.saving, 0)}, so the policy is run to failure and detect fast`}</div>
  ${costCurve(x)}
  <div class="facts" style="margin-top:8px">
    <div><span>Failure noticed</span><b>${detectText(st.detectH)}</b></div>
    <div><span>Planned / failure cost</span><b>${money(T.cp)} / ${money(T.cf)}</b></div>
  </div>
  <div class="row wrap" style="gap:8px;margin-top:14px">
    ${wo ? `<a class="btn secondary sm" href="#/orders/${wo.id}">${ico('wrench')}Open work order ${wo.id.toUpperCase()}</a>` : can(u, 'assets.plan') && st.status !== 'ok' ? `<button class="btn primary sm" data-wo="${x.a.id}">${ico('plus')}${st.status === 'failed' ? 'Create repair order' : 'Create preventive order'}</button>` : ''}
    ${!can(u, 'assets.plan') ? `<span class="tiny muted">Approving replacements needs the maintenance lead or property manager.</span>` : ''}
  </div>`;
}

function detection() {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F'].map(b => {
    const xs = ITEMS.filter(x => x.a.building === b && ['light', 'stairlight', 'circuit'].includes(x.a.type));
    const fails = xs.reduce((s, x) => s + pFail(x.st.age, 365 * x.st.perDay, TYPES[x.a.type].beta, TYPES[x.a.type].eta), 0);
    const dark = xs.reduce((s, x) => s + pFail(x.st.age, 365 * x.st.perDay, TYPES[x.a.type].beta, TYPES[x.a.type].eta) * x.st.detectH, 0);
    const conn = xs.every(x => x.a.connected);
    const retro = conn ? 0 : xs.reduce((s, x) => s + RETROFIT[x.a.type], 0);
    return { b, fails, dark, avg: fails ? dark / fails : 0, conn, retro };
  });
  return `<div class="t-wrap"><table class="t"><thead><tr><th>Building</th><th>Lights and circuits</th><th class="r">Failures / yr</th><th class="r">Time to notice</th><th class="r">Unnoticed hours / yr</th><th class="r">Sensor retrofit</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><b>${r.b}</b></td><td>${r.conn ? `<span class="pill ok">${ico('bolt')}Connected</span>` : '<span class="pill">Resident reports</span>'}</td><td class="r">${r.fails.toFixed(1)}</td><td class="r">${detectText(r.avg)}</td><td class="r">${int(r.dark)}</td><td class="r">${r.conn ? '—' : money(r.retro)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="small muted" style="margin:10px 0 0">Without sensors, a failure waits for a resident: ~${DETECT.high} h in a busy corridor, ~${DETECT.low} h in a quiet stairwell. Lights are cheapest to run to failure, so for them <b>detection speed is the whole game</b>: fitting smart drivers turns “unnoticed hours” into minutes.</p>`;
}

function batches(u) {
  const plan = batchPlan(ITEMS);
  if (!plan.length) return '<div class="empty">Nothing due in the next 90 days.</div>';
  const total = plan.reduce((s, v) => s + v.cost, 0), saved = plan.reduce((s, v) => s + v.saved, 0);
  return `${plan.map(v => `<div class="route"><div class="row wrap" style="justify-content:space-between"><b>Building ${v.building}, week of ${v.when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</b><span class="num">${money(v.cost)}</span></div>
      <div class="small muted">${Object.entries(v.parts).map(([p, n]) => `${n} × ${p.toLowerCase()}`).join(', ')}${v.saved ? ` · one visit saves ${money(v.saved)} in setup` : ''}</div>
      <div class="tiny muted">${v.items.map(x => x.a.id).join(', ')}</div></div>`).join('')}
    <div class="row wrap" style="justify-content:space-between;margin-top:8px"><span class="small">${plan.length} visits, ${money(total)} in total${saved ? `, ${money(saved)} saved by batching` : ''}</span>
    ${can(u, 'assets.plan') ? `<button class="btn primary sm" data-approve>${ico('check')}Approve plan and create orders</button>` : ''}</div>`;
}

function offlinePlan() {
  const top = ITEMS.filter(x => x.st.status !== 'ok').sort((a, b) => ORDER[a.st.status] - ORDER[b.st.status] || b.st.p30 - a.st.p30);
  const reported = store.data.orders.filter(o => WO.isOpen(o) && o.assetId && ['replace', 'failed'].includes(BY[o.assetId]?.st.status));
  const lines = [];
  const f = top.find(x => x.st.status === 'failed'); if (f) lines.push(`Fix ${f.a.id} first: it has been out ${f.a.failed.hoursAgo} h and was only noticed after ${f.a.failed.detectedAfterH} h.`);
  const d = top.find(x => x.st.drift.z > 6); if (d) lines.push(`Replace ${d.a.id} this week: ${TYPES[d.a.type].signal.toLowerCase()} jumped ${d.st.drift.z.toFixed(0)}σ above its own baseline${reported.some(o => o.assetId === d.a.id) ? ', and a resident has already reported it' : ''}.`);
  const plan = batchPlan(ITEMS).sort((a, b) => b.items.length - a.items.length)[0];
  if (plan) lines.push(`Book one visit to Building ${plan.building} for ${plan.items.map(x => x.a.id).join(', ')}, saving ${money(plan.saved)} in setup.`);
  lines.push('Keep lights on run-to-failure, and fit sensors in Buildings A, B, E and F so outages are found in minutes, not hours.');
  return lines;
}

function aiCard() {
  const lines = aiPlan?.lines || offlinePlan();
  return `<ol class="plan">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ol>
    <div class="row wrap" style="justify-content:space-between;margin-top:8px"><span class="tiny muted">${aiPlan?.source === 'model' ? 'Written by Claude from the asset data' : 'Generated from the model outputs above'}</span>
    ${llmReady() ? `<button class="btn secondary sm" data-claude>${ico('sparkles')}Ask Claude to write the plan</button>` : ''}</div>`;
}

// ------------------------------------------------------------------ paint
function paint() {
  if (!root?.isConnected) return;
  const u = viewer();
  const n = s => ITEMS.filter(x => x.st.status === s).length;
  $('#kpis', root).innerHTML = [
    kpi('building', 'Assets tracked', ITEMS.length, `${ITEMS.filter(x => x.a.connected).length} with sensors`),
    kpi('alert', 'Failed now', n('failed'), 'known to the system'),
    kpi('refresh', 'Replace now', n('replace'), 'past best age or degrading'),
    kpi('clock', 'Watch', n('watch'), 'rising failure risk or due within 90 days'),
  ].join('');
  let list = ITEMS.filter(x => (fStatus === 'all' || x.st.status !== 'ok') && (fType === 'all' || x.a.type === fType) && (fB === 'all' || x.a.building === fB));
  list = list.sort((a, b) => ORDER[a.st.status] - ORDER[b.st.status] || b.st.p30 - a.st.p30);
  const shown = showAll ? list : list.slice(0, 14);
  $('#assetRows', root).innerHTML = shown.map(x => {
    const [sl, tone] = STATUS[x.st.status], used = Math.min(1.2, x.st.lifeUsed);
    return `<tr class="${sel === x.a.id ? 'on' : ''}" data-sel="${x.a.id}" tabindex="0">
      <td><b>${x.a.id}</b><div class="tiny muted">${TYPES[x.a.type].label}, ${esc(x.a.where)}</div></td>
      <td><div class="life"><i style="width:${Math.min(100, used * 100)}%;background:${used >= 1 ? 'var(--rose)' : used > 0.8 ? 'var(--marigold)' : 'var(--leaf)'}"></i></div><div class="tiny muted">${pct(Math.min(x.st.lifeUsed, 9.99), 0)} of ${x.st.opt.policy === 'planned' ? 'best age' : 'typical life'}</div></td>
      <td class="r">${pct(x.st.p30, 1)}</td><td class="r small">${when(x.st)}</td><td class="r small">${detectText(x.st.detectH)}</td>
      <td><span class="pill ${tone}">${sl}</span>${openOrderFor(x.a.id) ? ` <span class="pill asset">${ico('wrench')}WO</span>` : ''}</td></tr>`;
  }).join('') + (list.length > shown.length ? `<tr><td colspan="6"><button class="btn ghost sm" data-more>Show all ${list.length}</button></td></tr>` : '') + (list.length ? '' : '<tr><td colspan="6" class="empty">No assets match.</td></tr>');
  $('#detail', root).innerHTML = detail(BY[sel], u);
  $('#detect', root).innerHTML = detection();
  $('#batches', root).innerHTML = batches(u);
  $('#ai', root).innerHTML = aiCard();
}

export function renderFacilities(el, sub) {
  root = el;
  if (sub && BY[sub]) sel = sub;
  el.innerHTML = `
  <div class="h-page"><div><h2>Facilities</h2><p>Every light, door reader, elevator door, pump and circuit at Maple Court, with how worn it is, its chance of failing soon, the best time to replace it, and how long a failure would go unnoticed. Age is counted in use (hours on, door cycles), not calendar time.</p></div></div>
  <div class="grid cols-4" id="kpis"></div>
  <div class="grid split" style="margin-top:16px">
    <div class="stack">
      <div class="card"><div class="card-h"><h2>Assets</h2>
        <div class="right row wrap" style="gap:8px">
          <div class="seg" role="group" aria-label="Status"><button data-fs="action" aria-pressed="${fStatus === 'action'}">Needs attention</button><button data-fs="all" aria-pressed="${fStatus === 'all'}">All</button></div>
          <select class="select sm" id="fType" aria-label="Type"><option value="all">All types</option>${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${fType === k ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
          <select class="select sm" id="fB" aria-label="Building"><option value="all">All buildings</option>${['A', 'B', 'C', 'D', 'E', 'F'].map(b => `<option ${fB === b ? 'selected' : ''}>${b}</option>`).join('')}</select>
        </div></div>
        <div class="card-b"><div class="t-wrap"><table class="t assets"><thead><tr><th>Asset</th><th>Life used</th><th class="r">Fail in 30 d</th><th class="r">Replace by</th><th class="r">Noticed in</th><th>Status</th></tr></thead><tbody id="assetRows"></tbody></table></div></div></div>
      <div class="card"><div class="card-h"><h2>How long failures go unnoticed</h2><span class="sub">by building</span></div><div class="card-b" id="detect"></div></div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-b" id="detail"></div></div>
      <div class="card"><div class="card-h"><h2>${ico('sparkles')} AI maintenance plan</h2></div><div class="card-b" id="ai"></div></div>
      <div class="card"><div class="card-h"><h2>Replacement visits, next 90 days</h2></div><div class="card-b" id="batches"></div></div>
    </div>
  </div>
  <p class="demo-note">Method: Weibull life per asset type over usage; conditional failure probability given age; best replacement age from the age-replacement cost model (planned swap vs failure cost); health signals compared with each asset’s own 23-day baseline. Parameters and costs are illustrative.</p>`;
  el.onclick = onClick;
  el.onchange = e => { if (e.target.id === 'fType') { fType = e.target.value; paint(); } if (e.target.id === 'fB') { fB = e.target.value; paint(); } };
  el.onkeydown = e => { if (e.key === 'Enter' && e.target.dataset?.sel) { sel = e.target.dataset.sel; paint(); } };
  const off = store.onChange(paint);
  paint();
  return off;
}

function createOrder(x, u, src = 'Lifecycle model') {
  const T = TYPES[x.a.type];
  const text = x.st.status === 'failed' ? `${T.label} out: ${x.a.where}, Building ${x.a.building}` : `Planned replacement: ${T.part.toLowerCase()} at ${x.a.where}, Building ${x.a.building}`;
  const o = WO.create({ id: 'p' + Date.now() + x.a.id, text, who: `${u.name} (${src})`, src, t: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    triage: { cat: 'repair', label: 'Repair', urgency: x.st.status === 'failed' || x.st.drift.z > 6 ? 'high' : 'normal', conf: 1, cues: [], source: 'lifecycle' }, asset: { asset: x.a, conf: 1 } });
  o.events[1].text = `Lifecycle model: ${x.st.reasons[0] || 'due for replacement'}`;
  return o;
}

async function onClick(e) {
  const tr = e.target.closest('[data-sel]'); if (tr) { sel = tr.dataset.sel; paint(); if (matchMedia('(max-width:860px)').matches) $('#detail', root).scrollIntoView({ behavior: 'smooth' }); return; }
  const b = e.target.closest('button'); if (!b) return;
  const u = viewer();
  if (b.dataset.fs) { fStatus = b.dataset.fs; root.querySelectorAll('[data-fs]').forEach(x => x.setAttribute('aria-pressed', x === b)); return paint(); }
  if (b.hasAttribute('data-more')) { showAll = true; return paint(); }
  if (b.dataset.wo) {
    const o = createOrder(BY[b.dataset.wo], u);
    store.update(s => { s.orders.unshift(o); s.planned[b.dataset.wo] = o.id; });
    return toast(`Work order ${o.id.toUpperCase()} created for Maintenance`, 'wrench');
  }
  if (b.hasAttribute('data-approve')) {
    const plan = batchPlan(ITEMS); let n = 0;
    store.update(s => { plan.forEach(v => v.items.forEach(x => { if (!s.orders.some(o => o.assetId === x.a.id && WO.isOpen(o))) { const o = createOrder(x, u, 'Replacement plan'); s.orders.unshift(o); s.planned[x.a.id] = o.id; n++; } })); });
    return toast(n ? `${n} preventive work orders created` : 'Every planned item already has an open order', 'check');
  }
  if (b.hasAttribute('data-claude')) {
    b.disabled = true; b.textContent = 'Asking…';
    const top = ITEMS.filter(x => x.st.status !== 'ok').sort((a, c) => ORDER[a.st.status] - ORDER[c.st.status] || c.st.p30 - a.st.p30).slice(0, 12)
      .map(x => ({ id: x.a.id, type: TYPES[x.a.type].label, building: x.a.building, status: x.st.status, p30: +x.st.p30.toFixed(3), policy: x.st.opt.policy, reasons: x.st.reasons, sensor: x.a.connected, detectHours: +x.st.detectH.toFixed(1), plannedCost: TYPES[x.a.type].cp, failureCost: TYPES[x.a.type].cf }));
    try {
      const text = await ask({ system: 'You are a facilities planner for a residential community. Write a maintenance plan for this week as 3 to 5 short numbered actions, most important first. Use only the data given; cite asset ids and numbers. Plain text, one action per line, no preamble.', messages: [{ role: 'user', content: JSON.stringify({ assets: top, batchVisits: batchPlan(ITEMS).map(v => ({ building: v.building, items: v.items.map(x => x.a.id), setupSaved: v.saved })) }) }], maxTokens: 500 });
      aiPlan = { source: 'model', lines: text.split('\n').map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean).slice(0, 6) };
    } catch (err) { toast(err.message, 'alert'); }
    paint();
  }
}
