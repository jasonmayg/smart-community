// Triage evaluation: a labeled set of resident requests and the metrics that matter for routing them.
//
// The requests are fictional but written the way residents actually write: one sentence, typos, two
// problems at once, danger described calmly, an older person apologizing for bothering anyone.
// Each has a gold category and urgency set by a person. `hard` marks the cases built to break a
// keyword classifier, and says why.
import { CATEGORIES } from './triage.js';

export const LABELED = [
  // ---- repair
  { id: 'r01', text: 'The hallway light outside 4B has been flickering for a week.', cat: 'repair', urgency: 'normal' },
  { id: 'r02', text: 'Kitchen faucet drips all night, I can hear it from the bedroom.', cat: 'repair', urgency: 'normal' },
  { id: 'r03', text: 'Water is coming through my bathroom ceiling from upstairs.', cat: 'repair', urgency: 'high' },
  { id: 'r04', text: 'The elevator in building C stopped between floors again this morning, nobody was inside thank goodness.', cat: 'repair', urgency: 'high' },
  { id: 'r05', text: 'My front door lock is jammed and I can only open it from inside.', cat: 'repair', urgency: 'high' },
  { id: 'r06', text: 'No hot water since yesterday evening.', cat: 'repair', urgency: 'high', hard: 'says "hot water", not "no water"' },
  { id: 'r07', text: 'The radiator in the living room is stone cold and it is 10 degrees outside.', cat: 'repair', urgency: 'high', hard: 'no heat described without the word "heat"' },
  { id: 'r08', text: 'Card reader at the main gate keeps beeping red at me.', cat: 'repair', urgency: 'normal' },
  { id: 'r09', text: 'One of the stair treads on the back stairwell is loose and wobbles when you step on it.', cat: 'repair', urgency: 'high', hard: 'a fall risk that never says broken' },
  { id: 'r10', text: 'Smoke alarm keeps chirping every minute, I think it needs a battery.', cat: 'repair', urgency: 'normal', hard: '"smoke" and "alarm" but no danger' },
  { id: 'r11', text: 'window wont close all the way in my bedroom, theres a draft', cat: 'repair', urgency: 'normal' },
  { id: 'r12', text: 'Toilet keeps running after flushing.', cat: 'repair', urgency: 'normal' },
  { id: 'r13', text: 'The outlet by my bed made a pop and now nothing plugged in works and there is a black mark on it.', cat: 'safety', urgency: 'urgent', hard: 'an electrical burn described without "sparks" or "fire"' },
  // ---- safety
  { id: 's01', text: 'I smell gas in the stairwell on the 3rd floor.', cat: 'safety', urgency: 'urgent' },
  { id: 's02', text: 'There is smoke coming out of the laundry room vent.', cat: 'safety', urgency: 'urgent' },
  { id: 's03', text: 'Someone I don’t know has been trying door handles on our floor tonight.', cat: 'safety', urgency: 'urgent', hard: 'a prowler without "stranger" or "break-in"' },
  { id: 's04', text: 'The fire door on level 2 is propped open with a chair all the time.', cat: 'safety', urgency: 'high' },
  { id: 's05', text: 'Strange chemical smell in the parking garage, my eyes are watering.', cat: 'safety', urgency: 'urgent' },
  { id: 's06', text: 'The light in the back parking lot is out and it is pitch dark, I don’t feel safe walking there.', cat: 'safety', urgency: 'high', hard: 'reads like a repair; the resident is reporting a safety risk' },
  { id: 's07', text: 'My carbon monoxide detector is going off and I have a headache.', cat: 'safety', urgency: 'urgent' },
  { id: 's08', text: 'Kids are playing with lighters behind building B.', cat: 'safety', urgency: 'high' },
  { id: 's09', text: 'Burning smell from the elevator motor room.', cat: 'safety', urgency: 'urgent' },
  { id: 's10', text: 'The gate to the pool is broken and little children can get in.', cat: 'safety', urgency: 'high', hard: 'drowning risk phrased as a broken gate' },
  { id: 's11', text: 'Exposed wires hanging from the ceiling in the bike room.', cat: 'safety', urgency: 'high' },
  { id: 's12', text: 'I think someone broke into my storage unit, the padlock is cut.', cat: 'safety', urgency: 'high' },
  // ---- care
  { id: 'c01', text: 'My mother fell in the bathroom and can’t get up, please send someone.', cat: 'care', urgency: 'urgent' },
  { id: 'c02', text: 'I haven’t seen Mrs. Haas in 4C for three days and her mail is piling up.', cat: 'care', urgency: 'urgent' },
  { id: 'c03', text: 'I feel a bit dizzy today, could someone check on me later.', cat: 'care', urgency: 'urgent' },
  { id: 'c04', text: 'Sorry to bother you, I’m out of my blood pressure pills and can’t get to the pharmacy.', cat: 'care', urgency: 'high', hard: 'polite, no alarming words, but missing medicine' },
  { id: 'c05', text: 'I’m very lonely since my husband passed, is there anyone I could talk to?', cat: 'care', urgency: 'normal' },
  { id: 'c06', text: 'My neighbor in 2A seems confused, she knocked on my door asking what year it is.', cat: 'care', urgency: 'high' },
  { id: 'c07', text: 'Could someone help me carry my groceries up, my knee is bad.', cat: 'care', urgency: 'normal' },
  { id: 'c08', text: 'Mr. Lopez is not answering his door or his phone and his TV has been on all night.', cat: 'care', urgency: 'urgent' },
  { id: 'c09', text: 'I have chest pain.', cat: 'care', urgency: 'urgent' },
  { id: 'c10', text: 'my dad wont eat anything since tuesday, we live far away, can someone look in on him', cat: 'care', urgency: 'high', hard: 'a family member writing from afar, no keywords' },
  { id: 'c11', text: 'I’d like to sign up for the weekly wellness check-in calls.', cat: 'care', urgency: 'normal' },
  { id: 'c12', text: 'I slipped on the wet floor in the lobby yesterday, my wrist is swollen today.', cat: 'care', urgency: 'high' },
  { id: 'c13', text: 'It’s fine, don’t worry, I just haven’t been able to get out of bed since Sunday.', cat: 'care', urgency: 'urgent', hard: 'danger described calmly' },
  // ---- sanitation
  { id: 'n01', text: 'The trash room on floor 5 is overflowing and it stinks.', cat: 'sanitation', urgency: 'normal' },
  { id: 'n02', text: 'I saw mice in the basement storage area.', cat: 'sanitation', urgency: 'high' },
  { id: 'n03', text: 'Cockroaches in the kitchen again, third time this month.', cat: 'sanitation', urgency: 'high' },
  { id: 'n04', text: 'Someone left dog mess all over the courtyard path.', cat: 'sanitation', urgency: 'normal' },
  { id: 'n05', text: 'The recycling bins haven’t been emptied in two weeks.', cat: 'sanitation', urgency: 'normal' },
  { id: 'n06', text: 'There is mold growing on my bathroom wall and my grandson has asthma.', cat: 'sanitation', urgency: 'high', hard: 'a health risk with no listed keyword' },
  { id: 'n07', text: 'Pigeons are nesting on the balconies and it is filthy.', cat: 'sanitation', urgency: 'normal' },
  { id: 'n08', text: 'Lobby carpet is filthy and smells like wet dog.', cat: 'sanitation', urgency: 'normal' },
  { id: 'n09', text: 'Bedbugs in the furniture someone left by the elevator.', cat: 'sanitation', urgency: 'high' },
  { id: 'n10', text: 'Broken glass all over the playground this morning.', cat: 'safety', urgency: 'high', hard: 'sounds like cleaning; children can get hurt' },
  // ---- noise
  { id: 'z01', text: 'Loud music from 6D every night past midnight.', cat: 'noise', urgency: 'normal' },
  { id: 'z02', text: 'The dog next door barks all day while they’re at work.', cat: 'noise', urgency: 'normal' },
  { id: 'z03', text: 'Construction drilling started at 6:30 am on a Sunday.', cat: 'noise', urgency: 'normal' },
  { id: 'z04', text: 'Upstairs neighbors stomp around until 2am, I can’t sleep.', cat: 'noise', urgency: 'normal', hard: 'no "noise" or "loud"' },
  { id: 'z05', text: 'There’s a party in the courtyard and they are very noisy.', cat: 'noise', urgency: 'normal' },
  { id: 'z06', text: 'I hear screaming and things breaking next door, I’m scared for her.', cat: 'safety', urgency: 'urgent', hard: 'possible domestic violence that reads like a noise complaint' },
  { id: 'z07', text: 'The ventilation fan on the roof is humming really loudly all night.', cat: 'noise', urgency: 'normal' },
  { id: 'z08', text: 'Car alarm going off for an hour in the garage.', cat: 'noise', urgency: 'normal', hard: '"alarm" is not a safety alarm here' },
  // ---- billing
  { id: 'b01', text: 'I was charged twice for the September property fee.', cat: 'billing', urgency: 'high' },
  { id: 'b02', text: 'Can I get a refund for the lunches I canceled while I was in hospital?', cat: 'billing', urgency: 'normal', hard: '"hospital" and "lunch" but it is a refund' },
  { id: 'b03', text: 'My bill went up by $40 and nobody told me why.', cat: 'billing', urgency: 'normal' },
  { id: 'b04', text: 'How do I set up automatic payment for the monthly fee?', cat: 'billing', urgency: 'normal' },
  { id: 'b05', text: 'The parking charge on my invoice is for a space I gave up in June.', cat: 'billing', urgency: 'normal' },
  { id: 'b06', text: 'My daughter paid my fee but it still shows unpaid and I got a late notice.', cat: 'billing', urgency: 'high' },
  { id: 'b07', text: 'Why is there a $15 service charge on my statement?', cat: 'billing', urgency: 'normal', hard: '"service" pulls toward Services' },
  { id: 'b08', text: 'I was overcharged for the group-buy rice, I only got one bag.', cat: 'billing', urgency: 'normal' },
  // ---- services
  { id: 'v01', text: 'Can my lunch be delivered tomorrow instead of picked up?', cat: 'services', urgency: 'normal' },
  { id: 'v02', text: 'A package for me was left at the front desk, when can I pick it up?', cat: 'services', urgency: 'normal' },
  { id: 'v03', text: 'I need a ride to my doctor’s appointment on Thursday.', cat: 'services', urgency: 'normal' },
  { id: 'v04', text: 'Lost my key fob, how do I get a new one?', cat: 'services', urgency: 'normal', hard: '"fob" pulls toward Repair' },
  { id: 'v05', text: 'What time does the canteen open on holidays?', cat: 'services', urgency: 'normal' },
  { id: 'v06', text: 'Could the meal be softer? My new dentures make it hard to chew.', cat: 'services', urgency: 'normal', hard: '"hard" and dentures pull toward Care' },
  { id: 'v07', text: 'I’d like to book the community room for my 80th birthday.', cat: 'services', urgency: 'normal' },
  { id: 'v08', text: 'Do you have the form to register a new car for parking?', cat: 'services', urgency: 'normal' },
  { id: 'v09', text: 'Can someone read my letter from the bank to me, my eyes are bad.', cat: 'services', urgency: 'normal' },
  { id: 'v10', text: 'Where do I drop off old batteries?', cat: 'services', urgency: 'normal', hard: '"batteries" pulls toward Repair' },
  // ---- two problems in one message: gold = the more urgent one
  { id: 'x01', text: 'The bathroom fan is broken and also I fell yesterday and my hip still hurts a lot.', cat: 'care', urgency: 'high', hard: 'two problems; the person matters more than the fan' },
  { id: 'x02', text: 'Trash room smells awful and there is a weird gas smell near the boiler too.', cat: 'safety', urgency: 'urgent', hard: 'the danger is the second clause' },
  { id: 'x03', text: 'Please fix my faucet, and by the way my bill is wrong again.', cat: 'repair', urgency: 'normal', hard: 'two routine problems' },
  { id: 'x04', text: 'Noisy pipes banging all night, and now water is spraying out under the sink.', cat: 'repair', urgency: 'urgent', hard: 'starts as noise, ends as a burst pipe' },
];

const RANK = { normal: 0, high: 1, urgent: 2 };
export const CAT_KEYS = Object.keys(CATEGORIES);

/**
 * Score predictions against the labels.
 * preds: { [id]: { cat, urgency } } — missing ids count as not answered.
 */
export function scoreTriage(preds, set = LABELED) {
  const n = set.length;
  let catOk = 0, urgOk = 0, answered = 0, under = 0, over = 0, severe = 0;
  const needHelp = set.filter(x => x.urgency !== 'normal').length;
  const urgentN = set.filter(x => x.urgency === 'urgent').length;
  let urgentCaught = 0;
  const matrix = Object.fromEntries(CAT_KEYS.map(a => [a, Object.fromEntries(CAT_KEYS.map(b => [b, 0]))]));
  const misses = [];
  for (const x of set) {
    const p = preds[x.id];
    if (!p) continue;
    answered++;
    matrix[x.cat][p.cat]++;
    if (p.cat === x.cat) catOk++;
    if (p.urgency === x.urgency) urgOk++;
    const d = RANK[p.urgency] - RANK[x.urgency];
    if (d < 0) under++;
    if (d > 0) over++;
    if (x.urgency === 'urgent' && RANK[p.urgency] === 2) urgentCaught++;
    if (x.urgency === 'urgent' && RANK[p.urgency] < 2) severe++;
    if (p.cat !== x.cat || d < 0) misses.push({ ...x, got: p, under: d < 0 });
  }
  const perCat = CAT_KEYS.map(k => {
    const support = set.filter(x => x.cat === k).length, tp = matrix[k][k];
    const predicted = CAT_KEYS.reduce((a, j) => a + matrix[j][k], 0);
    return { cat: k, label: CATEGORIES[k].label, support, recall: support ? tp / support : 1, precision: predicted ? tp / predicted : 1 };
  });
  return {
    n, answered, catAcc: catOk / n, urgencyAcc: urgOk / n,
    underRate: under / n, overRate: over / n,
    urgentRecall: urgentN ? urgentCaught / urgentN : 1, severeMisses: severe, urgentN, needHelp,
    matrix, perCat, misses: misses.sort((a, b) => (RANK[b.urgency] - RANK[a.urgency]) || (b.under - a.under)),
  };
}

/** Run a synchronous classifier (the rules) over the set. */
export function runSync(fn, set = LABELED) {
  return Object.fromEntries(set.map(x => [x.id, fn(x.text)]));
}
