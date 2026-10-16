// Resident app: what Mrs. Chen (78, lives alone) sees on her phone.
// Design rules: large type, one decision per screen, no forms, every action confirms in plain words.
import { $, toast, sheet } from '../lib/ui.js';
import { ico } from '../lib/icons.js';
import { esc, money, timeNow } from '../lib/format.js';
import { llm, llmReady, ask, extractJSON } from '../lib/llm.js';
import { store, log, pay, topUp, fileRequest, addTask, billTotal } from '../state.js';
import { R, ME, MENU, LUNCH_PRICE, BILL, DEALS, MERCHANTS } from '../domain/data.js';
import { triage, fromModel, merge, residentReply, TRIAGE_SYSTEM } from '../domain/triage.js';
import { offlineAnswer, systemPrompt, parseModelReply, ACTION_LABEL } from '../domain/assistant.js';
import { groupBuy } from '../domain/forecast.js';
import { feed, dealArt } from './shared.js';

const me = R[ME];
const ui = { tab: 'home', screen: 'home', pick: null, mode: null, lastReply: '', busy: false };
const S = () => store.data;
const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

// ------------------------------------------------------------------ voice input
const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
function listen(btn, input) {
  if (!Recognition) { toast('Voice input is not available in this browser. You can type instead.', 'mic'); return; }
  const rec = new Recognition(); rec.lang = 'en-US'; rec.interimResults = true;
  btn.classList.add('on');
  rec.onresult = e => { input.value = [...e.results].map(r => r[0].transcript).join(' '); };
  rec.onend = () => btn.classList.remove('on');
  rec.onerror = () => { btn.classList.remove('on'); toast('I could not hear that. Try again or type.', 'mic'); };
  rec.start();
}
function speak(text) {
  try { const u = new SpeechSynthesisUtterance(text); u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); }
  catch { toast('Read-aloud is not available in this browser', 'speaker'); }
}

// ------------------------------------------------------------------ screens
function homeScreen() {
  const s = S();
  if (ui.screen === 'lunch') return lunchScreen();
  if (ui.screen === 'report') return reportScreen();
  if (ui.screen === 'reported') return `<div class="done-msg"><b>Thank you.</b><br>${esc(ui.lastReply)}</div><button class="big calm" data-go="home">${ico('home')}Back to home</button>`;
  if (ui.screen === 'helped') return `<div class="done-msg alert"><b>The community desk has been told.</b><br>The care coordinator will call you in the next few minutes. If this is an emergency, call 911.</div><button class="big calm" data-go="home">${ico('home')}Back to home</button>`;
  const lunch = s.lunch ? MENU.find(m => m.id === s.lunch.id) : null;
  return `
    <div class="hello">${greet()}, ${me.name}</div><div class="date">${dateStr}</div>
    ${lunch
      ? `<div class="big done">${ico('check')}<span>Lunch ordered<small>${esc(lunch.name)}. ${s.lunch.mode === 'deliver' ? 'Arrives 11:30 to 12:15.' : 'Your seat is saved from 11:30.'}</small></span></div>`
      : `<button class="big" data-go="lunch">${ico('utensils')}<span>Order today’s lunch<small>3 soft meals, ${money(LUNCH_PRICE.senior)}</small></span></button>`}
    <button class="big calm" data-go="report">${ico('wrench')}<span>Report a problem<small>Say it in your own words</small></span></button>
    <div class="pair">
      ${s.checkedIn ? `<div class="big done">${ico('check')}<span>Checked in<small>Your ${me.family} can see it</small></span></div>` : `<button class="big okay" data-go="ok">${ico('heart')}<span>I’m OK today</span></button>`}
      <button class="big help" data-go="help">${ico('phone')}<span>I need help</span></button>
    </div>
    <div class="notice"><b>From the community desk</b><span id="noticeText">Free flu shots in the canteen on Thursday, 10 to 12. Bring your ID card.</span><br><button class="linkbtn" data-go="speak">${ico('speaker')}Read this aloud</button></div>
    <label class="toggle"><span>Weekday lunch, same as usual</span><span class="switch"><input type="checkbox" id="planToggle" ${s.mealPlan ? 'checked' : ''} aria-label="Weekday lunch plan"></span></label>`;
}

function lunchScreen() {
  const price = LUNCH_PRICE.senior + (ui.mode === 'deliver' ? LUNCH_PRICE.delivery : 0);
  return `<button class="linkbtn" data-go="home">${ico('back')}Back</button><div class="m-title">Today’s lunch</div>
    <div>${MENU.map(m => `<button class="choice" data-pick="${m.id}" aria-pressed="${ui.pick === m.id}"><b>${esc(m.name)}</b>${esc(m.side)}. Soft and easy to chew.</button>`).join('')}</div>
    <div class="pair">
      <button class="choice" data-mode="dine" aria-pressed="${ui.mode === 'dine'}"><b>Eat at the canteen</b>${money(LUNCH_PRICE.senior)}</button>
      <button class="choice" data-mode="deliver" aria-pressed="${ui.mode === 'deliver'}"><b>Bring it to me</b>${money(LUNCH_PRICE.senior + LUNCH_PRICE.delivery)}</button>
    </div>
    <button class="big ${ui.pick && ui.mode ? '' : 'calm'}" data-go="payLunch" ${ui.pick && ui.mode ? '' : 'disabled'}>${ico('wallet')}<span>${ui.pick && ui.mode ? `Pay ${money(price)}` : 'Pick a meal and how to get it'}<small>From your wallet, ${money(S().wallet)} left</small></span></button>`;
}

function reportScreen() {
  return `<button class="linkbtn" data-go="home">${ico('back')}Back</button><div class="m-title">What’s wrong?</div>
    <textarea class="bigtext" id="reportText" aria-label="Describe the problem" placeholder="For example: the light in my bathroom is broken"></textarea>
    <div class="row"><button class="btn secondary mic" data-go="mic" style="font-size:16px;padding:12px 16px">${ico('mic')}Speak instead</button></div>
    <div class="chips">${['Water is leaking from my bathroom ceiling', 'The hallway light is broken', 'I was charged twice this month'].map(x => `<button data-ex="${esc(x)}">${x}</button>`).join('')}</div>
    <button class="big" data-go="send" ${ui.busy ? 'disabled' : ''}>${ico('send')}<span>${ui.busy ? 'Sending…' : 'Send'}</span></button>`;
}

function shopScreen() {
  const s = S();
  return `<div class="m-title">Group buys this week</div>
    <p class="small muted" style="margin:-6px 0 0;font-size:15px">Neighbors buy together for a lower price. Pick up at the front desk on Friday.</p>
    ${DEALS.map(d => {
      const sold = s.sold[d.id], mine = s.mine[d.id] || 0, left = d.windowH - d.elapsedH;
      const ok = sold >= d.minGroup;
      return `<div class="deal">${dealArt(d.emoji)}<div>
        <h4>${esc(d.name)}</h4><div class="tiny muted">${esc(MERCHANTS[d.merchant].name)}</div>
        <div style="margin:4px 0"><span class="price">${money(d.price)}</span><span class="was">${money(d.retail)}</span></div>
        <div class="progress" style="margin:8px 0 4px"><i style="width:${Math.min(100, sold / d.minGroup * 100)}%;background:${ok ? 'var(--leaf)' : 'var(--brand)'}"></i></div>
        <div class="tiny muted">${ok ? `${sold} joined. The deal is on.` : `${sold} of ${d.minGroup} needed`}, ${left} hours left</div>
        <div class="row" style="margin-top:10px;justify-content:space-between">${mine ? `<span class="badge green">${ico('check')}You have ${mine}</span>` : '<span></span>'}<button class="btn primary" data-join="${d.id}" style="font-size:15px">${ico('plus')}Join</button></div>
      </div></div>`;
    }).join('')}`;
}

function billsScreen() {
  const s = S(), total = billTotal();
  return `<div class="balance"><div style="font-size:15px;opacity:.85">My wallet</div><div class="amt">${money(s.wallet)}</div>
      <button class="btn" data-go="askTopUp">${ico('users')}Ask my ${me.family} to add money</button></div>
    <div class="m-card"><div class="row" style="justify-content:space-between"><b style="font-size:18px">${BILL.period} property bill</b>${s.billPaid ? '<span class="badge green">Paid</span>' : `<span class="badge amber">Due ${BILL.due}</span>`}</div>
      ${BILL.lines.map(([l, a]) => `<div class="line"><span>${l}</span><span class="num">${money(a)}</span></div>`).join('')}
      <div class="line total"><span>Total</span><span class="num">${money(total)}</span></div>
      ${s.billPaid ? '' : `<button class="big" data-go="payBill" style="margin-top:10px">${ico('wallet')}<span>Pay ${money(total)}<small>From your wallet</small></span></button>`}
    </div>
    <div class="m-card"><b style="font-size:18px">Recent</b>${s.txns.slice(0, 6).map(t => `<div class="txn"><span>${esc(t.label)}<br><span class="tiny muted">${t.t}</span></span><span class="amt" style="color:${t.amount > 0 ? 'var(--leaf)' : 'inherit'}">${t.amount > 0 ? '+' : ''}${money(t.amount)}</span></div>`).join('')}</div>`;
}

function assistantScreen() {
  const s = S();
  return `<div class="row" style="justify-content:space-between"><div class="m-title">Ask anything</div><span class="badge ${llmReady() ? 'green' : ''}">${llmReady() ? 'Live AI' : 'Offline answers'}</span></div>
    <div class="chat" id="chat">${s.chat.map((m, i) => `<div class="bubble ${m.from}">${esc(m.text)}${m.via ? `<span class="via">${m.via}</span>` : ''}${m.action && m.action.type !== 'none' && !m.used ? `<button class="btn primary sm" data-act="${i}">${ACTION_LABEL[m.action.type]}</button>` : ''}</div>`).join('')}
    ${ui.busy ? '<div class="bubble bot"><span class="typing"><i></i><i></i><i></i></span></div>' : ''}</div>
    <div class="chips">${['When is lunch?', 'How much is my bill?', 'My hallway light is broken'].map(x => `<button data-q="${x}">${x}</button>`).join('')}</div>`;
}

// ------------------------------------------------------------------ paint
let root;
function paint() {
  if (!root?.isConnected) return;
  const screen = { home: homeScreen, shop: shopScreen, bills: billsScreen, assistant: assistantScreen }[ui.tab]();
  $('#appScroll', root).innerHTML = screen;
  $('#composer', root).hidden = ui.tab !== 'assistant';
  root.querySelectorAll('.tabbar button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false'));
  $('#feed', root).innerHTML = feed(S().activity, 'Nothing yet. Order a lunch, report a problem or ask the assistant. Everything that happens behind the scenes shows up here.');
  if (ui.tab === 'assistant') { const sc = $('#appScroll', root); sc.scrollTop = sc.scrollHeight; }
}

export function renderResident(el) {
  root = el;
  el.innerHTML = `
  <div class="h-page"><div><h2>${me.name}’s phone</h2><p>${me.name} is ${me.age} and lives alone in ${me.apt}. Big buttons, one decision per screen, and nothing to fill in. Try it; the right side shows where each tap goes.</p></div></div>
  <div class="resident-layout">
    <div class="phone"><div class="phone-screen" id="phoneScreen">
      <div class="status-bar"><span>9:41</span><span class="notch"></span><span>100%</span></div>
      <div class="app-scroll" id="appScroll" aria-live="polite"></div>
      <form class="composer" id="composer" hidden><button type="button" class="btn secondary icon mic" data-go="micChat" aria-label="Speak">${ico('mic')}</button><input id="chatInput" placeholder="Type or speak a question" aria-label="Question" autocomplete="off"><button class="btn primary icon" aria-label="Send">${ico('send')}</button></form>
      <nav class="tabbar" aria-label="App sections">
        ${[['home', 'home', 'Home'], ['shop', 'bag', 'Shop'], ['bills', 'receipt', 'Bills'], ['assistant', 'chat', 'Ask']].map(([k, i, l]) => `<button data-tab="${k}">${ico(i)}${l}</button>`).join('')}
      </nav>
    </div></div>
    <div class="stack"><div class="row"><h3 style="margin:0;font-weight:600">Behind the scenes</h3><span class="small muted">Live, as other parts of the system react</span></div><div id="feed"></div></div>
  </div>`;

  el.onclick = onClick;
  el.onchange = e => {
    if (e.target.id !== 'planToggle') return;
    const on = e.target.checked;
    store.update(s => { s.mealPlan = on; });
    log('utensils', on ? `<b>Canteen</b>: ${me.name} joined the weekday lunch plan. A skipped lunch without a pause now counts on the care watchlist.` : `<b>Canteen</b>: ${me.name} left the weekday lunch plan.`);
  };
  $('#composer', el).onsubmit = e => { e.preventDefault(); const v = $('#chatInput', el).value.trim(); if (v) { $('#chatInput', el).value = ''; askAssistant(v); } };
  const off = store.onChange(paint);
  paint();
  return () => { off(); speechSynthesis?.cancel?.(); };
}

// ------------------------------------------------------------------ actions
function go(tab, screen = 'home') { ui.tab = tab; ui.screen = screen; paint(); $('#appScroll', root).scrollTop = 0; }

async function onClick(e) {
  const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
  if (b.dataset.tab) return go(b.dataset.tab);
  if (b.dataset.pick) { ui.pick = b.dataset.pick; return paint(); }
  if (b.dataset.mode) { ui.mode = b.dataset.mode; return paint(); }
  if (b.dataset.ex) { $('#reportText', root).value = b.dataset.ex; return; }
  if (b.dataset.q) return askAssistant(b.dataset.q);
  if (b.dataset.join) return joinDeal(b.dataset.join);
  if (b.dataset.act) return runAction(+b.dataset.act);
  const g = b.dataset.go; if (!g) return;
  if (g === 'home') return go('home');
  if (g === 'lunch') { ui.pick = null; ui.mode = null; return go('home', 'lunch'); }
  if (g === 'report') return go('home', 'report');
  if (g === 'mic') return listen(b, $('#reportText', root));
  if (g === 'micChat') return listen(b, $('#chatInput', root));
  if (g === 'speak') return speak($('#noticeText', root).textContent);
  if (g === 'payLunch') return payLunch();
  if (g === 'send') return sendReport($('#reportText', root).value.trim());
  if (g === 'ok') {
    store.update(s => { s.checkedIn = true; });
    log('heart', `<b>Care</b>: ${me.name} checked in at ${timeNow()}. Her ${me.family}’s app shows “OK today”.`);
    return toast('Thank you. Have a good day.');
  }
  if (g === 'help') return pressHelp();
  if (g === 'payBill') return payBill();
  if (g === 'askTopUp') {
    toast(`Request sent to your ${me.family}`, 'users');
    log('users', `<b>Family app</b>: ${me.name}’s ${me.family} got a request to add money.`);
    setTimeout(() => { topUp(50, `your ${me.family}`); log('wallet', `<b>Wallet</b>: her ${me.family} added ${money(50)}.`); toast(`Your ${me.family} added ${money(50)}`, 'wallet'); }, 1400);
  }
}

function payLunch() {
  const m = MENU.find(x => x.id === ui.pick), deliver = ui.mode === 'deliver';
  const amount = LUNCH_PRICE.senior + (deliver ? LUNCH_PRICE.delivery : 0);
  const res = pay({ kind: 'lunch', amount, label: `Lunch, ${m.name.toLowerCase()}`, delivery: deliver ? LUNCH_PRICE.delivery : 0 });
  if (!res.ok) return toast(res.reason + ' Ask your family to add money on the Bills tab.', 'alert');
  store.update(s => { s.lunch = { id: m.id, mode: ui.mode, price: amount }; });
  log('utensils', `<b>Canteen</b> received an order: ${esc(m.name)}, ${deliver ? `delivery to ${me.apt}` : 'dine-in'}, paid ${money(amount)}.`);
  if (deliver) {
    addTask({ kind: 'Delivery', text: `Lunch to ${me.name}, ${me.apt} (soft food)`, rid: me.id });
    log('truck', '<b>Volunteers</b> see a new delivery for Building C.');
  }
  go('home');
  toast('Lunch ordered');
}

async function sendReport(text) {
  if (!text) { $('#reportText', root).focus(); return toast('Type, speak or pick what is wrong first', 'alert'); }
  let t = triage(text), via = 'rules';
  if (llmReady()) {
    ui.busy = true; paint(); $('#reportText', root).value = text;
    try {
      const m = fromModel(extractJSON(await ask({ system: TRIAGE_SYSTEM, messages: [{ role: 'user', content: text }], maxTokens: 300 })));
      if (m) { t = merge(t, m); via = 'model'; }
    } catch (err) { toast(err.message + ' Used the offline triage instead.', 'alert'); }
    ui.busy = false;
  }
  fileRequest(text, t);
  ui.lastReply = t.reply || residentReply(t);
  log('wrench', `<b>Property desk</b> queue: “${esc(text)}” → <b>${t.label}</b>, <b>${t.urgency}</b>, to ${t.owner}${via === 'model' ? ' (Claude)' : ''}.`);
  go('home', 'reported');
}

function pressHelp() {
  fileRequest('Pressed "I need help" on the home screen', { cat: 'care', label: 'Care', owner: 'Care coordinator', urgency: 'urgent', conf: 1, cues: [], source: 'button' }, { src: 'Help button' });
  log('phone', `<b>Care</b>: urgent alert from ${me.name}. The care coordinator is calling her, and her ${me.family} was notified.`);
  go('home', 'helped');
}

function payBill() {
  const total = billTotal();
  const res = pay({ kind: 'bill', amount: total, label: `${BILL.period} property bill` });
  if (!res.ok) return toast(res.reason + ' Ask your family to add money first.', 'alert');
  store.update(s => { s.billPaid = true; });
  log('receipt', `<b>Property company</b> received ${money(res.parts[0].amount)} for ${me.apt}. Platform payment fee ${money(res.parts[1].amount)}.`);
  sheet($('#phoneScreen', root), `<div class="m-title">Bill paid</div><p style="margin:0;font-size:17px">${money(total)} for ${BILL.period}. A receipt is saved under Recent.</p>
    <div class="split-list"><b>Where the money goes</b>${res.parts.map(p => `<div class="line"><span>${p.to}</span><span class="num">${money(p.amount)}</span></div>`).join('')}</div>
    <button class="big calm" data-close>Done</button>`);
}

function joinDeal(id) {
  const d = DEALS.find(x => x.id === id);
  let qty = 1;
  sheet($('#phoneScreen', root), `<div class="row" style="gap:12px">${dealArt(d.emoji)}<div><b style="font-size:19px">${esc(d.name)}</b><div class="small muted">${esc(MERCHANTS[d.merchant].name)}, pick up Friday</div></div></div>
    <div class="row" style="justify-content:space-between"><span style="font-size:18px">How many?</span><span class="qty"><button data-qty="-1" aria-label="Fewer">${ico('minus')}</button><b id="qn">1</b><button data-qty="1" aria-label="More">${ico('plus')}</button></span></div>
    <button class="big" id="joinPay">${ico('wallet')}<span>Pay <span id="qt">${money(d.price)}</span><small>Refunded if the group doesn’t fill</small></span></button>`, {
    onMount(sh, close) {
      sh.addEventListener('click', e => {
        const q = e.target.closest('[data-qty]'); if (q) { qty = Math.max(1, Math.min(5, qty + +q.dataset.qty)); $('#qn', sh).textContent = qty; $('#qt', sh).textContent = money(d.price * qty); }
      });
      $('#joinPay', sh).onclick = () => {
        const before = S().sold[id];
        const res = pay({ kind: 'groupbuy', amount: Math.round(d.price * qty * 100) / 100, label: `Group buy, ${d.name.toLowerCase()} ×${qty}` });
        if (!res.ok) { close(); return toast(res.reason, 'alert'); }
        store.update(s => { s.sold[id] += qty; s.mine[id] = (s.mine[id] || 0) + qty; });
        const g = groupBuy({ ...d, sold: S().sold[id] });
        log('store', `<b>${esc(MERCHANTS[d.merchant].name)}</b>: ${qty} more ${esc(d.name.toLowerCase())}. Forecast now ${Math.round(g.f)}, stock ${g.stock}. Merchant gets ${money(res.parts[0].amount)}, commission ${money(res.parts[1].amount)}.`);
        if (before < d.minGroup && S().sold[id] >= d.minGroup) log('users', `<b>Group buy</b>: ${esc(d.name)} reached its minimum of ${d.minGroup}. The deal is on.`);
        close(); toast('You joined the group buy');
      };
    },
  });
}

async function askAssistant(q) {
  if (ui.busy) return;
  store.update(s => { s.chat.push({ from: 'me', text: q }); });
  let ans;
  if (llmReady()) {
    ui.busy = true; paint();
    try {
      const history = S().chat.slice(-8).map(m => ({ role: m.from === 'me' ? 'user' : 'assistant', content: m.text }));
      while (history.length && history[0].role !== 'user') history.shift();
      const text = await ask({ system: systemPrompt(me), messages: history, maxTokens: 400 });
      ans = parseModelReply(extractJSON(text), text);
    } catch (err) { ans = { ...offlineAnswer(q), via: `Offline answer (${err.message})` }; }
    ui.busy = false;
  } else ans = offlineAnswer(q);
  if (ans.action?.type === 'file_request' && !ans.action.text) ans.action.text = q;
  const via = ans.via || (ans.source === 'model' ? `Claude (${llm.model})` : 'Offline answer from the community handbook');
  store.update(s => { s.chat.push({ from: 'bot', text: ans.reply, action: ans.action, via }); s.chat = s.chat.slice(-30); });
}

function runAction(i) {
  const m = S().chat[i]; if (!m?.action) return;
  store.update(s => { s.chat[i].used = true; });
  const { type, text } = m.action;
  if (type === 'order_lunch') return go('home', 'lunch');
  if (type === 'open_bills') return go('bills');
  if (type === 'open_shop') return go('shop');
  if (type === 'help') return pressHelp();
  if (type === 'file_request') {
    const prev = [...S().chat].slice(0, i).reverse().find(x => x.from === 'me');
    const req = text || prev?.text || 'Question from the assistant';
    const t = triage(req);
    fileRequest(req, t, { src: 'Assistant' });
    log('wrench', `<b>Property desk</b> queue: “${esc(req)}” → <b>${t.label}</b>, <b>${t.urgency}</b>, to ${t.owner} (filed from the assistant).`);
    store.update(s => { s.chat.push({ from: 'bot', text: residentReply(t) }); });
  }
}
