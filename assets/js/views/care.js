// Care: residents to check on today, with the reasons, and volunteer tasks.
import { $, toast } from '../lib/ui.js';
import { ico } from '../lib/icons.js';
import { esc } from '../lib/format.js';
import { store, log, addTask, fileRequest } from '../state.js';
import { RESIDENTS, ME, COMMUNITY } from '../domain/data.js';
import { watchlist, THRESHOLD } from '../domain/wellbeing.js';
import { triage } from '../domain/triage.js';
import { signalStrip, kpi } from './shared.js';

let root;
const live = r => (r.id === ME ? { ...r, mealPlan: store.data.mealPlan, checkins: store.data.checkedIn ? [...r.checkins.slice(0, -1), 1] : r.checkins } : r);
const ctxFor = r => ({ mealPaused: !!store.data.mealPaused[r.id], checkedInToday: r.id === ME && store.data.checkedIn });
export const currentWatchlist = () => watchlist(RESIDENTS.map(live), ctxFor, store.data.dismissed);

function flagRow(f) {
  const s = store.data, r = f.r;
  const hasTask = s.tasks.some(t => t.rid === r.id && t.kind === 'Check-in' && t.status !== 'done');
  return `<div class="flag">
    <div class="score ${f.level}" aria-label="Risk score ${f.score}">${f.score}</div>
    <div><div class="row wrap"><b>${esc(r.name)}</b><span class="muted small">${r.apt}, ${r.age}${r.alone ? ', lives alone' : ''}</span><span class="pill ${f.level === 'high' ? 'highrisk' : 'medium'}">${f.level === 'high' ? 'High' : 'Medium'}</span></div>
      <ul class="reasons">${f.reasons.map(x => `<li><span class="pts">+${x.pts}</span>${esc(x.text)}</li>`).join('')}</ul>
      ${signalStrip(r)}</div>
    <div class="act">
      ${hasTask ? '<span class="pill ok">Volunteer check-in sent</span>' : `<button class="btn primary sm" data-checkin="${r.id}">${ico('users')}Send a volunteer</button>`}
      ${r.family ? `<button class="btn secondary sm" data-call="${r.id}">${ico('phone')}Call ${r.family}</button>` : ''}
      ${r.mealPlan && !s.mealPaused[r.id] ? `<button class="btn secondary sm" data-pause="${r.id}">${ico('utensils')}Pause meal plan</button>` : ''}
      <button class="btn ghost sm" data-dismiss="${r.id}">Dismiss for today</button>
    </div></div>`;
}

function taskRow(t) {
  if (t.status === 'done') return `<div class="task done"><div><span class="k">${t.kind}</span><div>${esc(t.text)}</div><div class="tiny">${esc(t.note || '')}</div></div><span class="pill ok">Done</span></div>`;
  return `<div class="task"><div><span class="k">${t.kind}${t.status === 'claimed' ? ', claimed by Ana (volunteer)' : ''}</span><div>${esc(t.text)}</div></div>
    ${t.status === 'open' ? `<button class="btn sm" data-claim="${t.id}">Claim</button>` : `<div class="row"><select class="select sm" data-note="${t.id}" aria-label="Outcome"><option>All fine</option><option>Needs follow-up</option><option>No answer</option></select><button class="btn ok sm" data-done="${t.id}">Done</button></div>`}</div>`;
}

function paint() {
  if (!root?.isConnected) return;
  const s = store.data, list = currentWatchlist();
  const sensors = RESIDENTS.filter(r => r.sensor).length, plans = RESIDENTS.filter(r => (r.id === ME ? s.mealPlan : r.mealPlan)).length;
  $('#kpis', root).innerHTML = [
    kpi('heart', 'To check on today', list.length, `${list.filter(x => x.level === 'high').length} high`),
    kpi('door', 'Door sensors', sensors, `of ${RESIDENTS.length} enrolled residents`),
    kpi('utensils', 'On a lunch plan', plans, 'a skipped lunch is a signal'),
    kpi('users', 'Open volunteer tasks', s.tasks.filter(t => t.status !== 'done').length, 'deliveries, visits, errands'),
  ].join('');
  $('#flags', root).innerHTML = list.length ? list.map(flagRow).join('') : '<div class="empty">No one needs a check-in right now.</div>';
  $('#tasks', root).innerHTML = s.tasks.length ? s.tasks.map(taskRow).join('') : '<div class="empty">No tasks.</div>';
}

export function renderCare(el) {
  root = el;
  el.innerHTML = `
  <div class="h-page"><div><h2>Care</h2><p>${COMMUNITY.over65} residents over 65 at ${COMMUNITY.name}; ${RESIDENTS.length} have enrolled in check-ins. The watchlist flags a resident when a daily routine breaks. Each point in the score comes from a named signal, nobody is contacted automatically, and every flag ends with a person deciding.</p></div></div>
  <div class="grid cols-4" id="kpis"></div>
  <div class="grid split" style="margin-top:16px">
    <div class="card"><div class="card-h"><h2>Residents to check on</h2><span class="sub">Score ≥ ${THRESHOLD.medium}, highest first</span></div><div class="card-b" id="flags"></div></div>
    <div class="stack">
      <div class="card"><div class="card-h"><h2>Volunteer tasks</h2></div><div class="card-b" id="tasks"></div></div>
      <div class="card"><div class="card-h"><h2>How the score works</h2></div><div class="card-b small">
        <div class="list-item"><span class="pts strong">+35</span>Subscribed lunch missed 2+ days in a row, plan not paused (+10 for 1 day)</div>
        <div class="list-item"><span class="pts strong">+45</span>No front-door activity today against a usual 3+ a day (+20 if activity is under 45% of usual for 2 days)</div>
        <div class="list-item"><span class="pts strong">+15–30</span>No “I’m OK” check-in for 2+ days, rising each day</div>
        <div class="list-item"><span class="pts strong">+10 / +5</span>Lives alone / age 85+, counted only when another signal fired</div>
        <p class="muted" style="margin:8px 0 0">Medium from ${THRESHOLD.medium}, high from ${THRESHOLD.high}. Signals come from the canteen, door sensors and the resident app. No cameras, no location tracking.</p>
      </div></div>
    </div>
  </div>`;
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const r = RESIDENTS.find(x => x.id === (b.dataset.checkin || b.dataset.call || b.dataset.pause || b.dataset.dismiss));
    if (b.dataset.checkin) {
      const f = currentWatchlist().find(x => x.r.id === r.id);
      addTask({ kind: 'Check-in', rid: r.id, text: `Knock on ${r.name}’s door, ${r.apt}. ${f ? f.reasons[0].text : ''}.` });
      log('users', `<b>Care</b>: volunteer check-in requested for ${esc(r.name)}, ${r.apt}.`); toast('Check-in sent to volunteers');
    }
    if (b.dataset.call) { log('phone', `<b>Care</b>: coordinator called ${esc(r.name)}’s ${r.family}.`); toast(`Calling ${r.name}’s ${r.family}…`, 'phone'); }
    if (b.dataset.pause) { store.update(s => { s.mealPaused[r.id] = true; }); log('utensils', `<b>Canteen</b>: ${esc(r.name)}’s lunch plan paused by the care coordinator.`); toast('Meal plan paused'); }
    if (b.dataset.dismiss) { store.update(s => { s.dismissed[r.id] = true; }); toast('Dismissed until tomorrow'); }
    if (b.dataset.claim) { store.update(s => { s.tasks.find(t => t.id === b.dataset.claim).status = 'claimed'; }); toast('Claimed by Ana'); }
    if (b.dataset.done) {
      const id = b.dataset.done, note = $(`select[data-note="${id}"]`, root).value;
      const t = store.data.tasks.find(x => x.id === id);
      store.update(s => { Object.assign(s.tasks.find(x => x.id === id), { status: 'done', note }); if (t.kind === 'Check-in' && note === 'All fine') s.dismissed[t.rid] = true; });
      if (t.kind === 'Delivery' && t.rid === ME) log('truck', `<b>Volunteer</b> delivered ${esc(t.text.split(',')[0].replace('Lunch to ', ''))}’s lunch. Note: ${note}.`);
      if (note !== 'All fine') {
        const text = `${t.text.split('.')[0]}: ${note.toLowerCase()}`;
        fileRequest(text, note === 'No answer' ? { ...triage('not answering'), cat: 'care', label: 'Care', owner: 'Care coordinator', urgency: 'urgent' } : { ...triage(text), cat: 'care', label: 'Care', owner: 'Care coordinator', urgency: 'high' }, { who: 'Volunteer Ana', src: t.kind });
        log('alert', `<b>Work orders</b>: follow-up from a volunteer, “${esc(text)}”.`);
        toast('Follow-up sent to the desk', 'alert');
      } else toast('Marked done');
    }
  };
  const off = store.onChange(paint);
  paint();
  return off;
}
