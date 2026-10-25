// Product metrics: the north star, what drives it, the request funnel, health tiles and guardrails.
import { esc } from '../lib/format.js';
import { ico } from '../lib/icons.js';
import { lineChart, sparkline } from '../lib/charts.js';
import { COMMUNITY } from '../domain/data.js';
import { weeklyHistory, FUNNEL, GUARDRAILS, DEFINITIONS, AI_TRIAGE_WEEK, STORM_WEEK } from '../domain/metrics.js';
import { kpi } from './shared.js';

const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
let W = null;

function tile(icon, key, label, fmt, { better = 'up', note = null, why = '', deltaText = '' } = {}) {
  const series = W.map(w => w[key]), cur = series.at(-1), prev = series[0];
  const diff = cur - prev, good = better === 'up' ? diff >= 0 : diff <= 0;
  return `<div class="card m-tile"><div class="label">${ico(icon)}${esc(label)}</div>
    <div class="m-row"><div class="value">${fmt(cur)}</div>${sparkline(series, { color: good ? 'var(--brand)' : 'var(--rose)', note })}</div>
    <div class="m-delta ${good ? 'good' : 'bad'}">${deltaText || `${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))} vs week 1`}</div>
    <div class="tiny muted">${why}</div></div>`;
}

export function renderMetrics(root) {
  W = W || weeklyHistory();
  const first = W[0], last = W.at(-1), top = FUNNEL[0][1];
  const drops = FUNNEL.slice(1).map(([l, n], i) => [l, 1 - n / FUNNEL[i][1]]);
  const worst = drops.reduce((a, b) => (b[1] > a[1] ? b : a));
  root.innerHTML = `
  <div class="h-page"><div><h2>Product metrics</h2><p>${esc(COMMUNITY.name)}, ${COMMUNITY.households} households, over the last 8 weeks. One number to steer by, the few that move it, and the ones that must not get worse. <span class="tag">Simulated 8-week baseline</span></p></div></div>

  <div class="grid cols-4">
    ${kpi('check', 'Resolved within deadline', pct(last.onTime), `North star · was ${pct(first.onTime)} in week 1`)}
    ${kpi('sparkles', 'AI override rate', pct(last.override), `was ${pct(first.override)}; model triage from week ${AI_TRIAGE_WEEK + 1}`)}
    ${kpi('clock', 'Hours to assign', last.hoursToAssign.toFixed(1) + ' h', `median · was ${first.hoursToAssign.toFixed(1)} h`)}
    ${kpi('users', 'Active households', pct(last.activeHouseholds / COMMUNITY.households, 0), `${last.activeHouseholds} of ${COMMUNITY.households} used the app this week`)}
  </div>

  <div class="grid split" style="margin-top:16px">
    <div class="card"><div class="card-h"><h2>North star: resolved within deadline</h2><span class="sub">Done before the deadline and not reopened within 7 days</span></div><div class="card-b">
      ${lineChart(W.map(w => w.onTime), { unit: '%', label: 'Weekly share of requests resolved within deadline', note: { at: AI_TRIAGE_WEEK, text: 'model triage' } })}
      <p class="small" style="margin:10px 0 0"><b>Why this number.</b> It is what a resident actually feels (was it fixed, and in time) and what the property company is paid for. Requests filed only measures demand; app logins measure reach. Counting a reopened request as a miss stops the number rising by closing early. The dip in week ${STORM_WEEK + 1} is a storm: ${W[STORM_WEEK].requests} requests against a usual ~160, while urgent ones still met their 4-hour deadline.</p>
    </div></div>
    <div class="card"><div class="card-h"><h2>What moves it</h2><span class="sub">Driver tree</span></div><div class="card-b">
      <div class="tree">
        <div class="node root">${ico('check')}Resolved within deadline <b>${pct(last.onTime, 0)}</b></div>
        <div class="kids">
          <div class="node">${ico('sparkles')}Right team first time<span class="tiny muted">AI override ${pct(last.override, 0)}</span></div>
          <div class="node">${ico('clock')}Assigned fast<span class="tiny muted">${last.hoursToAssign.toFixed(1)} h median</span></div>
          <div class="node">${ico('wrench')}Fixed on the first visit<span class="tiny muted">Reopen rate ${pct(last.reopen, 0)}</span></div>
          <div class="node">${ico('users')}Enough people on shift<span class="tiny muted">Staffing vs forecast volume</span></div>
        </div>
      </div>
      <p class="small muted" style="margin:10px 0 0">The product owns the first two outright and helps the third (photos and the part needed travel with the order). Staffing is the property manager’s call; the product gives them the forecast.</p>
    </div></div>
  </div>

  <div class="grid split" style="margin-top:16px">
    <div class="card"><div class="card-h"><h2>Request funnel</h2><span class="sub">This month</span></div><div class="card-b">
      <div class="stack" style="gap:10px">${FUNNEL.map(([label, n], i) => `<div class="fn"><div class="fn-row small"><span>${esc(label)}</span><b>${n}</b><span class="muted">${i ? pct(n / FUNNEL[i - 1][1], 0) + ' kept' : ''}</span></div><div class="fn-bar"><i style="width:${(n / top * 100).toFixed(1)}%"></i></div></div>`).join('')}</div>
      <p class="small" style="margin:12px 0 0"><b>Where to work.</b> The biggest drop is at <b>${esc(worst[0].toLowerCase())}</b> (${pct(worst[1], 0)} lost). Most are residents who never reply; a one-tap “fixed / not fixed” in the app notification, with a photo of the finished job, is the next experiment.</p>
    </div></div>
    <div class="card"><div class="card-h"><h2>Guardrails</h2><span class="sub">Must not get worse while the north star improves</span></div><div class="card-b">
      <div class="stack" style="gap:10px">${GUARDRAILS.map(g => `<div class="guard"><span class="tag ${g.ok ? 'ok' : 'bad'}">${g.ok ? 'OK' : 'Breach'}</span><div><div class="small"><b>${esc(g.name)}</b>: ${esc(g.value)} <span class="muted">(target ${esc(g.target)})</span></div><div class="tiny muted">${esc(g.note)}</div></div></div>`).join('')}</div>
    </div></div>
  </div>

  <h3 class="m-h">Health</h3>
  <div class="grid cols-3">
    ${tile('sparkles', 'override', 'AI override rate', v => pct(v), { better: 'down', note: AI_TRIAGE_WEEK, deltaText: `${pct(W[0].override - W.at(-1).override)} points lower than week 1`, why: 'Fell by half when the model started choosing the team (dashed line). Every override joins the evaluation set.' })}
    ${tile('clock', 'hoursToAssign', 'Hours to assign', v => v.toFixed(1) + ' h', { better: 'down', note: AI_TRIAGE_WEEK, why: 'Median filing → named person. The storm week is the bump.' })}
    ${tile('refresh', 'reopen', 'Reopen rate', v => pct(v), { better: 'down', deltaText: `${pct(W[0].reopen - W.at(-1).reopen)} points lower than week 1`, why: 'Reopened within 7 days. Counts as a miss on the north star.' })}
    ${tile('bell', 'requests', 'Requests filed', v => String(Math.round(v)), { better: 'up', deltaText: `Peak ${Math.max(...W.map(w => w.requests))} in the storm week`, why: 'Demand, not a goal. Used for staffing and to read the other numbers.' })}
    ${tile('alert', 'urgentOnTime', 'Urgent answered within 4 h', v => pct(v, 0), { deltaText: `Lowest week ${pct(Math.min(...W.map(w => w.urgentOnTime)), 0)}, target 95%`, why: 'Also a guardrail. Held through the storm.' })}
    ${tile('heart', 'checkinsMissed', 'Over-65 check-ins missed', v => String(Math.round(v)), { better: 'down', deltaText: 'Each one followed up the same day', why: 'Not a target to push to zero: it shows the alert works.' })}
  </div>

  <div class="card" style="margin-top:16px"><div class="card-h"><h2>Definitions</h2><span class="sub">What each number means and how it could mislead</span></div><div class="card-b">
    <div class="t-wrap"><table class="t"><thead><tr><th>Metric</th><th>How it is counted</th><th>Why it matters</th><th>How it could mislead</th></tr></thead><tbody>
      ${DEFINITIONS.map(([m, how, why, trap]) => `<tr><td class="small"><b>${esc(m)}</b></td><td class="small">${esc(how)}</td><td class="small">${esc(why)}</td><td class="small muted">${esc(trap)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="demo-note" style="margin-top:12px">The 8-week history is simulated from a fixed seed, so every visitor sees the same numbers. The metric choices, definitions and guardrails are the real product thinking; triage quality has its own page, <a href="#/evaluation">Triage evaluation</a>.</p>
  </div></div>`;
}
