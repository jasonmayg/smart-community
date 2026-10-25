// Triage evaluation: how well requests are routed, on a labeled set, for the rules and (optionally) a live model.
import { $, toast } from '../lib/ui.js';
import { ico } from '../lib/icons.js';
import { esc } from '../lib/format.js';
import { llm, llmReady, askFull, extractJSON } from '../lib/llm.js';
import { triage, TRIAGE_SYSTEM, fromModel, merge, CATEGORIES } from '../domain/triage.js';
import { LABELED, scoreTriage, runSync, CAT_KEYS } from '../domain/triageEval.js';
import { kpi } from './shared.js';

const pct = x => (x * 100).toFixed(0) + '%';
const RULES = runSync(triage);
const RS = scoreTriage(RULES);
const typical = LABELED.filter(x => !x.hard), hard = LABELED.filter(x => x.hard);
const RS_T = scoreTriage(RULES, typical), RS_H = scoreTriage(RULES, hard);
// Live model results for this session (never stored; the key is the visitor's own).
const live = { preds: {}, done: 0, failed: 0, tokensIn: 0, tokensOut: 0, ms: [], running: false, model: '' };

const U = { urgent: 'Urgent', high: 'Today', normal: 'Normal' };
const tag = p => p ? `${esc(CATEGORIES[p.cat].label)} · ${U[p.urgency]}` : '—';

function compareRows(ms, cs) {
  const rows = [
    ['Category right', s => pct(s.catAcc)],
    ['Urgency right', s => pct(s.urgencyAcc)],
    ['Urgent requests caught', s => `${pct(s.urgentRecall)} <span class="muted">(${s.urgentN - s.severeMisses} of ${s.urgentN})</span>`],
    ['Help needed, marked lower', s => pct(s.underRate)],
    ['Marked more urgent than needed', s => pct(s.overRate)],
  ];
  const cell = (s, f) => s ? f(s) : '<span class="muted">—</span>';
  return rows.map(([l, f]) => `<tr><td>${l}</td><td class="r">${f(RS)}</td><td class="r">${cell(ms, f)}</td><td class="r">${cell(cs, f)}</td></tr>`).join('');
}

function matrix(s) {
  const max = Math.max(...CAT_KEYS.flatMap(a => CAT_KEYS.map(b => s.matrix[a][b])));
  return `<div class="t-wrap"><table class="t cm"><thead><tr><th>Actual ↓ / Rules said →</th>${CAT_KEYS.map(k => `<th class="r">${CATEGORIES[k].label}</th>`).join('')}</tr></thead><tbody>
    ${CAT_KEYS.map(a => `<tr><th>${CATEGORIES[a].label}</th>${CAT_KEYS.map(b => { const v = s.matrix[a][b]; const ok = a === b; return `<td class="r" style="background:${v ? (ok ? `rgba(47,132,82,${0.12 + 0.6 * v / max})` : `rgba(192,57,91,${0.15 + 0.6 * v / max})`) : 'transparent'}">${v || ''}</td>`; }).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}

export function renderEvaluation(root) {
  const draw = () => {
    const have = Object.keys(live.preds).length === LABELED.length;
    const MS = have ? scoreTriage(live.preds) : null;
    const comb = have ? Object.fromEntries(LABELED.map(x => [x.id, merge(RULES[x.id], live.preds[x.id])])) : null;
    const CS = have ? scoreTriage(comb) : null;
    const severe = RS.misses.filter(m => m.urgency === 'urgent' && m.under);
    const avgMs = live.ms.length ? live.ms.reduce((a, b) => a + b, 0) / live.ms.length : 0;
    root.innerHTML = `
    <div class="h-page"><div><h2>Triage evaluation</h2><p>How well resident requests are routed: right team, right urgency. Scored on ${LABELED.length} labeled requests written the way residents write, ${hard.length} of them built to be hard. The offline rules run here; the live model runs with your own API key.</p></div></div>
    <div class="grid cols-4">
      ${kpi('check', 'Rules: right team', pct(RS.catAcc), `${pct(RS_T.catAcc)} on typical requests, ${pct(RS_H.catAcc)} on hard ones`)}
      ${kpi('alert', 'Rules: urgent caught', pct(RS.urgentRecall), `${RS.severeMisses} of ${RS.urgentN} urgent requests marked lower`)}
      ${kpi('trend', 'Help needed, marked lower', pct(RS.underRate), 'The error that matters most')}
      ${kpi('sparkles', 'Live model', have ? pct(MS.catAcc) : 'Not run', have ? `${pct(MS.urgentRecall)} of urgent caught` : 'Needs your API key')}
    </div>

    <div class="grid split" style="margin-top:16px">
      <div class="card"><div class="card-h"><h2>Rules, model, and both together</h2><span class="sub">Same ${LABELED.length} requests</span></div><div class="card-b">
        <div class="t-wrap"><table class="t"><thead><tr><th></th><th class="r">Rules</th><th class="r">Model</th><th class="r">Rules + model</th></tr></thead><tbody>${compareRows(MS, CS)}</tbody></table></div>
        <p class="small muted" style="margin:10px 0 0"><b>Rules + model</b> is how the product runs: the model chooses the team and writes the reply, and urgency can only go up from what the rules found, never down.</p>
        <div class="run-box">${live.running ? `<div class="row"><span class="spinner"></span><span class="small">Running ${live.done} of ${LABELED.length}…</span></div>`
          : llmReady() ? `<button class="btn primary" id="runModel">${ico('sparkles')}${have ? 'Run again' : `Run the ${LABELED.length} requests on ${esc(llm.model)}`}</button><span class="tiny muted">${LABELED.length} calls with your key, about ${LABELED.length * 400} tokens in total.</span>`
          : `<span class="small">${ico('key')} Add an Anthropic API key in <b>Settings</b> to run the live model on this set. The key stays in this tab.</span>`}
          ${have ? `<div class="tiny muted" style="margin-top:6px">${esc(live.model)} · ${live.tokensIn.toLocaleString()} tokens in, ${live.tokensOut.toLocaleString()} out · ${Math.round(avgMs)} ms per request on average${live.failed ? ` · ${live.failed} unusable replies counted as wrong` : ''}</div>` : ''}
        </div>
      </div></div>
      <div class="card"><div class="card-h"><h2>Urgent requests the rules marked lower</h2><span class="sub">${severe.length} of ${RS.urgentN}</span></div><div class="card-b">
        <div class="stack" style="gap:10px">${severe.map(m => `<div class="miss"><div class="small">“${esc(m.text)}”</div><div class="tiny"><span class="tag ok">Should be: ${tag(m)}</span> <span class="tag bad">Rules: ${tag(m.got)}</span>${have ? ` <span class="tag ${live.preds[m.id]?.urgency === 'urgent' ? 'ok' : 'bad'}">Model: ${tag(live.preds[m.id])}</span>` : ''}</div>${m.hard ? `<div class="tiny muted">${esc(m.hard)}</div>` : ''}</div>`).join('')}</div>
      </div></div>
    </div>

    <div class="grid split" style="margin-top:16px">
      <div class="card"><div class="card-h"><h2>Where the rules send things</h2><span class="sub">Green: right team · red: wrong team</span></div><div class="card-b">${matrix(RS)}
        <p class="small muted" style="margin:10px 0 0">Most wrong answers land in <b>Services</b>, the fallback when no keyword matches. That is where a request in unusual words goes, which is exactly where an older resident’s request often ends up.</p></div></div>
      <div class="card"><div class="card-h"><h2>What the results change</h2></div><div class="card-b">
        <ul class="small ev-list">
          <li><span class="tag ok">In the product</span><b>Urgency only goes up.</b> When the model runs, it can raise urgency above the rules but never lower it, so a keyword like “gas” always pages security.</li>
          <li><span class="tag">Next</span><b>Fallbacks get a person.</b> Anything that reaches Services only because nothing else matched should be shown to the desk within the hour, not left in a 3-day queue.</li>
          <li><span class="tag">Next</span><b>Words about a person beat words about a thing.</b> “The fan is broken and I fell” should go to care first, with the fan as a second work order.</li>
          <li><span class="tag">Next</span><b>The set grows from corrections.</b> Every time staff fix a team or raise an urgency, the request should join this set, so each new rule or model is tested on the cases that went wrong before.</li>
          <li><span class="tag ok">Rule</span><b>The release bar is urgent recall, not accuracy.</b> A change ships only if it catches at least as many urgent requests as today, even if overall accuracy goes up.</li>
        </ul>
      </div></div>
    </div>

    <div class="card" style="margin-top:16px"><div class="card-h"><h2>Every miss</h2><span class="sub">${RS.misses.length} requests the rules got wrong</span><div class="right"><button class="btn ghost sm" id="allMiss">Show all</button></div></div><div class="card-b">
      <div class="t-wrap"><table class="t"><thead><tr><th>Request</th><th>Should be</th><th>Rules</th>${have ? '<th>Model</th>' : ''}</tr></thead><tbody>
        ${RS.misses.map((m, i) => `<tr ${i >= 8 ? 'class="ev-more" hidden' : ''}><td class="small">${esc(m.text)}${m.hard ? `<div class="tiny muted">Hard case: ${esc(m.hard)}</div>` : ''}</td><td class="small nowrap">${tag(m)}</td><td class="small nowrap ${m.under ? 'bad-text' : ''}">${tag(m.got)}</td>${have ? `<td class="small nowrap">${tag(live.preds[m.id])}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>
      <p class="demo-note" style="margin-top:12px">The requests and labels are fictional and were written for this prototype; the scoring code is the real part and is unit-tested. Live model results are computed in your browser and are not saved.</p>
    </div></div>`;

    const run = $('#runModel', root);
    if (run) run.onclick = runModel;
    $('#allMiss', root).onclick = e => { const open = e.target.dataset.open === '1'; root.querySelectorAll('.ev-more').forEach(r => { r.hidden = open; }); e.target.dataset.open = open ? '' : '1'; e.target.textContent = open ? 'Show all' : 'Show fewer'; };
  };

  async function runModel() {
    Object.assign(live, { preds: {}, done: 0, failed: 0, tokensIn: 0, tokensOut: 0, ms: [], running: true, model: llm.model });
    draw();
    const queue = [...LABELED];
    const worker = async () => {
      while (queue.length && root.isConnected) {
        const x = queue.shift();
        try {
          const r = await askFull({ system: TRIAGE_SYSTEM, messages: [{ role: 'user', content: x.text }], maxTokens: 200 });
          live.tokensIn += r.usage.input_tokens || 0; live.tokensOut += r.usage.output_tokens || 0; live.ms.push(r.ms);
          const m = fromModel(extractJSON(r.text));
          if (m) live.preds[x.id] = m; else { live.failed++; live.preds[x.id] = { cat: 'services', urgency: 'normal' }; }
        } catch (e) {
          queue.length = 0; live.running = false; toast(e.message, 'alert'); draw(); return;
        }
        live.done++;
        const sp = root.querySelector('.run-box .small'); if (sp) sp.textContent = `Running ${live.done} of ${LABELED.length}…`;
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    live.running = false;
    if (root.isConnected) { draw(); if (Object.keys(live.preds).length === LABELED.length) toast('Model run finished', 'sparkles'); }
  }

  draw();
}
