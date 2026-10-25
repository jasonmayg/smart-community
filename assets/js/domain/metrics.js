// Product metrics for one community (Maple Court, 812 households): a north star, its drivers, the
// request funnel, health tiles and guardrails. The 8-week history is SIMULATED (seeded, the same for
// every visitor) and the page says so; the metric tree, definitions and guardrails are the real content.
import { rng } from '../lib/format.js';
import { COMMUNITY } from './data.js';

const WEEKS = 8;
export const AI_TRIAGE_WEEK = 3; // week index the model-assisted triage shipped (overrides fall after it)
export const STORM_WEEK = 5;     // a storm week: requests spike, on-time dips, urgent ones still met

/** Weekly series for the last 8 weeks. */
export function weeklyHistory(seed = 812) {
  const R = rng(seed), out = [];
  for (let w = 0; w < WEEKS; w++) {
    const n = () => R() - 0.5, ai = w >= AI_TRIAGE_WEEK, storm = w === STORM_WEEK;
    const requests = Math.round(150 + w * 3 + (storm ? 95 : 0) + n() * 18);
    const override = (ai ? 0.085 : 0.19) + n() * 0.02;            // staff changed the team or urgency
    const hoursToAssign = (ai ? 1.3 : 3.6) + (storm ? 1.4 : 0) + n() * 0.4;
    const onTime = Math.min(0.97, 0.78 + w * 0.012 + (ai ? 0.05 : 0) - (storm ? 0.09 : 0) + n() * 0.02);
    const reopen = 0.075 - w * 0.003 + (storm ? 0.02 : 0) + n() * 0.01;
    const urgentOnTime = storm ? 0.96 : Math.min(1, 0.975 + n() * 0.04);
    const activeHouseholds = Math.round(COMMUNITY.households * (0.58 + w * 0.012 + n() * 0.01));
    const checkinsMissed = Math.max(0, Math.round(1 + n() * 3)); // over-65 daily check-ins not answered by noon, followed up
    out.push({ w, requests, override, hoursToAssign, onTime, reopen, urgentOnTime, activeHouseholds, checkinsMissed });
  }
  return out;
}

/** This month's request funnel. */
export const FUNNEL = [
  ['Requests filed', 684],
  ['Triaged to a team', 684],
  ['Assigned to a person', 671],
  ['Marked done', 618],
  ['Confirmed by the resident', 539],
];

export const GUARDRAILS = [
  { name: 'Urgent requests answered within 4 hours', value: '98%', target: '≥ 95%', ok: true, note: 'Gas, water and falls. Urgency can only be raised by the model, never lowered.' },
  { name: 'Over-65 check-ins missed and not followed up', value: '0', target: '0', ok: true, note: 'A missed check-in pages a care worker; the count of missed ones is a health tile below.' },
  { name: 'Requests closed without a resident confirmation', value: '6%', target: '< 10%', ok: true, note: 'Closed after 72 hours of no reply; a rise means staff are closing to hit the deadline.' },
  { name: 'Resident data shared outside the property team', value: '0', target: '0', ok: true, note: 'Merchants see orders, never who filed a repair or a care note.' },
];

export const DEFINITIONS = [
  ['Resolved within deadline', 'Requests marked done before their deadline (4 h urgent, 24 h today, 72 h normal) and not reopened within 7 days ÷ requests due that week', 'The north star: it is what a resident feels and what the property company is paid for', 'Can be gamed by closing early; that is why reopened requests count as misses and confirmations are a guardrail'],
  ['AI override rate', 'Requests where staff changed the team or urgency the triage chose ÷ requests triaged', 'Live measure of triage quality, and the source of new labeled cases', 'Falls if staff stop checking; spot-audit a sample each week'],
  ['Hours to assign', 'Median time from filing to a named person', 'The part of the delay the product controls most directly', 'Assigning to a person who is off shift looks fast and isn’t'],
  ['Reopen rate', 'Requests reopened within 7 days of being marked done ÷ requests marked done', 'First-visit fix: a repeat visit costs the resident a second wait', 'Residents who give up don’t reopen; read with confirmations'],
  ['Active households', 'Households that used the app at least once in the week ÷ households', 'Reach: requests that arrive by phone or at the desk are slower and harder to track', 'Group-buying promotions can lift it without anyone filing a request'],
];
