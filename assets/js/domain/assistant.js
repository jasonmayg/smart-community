// Community assistant for residents.
// Offline: retrieval over a small knowledge base. Live: a language model grounded in the same
// knowledge base, asked to return a reply plus at most one suggested action the app can perform
// after the resident confirms. The model never acts on its own.
import { KB } from './data.js';
import { triage } from './triage.js';

export const ACTIONS = ['none', 'order_lunch', 'file_request', 'open_bills', 'open_shop', 'help'];

const tokens = s => String(s).toLowerCase().replace(/[^a-z0-9' ]/g, ' ');

/** Best knowledge-base match by key-phrase overlap; longer phrases count more. */
export function offlineAnswer(question) {
  const q = ' ' + tokens(question) + ' ';
  let best = null, score = 0;
  for (const e of KB) {
    const s = e.keys.reduce((a, k) => a + (q.includes(' ' + k) ? k.split(' ').length * 2 + 1 : 0), 0);
    if (s > score) { score = s; best = e; }
  }
  if (!best) return { reply: "I'm not sure about that one. I can pass your question to the front desk, and they will call you back today.", action: { type: 'file_request', text: question }, source: 'offline' };
  // A problem stated in the question itself goes straight to the right owner, no second round.
  if (best.id === 'repair' || best.id === 'charged') {
    const t = triage(question);
    if (t.cues.length) return { reply: `I can send this to the ${t.owner.toLowerCase()} for you: “${question.trim()}”. Tap the button to send it.`, action: { type: 'file_request', text: question }, source: 'offline', matched: best.id };
  }
  const action = best.action ? { ...best.action, text: best.action.type === 'file_request' ? (best.action.text || question) : undefined } : { type: 'none' };
  return { reply: best.answer, action, source: 'offline', matched: best.id };
}

export function systemPrompt(resident) {
  return `You are the Maple Court community assistant, talking with ${resident.name}, age ${resident.age}, in apartment ${resident.apt}.
Speak simply and warmly, in at most three short sentences. Use only the facts below; if you don't know, offer to pass the question to the front desk.
Never give medical advice. If anything sounds like an emergency, tell them to call 911 and suggest the "help" action.

Facts:
${KB.map(e => '- ' + e.answer).join('\n')}

You may suggest ONE action the app will offer as a button (the resident must confirm):
- order_lunch: open today's lunch order
- file_request: send a request to the property desk; include "text", the request in the resident's words
- open_bills: open the bills and wallet tab
- open_shop: open this week's group buys
- help: alert the community desk now
- none

Reply with ONLY a JSON object: {"reply":"...","action":{"type":"...","text":"..."}}`;
}

/** Validate the model's JSON; fall back to a plain reply. */
export function parseModelReply(json, rawText) {
  if (!json || typeof json.reply !== 'string') return { reply: String(rawText || '').slice(0, 400) || 'Sorry, I could not answer that.', action: { type: 'none' }, source: 'model' };
  const type = ACTIONS.includes(json.action?.type) ? json.action.type : 'none';
  return { reply: json.reply, action: { type, text: json.action?.text }, source: 'model' };
}

export const ACTION_LABEL = {
  order_lunch: 'Order today’s lunch', file_request: 'Send to the property desk', open_bills: 'Open my bills',
  open_shop: 'See group buys', help: 'Alert the community desk',
};
