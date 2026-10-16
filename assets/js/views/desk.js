// Property desk: one queue for requests from the app, phone, front desk, volunteers and the assistant.
import { $, toast } from '../lib/ui.js';
import { ico } from '../lib/icons.js';
import { esc, int, pct } from '../lib/format.js';
import { llmReady, ask, extractJSON, llm } from '../lib/llm.js';
import { store, log } from '../state.js';
import { CATEGORIES, OWNERS, triage, fromModel, merge, slaLeft, TRIAGE_SYSTEM } from '../domain/triage.js';
import { FEE_COLLECTION, COMMUNITY } from '../domain/data.js';
import { highlight, urgencyPill, kpi } from './shared.js';

const ORDER = { urgent: 0, high: 1, normal: 2 };
let root, tryText = 'The elevator in building B smells like smoke', tryModel = null;

function slaText(q) {
  const left = slaLeft(q.urgency, q.ageH || 0);
  if (left < 0) return `<span class="sla late">${ico('clock')} ${Math.abs(left).toFixed(0)} h past deadline</span>`;
  return `<span class="sla">${left < 1 ? 'Under 1 h' : left.toFixed(0) + ' h'} left</span>`;
}

function reqRow(q) {
  const src = q.source === 'model' ? `Claude${q.rules && (q.rules.cat !== q.cat || q.rules.urgency !== q.urgency) ? `, rules said ${CATEGORIES[q.rules.cat].label} / ${q.rules.urgency}` : ''}` : q.source === 'button' ? 'Help button' : `Rules, ${Math.round((q.conf || 0) * 100)}% confidence`;
  return `<div class="req ${q.status === 'done' ? 'done' : ''}">
    <div><div>${highlight(q.text, q.cues || [])}</div>
      <div class="meta">${urgencyPill(q.urgency)}<b style="color:var(--ink)">${q.label}</b><span>${esc(q.who)}, ${esc(q.src)}, ${q.t}</span><span>${ico('sparkles', '')}${src}</span></div>
      ${q.reason ? `<div class="why">${ico('sparkles')} ${esc(q.reason)}</div>` : ''}</div>
    <div class="act">${q.status === 'done' ? '<span class="pill ok">Resolved</span>' : `
      <select class="select sm" data-owner="${q.id}" aria-label="Owner">${OWNERS.map(o => `<option ${o === q.owner ? 'selected' : ''}>${o}</option>`).join('')}</select>
      ${slaText(q)}
      <div class="row">${llmReady() && q.source !== 'model' && q.source !== 'button' ? `<button class="btn secondary sm" data-recheck="${q.id}">${ico('sparkles')}Ask Claude</button>` : ''}<button class="btn ok sm" data-resolve="${q.id}">${ico('check')}Resolve</button></div>`}
    </div></div>`;
}

function tryPanel() {
  const r = triage(tryText); const mx = Math.max(...Object.values(r.scores), 1);
  return `<p style="margin:10px 0 6px">${urgencyPill(r.urgency)} <b>${r.label}</b> <span class="muted">to ${r.owner}</span></p>
    <div class="small">${highlight(tryText, r.cues)}</div>
    <div class="bars">${Object.entries(r.scores).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div><span>${CATEGORIES[k].label}</span><span class="track"><i style="width:${v / mx * 100}%"></i></span><span class="num">${v.toFixed(1)}</span></div>`).join('')}</div>
    ${tryModel ? `<div class="why" style="margin-top:12px"><b>Claude:</b> ${urgencyPill(tryModel.urgency)} <b>${tryModel.label}</b>. ${esc(tryModel.reason)}</div>` : ''}`;
}

function paint() {
  if (!root?.isConnected) return;
  const s = store.data;
  const open = s.requests.filter(q => q.status !== 'done');
  const late = open.filter(q => slaLeft(q.urgency, q.ageH || 0) < 0).length;
  const paid = FEE_COLLECTION.paidOnline + FEE_COLLECTION.paidDesk + (s.billPaid ? 1 : 0);
  const list = [...s.requests].sort((a, b) => (a.status === 'done') - (b.status === 'done') || ORDER[a.urgency] - ORDER[b.urgency] || (b.ageH || 0) - (a.ageH || 0));
  $('#kpis', root).innerHTML = [
    kpi('wrench', 'Open requests', open.length, `${open.filter(q => q.urgency === 'urgent').length} urgent`),
    kpi('clock', 'Past deadline', late, 'urgent 4 h, high 24 h, normal 72 h'),
    kpi('receipt', 'October fees collected', pct(paid / FEE_COLLECTION.billed), `${int(paid)} of ${int(FEE_COLLECTION.billed)} households`),
    kpi('sparkles', 'Triage', llmReady() ? 'Claude + rules' : 'Rules', llmReady() ? llm.model : 'add a key in Settings for live AI'),
  ].join('');
  $('#queue', root).innerHTML = list.map(reqRow).join('');
  $('#tryOut', root).innerHTML = tryPanel();
  const unpaid = FEE_COLLECTION.billed - paid;
  $('#fees', root).innerHTML = `
    <div class="stackbar" style="margin:6px 0 10px"><i style="width:${FEE_COLLECTION.paidOnline / FEE_COLLECTION.billed * 100}%;background:var(--brand)"></i><i style="width:${(FEE_COLLECTION.paidDesk + (s.billPaid ? 1 : 0)) / FEE_COLLECTION.billed * 100}%;background:#8E99E8"></i></div>
    <div class="legend"><span><i style="background:var(--brand)"></i>In the app ${int(FEE_COLLECTION.paidOnline)}</span><span><i style="background:#8E99E8"></i>At the desk or just now ${int(FEE_COLLECTION.paidDesk + (s.billPaid ? 1 : 0))}</span><span><i style="background:var(--sky)"></i>Unpaid ${int(unpaid)}</span></div>
    <button class="btn secondary sm" data-remind style="margin-top:12px">${ico('bell')}Send a reminder to ${int(unpaid)} households</button>`;
}

export function renderDesk(el) {
  root = el;
  el.innerHTML = `
  <div class="h-page"><div><h2>Property desk</h2><p>${COMMUNITY.name}: ${int(COMMUNITY.households)} households. Requests from the app, phone, front desk, volunteers and the assistant land in one queue. AI suggests category, urgency and owner, and every suggestion shows its reasons. Staff decide.</p></div></div>
  <div class="grid cols-4" id="kpis"></div>
  <div class="grid split" style="margin-top:16px">
    <div class="card"><div class="card-h"><h2>Request queue</h2><span class="sub">Sorted by urgency, then age</span></div><div class="card-b" id="queue"></div></div>
    <div class="stack">
      <div class="card"><div class="card-h"><h2>Try the triage</h2></div><div class="card-b">
        <textarea class="input" id="tryText" aria-label="Request text">${esc(tryText)}</textarea>
        ${llmReady() ? `<button class="btn secondary sm" id="tryClaude" style="margin-top:8px">${ico('sparkles')}Compare with Claude</button>` : '<p class="tiny muted" style="margin:8px 0 0">Rules run as you type. Add an API key in Settings to compare with Claude.</p>'}
        <div id="tryOut"></div></div></div>
      <div class="card"><div class="card-h"><h2>Fee collection</h2><span class="sub">October</span></div><div class="card-b" id="fees"></div></div>
    </div>
  </div>`;
  $('#tryText', el).oninput = e => { tryText = e.target.value; tryModel = null; $('#tryOut', el).innerHTML = tryText.trim() ? tryPanel() : ''; };
  el.onchange = e => {
    const id = e.target.dataset.owner; if (!id) return;
    store.update(s => { const q = s.requests.find(x => x.id === id); q.owner = e.target.value; q.overridden = true; });
    toast('Owner changed. Overrides are logged to improve the triage.');
  };
  el.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.resolve) {
      const q = store.data.requests.find(x => x.id === b.dataset.resolve);
      store.update(s => { s.requests.find(x => x.id === q.id).status = 'done'; });
      if (q.src === 'App' || q.src === 'Assistant' || q.src === 'Help button') log('check', `<b>${esc(q.who.split(',')[0])}</b> got a message: “${esc(q.label)} request resolved.”`);
      toast('Resolved');
    }
    if (b.dataset.recheck) {
      const q = store.data.requests.find(x => x.id === b.dataset.recheck);
      b.disabled = true; b.textContent = 'Asking…';
      try {
        const m = fromModel(extractJSON(await ask({ system: TRIAGE_SYSTEM, messages: [{ role: 'user', content: q.text }], maxTokens: 300 })));
        if (!m) throw new Error('The model’s answer could not be read.');
        store.update(s => { const r = s.requests.find(x => x.id === q.id); Object.assign(r, merge(triage(q.text), m), { owner: r.overridden ? r.owner : m.owner }); });
      } catch (err) { toast(err.message, 'alert'); paint(); }
    }
    if (b.id === 'tryClaude') {
      b.disabled = true;
      try { tryModel = fromModel(extractJSON(await ask({ system: TRIAGE_SYSTEM, messages: [{ role: 'user', content: tryText }], maxTokens: 300 }))); if (!tryModel) toast('The model’s answer could not be read.', 'alert'); }
      catch (err) { toast(err.message, 'alert'); }
      b.disabled = false; $('#tryOut', root).innerHTML = tryPanel();
    }
    if (b.hasAttribute('data-remind')) { toast('Reminders sent in the app and by text message', 'bell'); log('bell', '<b>Property company</b> sent fee reminders to unpaid households.'); }
  };
  const off = store.onChange(paint);
  paint();
  return off;
}
