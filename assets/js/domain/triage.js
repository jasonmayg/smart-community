// Request triage: category, urgency, owner and response deadline for a request written in plain words.
// Offline mode is a transparent cue-weight classifier. Live mode asks a language model for the same fields
// and the app shows both, so staff can see when they disagree.

export const CATEGORIES = {
  repair: { label: 'Repair', owner: 'Maintenance team', cues: { leak: 3, leaking: 3, broken: 2, 'not working': 2, light: 1.5, bulb: 2, door: 1.5, lock: 2, elevator: 2, lift: 2, heater: 2, 'no heat': 3, toilet: 2, faucet: 2, pipe: 2.5, window: 1.5, ceiling: 1.5, 'no water': 3, outlet: 2, power: 2 } },
  safety: { label: 'Safety', owner: 'Security', cues: { smoke: 3, fire: 3, gas: 3, smell: 1.2, smells: 1.2, stranger: 2, 'break-in': 3, alarm: 2, sparks: 3, burning: 3, 'carbon monoxide': 3, unsafe: 2 } },
  care: { label: 'Care', owner: 'Care coordinator', cues: { fell: 3, fall: 2.5, dizzy: 3, 'chest pain': 4, pain: 2, sick: 2, lonely: 2.5, alone: 1.2, medicine: 2, medication: 2, hospital: 2, confused: 2.5, help: 1, "can't get up": 4, "haven't seen": 2.5, 'not answering': 2.5 } },
  sanitation: { label: 'Sanitation', owner: 'Cleaning crew', cues: { trash: 2.5, garbage: 2.5, rubbish: 2, dirty: 2, mice: 3, rats: 3, cockroach: 3, bugs: 2, mess: 1.5, overflowing: 2, litter: 2 } },
  noise: { label: 'Noise', owner: 'Property manager', cues: { noise: 3, noisy: 3, loud: 2.5, music: 2, party: 2, barking: 2.5, drilling: 2, 'late at night': 1.5 } },
  billing: { label: 'Billing', owner: 'Property billing', cues: { charged: 2.5, twice: 2, bill: 2, fee: 1.5, refund: 3, invoice: 2, payment: 1.5, overcharged: 3, 'wrong amount': 3 } },
  services: { label: 'Services', owner: 'Front desk', cues: { lunch: 2, meal: 2, delivery: 1.5, package: 2, parcel: 2, form: 1.5, appointment: 1.5, ride: 2, question: 1, key: 1.5 } },
};
export const OWNERS = [...new Set(Object.values(CATEGORIES).map(c => c.owner))];
const URGENT = ['gas', 'smoke', 'fire', 'sparks', 'burning', 'carbon monoxide', 'fell', 'chest pain', "can't get up", 'no water', 'flood', 'flooding', 'not answering', 'dizzy', 'break-in'];
const HIGH = ['leak', 'leaking', 'no heat', 'elevator', 'lift', 'lock', 'broken', 'mice', 'rats', 'pain', 'sick', 'confused', 'charged twice'];
export const SLA_HOURS = { urgent: 4, high: 24, normal: 72 };

const wordRe = w => new RegExp('\\b' + w.replace(/[-'\s]/g, m => (m === ' ' ? '\\s+' : '\\' + m)) + '\\b');
const normalize = text => ' ' + String(text).toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9' -]/g, ' ') + ' ';

/** @returns {{cat,label,owner,urgency,conf,cues:string[],scores:Object<string,number>,source:'rules'}} */
export function triage(text) {
  const t = normalize(text);
  const scores = {}, hits = {};
  for (const [k, c] of Object.entries(CATEGORIES)) {
    scores[k] = 0; hits[k] = [];
    for (const [w, wt] of Object.entries(c.cues)) if (wordRe(w).test(t)) { scores[k] += wt; hits[k].push(w); }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  let cat = ranked[0][1] > 0 ? ranked[0][0] : 'services';
  if (scores.safety >= 3) cat = 'safety'; // anything that reads like danger goes to security first
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const conf = total ? scores[cat] / total : 0.2;
  const ug = URGENT.filter(w => wordRe(w).test(t));
  const hg = HIGH.filter(w => wordRe(w).test(t));
  const urgency = ug.length ? 'urgent' : hg.length ? 'high' : 'normal';
  const cues = [...new Set([...hits[cat], ...ug, ...hg])];
  return { cat, label: CATEGORIES[cat].label, owner: CATEGORIES[cat].owner, urgency, conf, cues, scores, source: 'rules' };
}

/** Hours left before the response deadline (negative = overdue). */
export const slaLeft = (urgency, ageH) => SLA_HOURS[urgency] - ageH;

// ---------- live model mode ----------
export const TRIAGE_SYSTEM = `You triage resident requests for a residential community's property and care desk.
Categories: ${Object.entries(CATEGORIES).map(([k, c]) => `${k} (${c.label}, owner: ${c.owner})`).join('; ')}.
Urgency: urgent = risk to life, safety or an older person who may be in trouble; high = needs action today; normal = otherwise.
Reply with ONLY a JSON object: {"cat":"<category key>","urgency":"urgent|high|normal","reason":"<one short sentence>","reply_to_resident":"<one warm, plain sentence telling them what happens next>"}`;

/** Validate a model's triage JSON and fill in the owner. Returns null if unusable. */
export function fromModel(json) {
  if (!json || !CATEGORIES[json.cat] || !SLA_HOURS[json.urgency]) return null;
  const c = CATEGORIES[json.cat];
  return { cat: json.cat, label: c.label, owner: c.owner, urgency: json.urgency, reason: String(json.reason || ''), reply: String(json.reply_to_resident || ''), source: 'model' };
}

const RANK = { normal: 0, high: 1, urgent: 2 };
/** Combine rules and model: the model sets category and wording, but urgency can only go up from the rules. */
export function merge(rules, model) {
  if (!model) return rules;
  const urgency = RANK[model.urgency] >= RANK[rules.urgency] ? model.urgency : rules.urgency;
  return { ...rules, ...model, urgency, cues: rules.cues, rules: { cat: rules.cat, urgency: rules.urgency } };
}

/** Short message to the resident about what happens next. */
export function residentReply(t) {
  const who = t.owner.toLowerCase();
  if (t.urgency === 'urgent') return `Sent to the ${who} and marked urgent. Someone will call you within 4 hours.`;
  if (t.urgency === 'high') return `Sent to the ${who}. Someone will look at it today.`;
  return `Sent to the ${who}. Someone will contact you within 3 days.`;
}
