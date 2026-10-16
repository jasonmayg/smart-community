// Fictional community. Every person, building, merchant and number here is made up.
import { rng } from '../lib/format.js';

export const COMMUNITY = { name: 'Maple Court', households: 812, over65: 214, buildings: ['A', 'B', 'C', 'D', 'E', 'F'] };
export const DAYS = 14; // days of signal history kept per resident

// ---------------------------------------------------------------- residents
const NAMES = ['Mrs. Chen', 'Mr. Zhao', 'Mrs. Haas', 'Mr. Osei', 'Mrs. Okafor', 'Mr. Silva', 'Mrs. Novak', 'Mr. Haddad', 'Mrs. Kim',
  'Mr. Brennan', 'Mrs. Alvarez', 'Mr. Tanaka', 'Mrs. Patel', 'Mr. Ivanov', 'Mrs. Mensah', 'Mr. Lindqvist', 'Mrs. Rossi', 'Mr. Dubois',
  'Mrs. Nguyen', 'Mr. Kowalski', 'Mrs. Romero', 'Mr. Park', 'Mrs. Lund', 'Mr. Farouk'];

function series(r, len, fn) { return Array.from({ length: len }, (_, i) => fn(r, i)); }

/**
 * Each resident carries 14 days of three signals, oldest first:
 *  meals[i]    1 if they took a canteen lunch that day
 *  door[i]     front-door sensor openings that day (only if a sensor is installed)
 *  checkins[i] 1 if they pressed "I'm OK" (only if they opted in)
 */
export const RESIDENTS = (() => {
  const r = rng(31);
  const list = NAMES.map((name, i) => {
    const b = COMMUNITY.buildings[i % 6], fl = 1 + Math.floor(r() * 6);
    const mealPlan = r() < 0.55, sensor = r() < 0.6, checkin = r() < 0.5;
    const doorBase = 3 + Math.floor(r() * 5);
    return {
      id: 'r' + i, name, building: b, floor: fl, apt: `${b}-${fl}0${1 + Math.floor(r() * 4)}`,
      age: 66 + Math.floor(r() * 22), alone: r() < 0.5, mealPlan, sensor, checkin,
      family: r() < 0.7 ? ['daughter', 'son', 'niece'][Math.floor(r() * 3)] : null,
      meals: series(r, DAYS, rr => (mealPlan ? (rr() < 0.94 ? 1 : 0) : (rr() < 0.3 ? 1 : 0))),
      door: sensor ? series(r, DAYS, rr => Math.max(1, Math.round(doorBase + (rr() - 0.5) * 3))) : null,
      checkins: checkin ? series(r, DAYS, rr => (rr() < 0.9 ? 1 : 0)) : null,
      soft: r() < 0.4,
    };
  });
  // Fixed stories so the demo is the same every time.
  const fix = (id, patch) => Object.assign(list.find(x => x.id === id), patch);
  fix('r0', { building: 'C', floor: 3, apt: 'C-302', age: 78, alone: true, mealPlan: false, sensor: true, checkin: true, family: 'daughter', soft: true,
    meals: [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0], door: [5, 6, 4, 5, 6, 5, 4, 5, 6, 5, 4, 6, 5, 4], checkins: Array(DAYS).fill(1) });
  fix('r1', { building: 'D', floor: 5, apt: 'D-502', age: 84, alone: true, mealPlan: true, sensor: true, checkin: true, family: 'son',
    meals: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0], door: [6, 5, 6, 7, 5, 6, 6, 5, 6, 5, 6, 4, 2, 1], checkins: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0] });
  fix('r2', { building: 'E', floor: 3, apt: 'E-305', age: 86, alone: true, mealPlan: false, sensor: true, checkin: false, family: 'niece',
    meals: Array(DAYS).fill(0), door: [4, 5, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 0], checkins: null });
  fix('r3', { building: 'D', floor: 2, apt: 'D-203', age: 76, alone: false, mealPlan: true, sensor: false, checkin: true, family: null,
    meals: [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 0], door: null, checkins: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0] });
  return list;
})();
export const R = Object.fromEntries(RESIDENTS.map(x => [x.id, x]));
export const ME = 'r0'; // the resident whose phone the demo shows

// ---------------------------------------------------------------- canteen
export const MENU = [
  { id: 'L1', name: 'Braised chicken with mushrooms', side: 'Rice, spinach, soup', soft: true, kcal: 640 },
  { id: 'L2', name: 'Steamed fish with ginger', side: 'Rice, carrots, soup', soft: true, kcal: 560 },
  { id: 'L3', name: 'Tofu and vegetable stew', side: 'Brown rice, soup', soft: true, kcal: 520, veg: true },
];
export const LUNCH_PRICE = { senior: 5.5, regular: 7.5, delivery: 1.0 };
export const MEAL_COST_RATIO = 0.7; // food + labor as a share of price

// walk-in lunches, last 4 weeks Mon–Sun (canteen closed weekends)
export const WALKIN_HIST = [41, 44, 39, 47, 52, 0, 0, 43, 45, 40, 46, 55, 0, 0, 42, 47, 41, 48, 53, 0, 0, 44, 46, 42, 49, 56, 0, 0];
export const WEATHER = {
  sun: { label: 'Sunny', walk: 1, deliver: 1 },
  rain: { label: 'Rain', walk: 0.72, deliver: 1.45 },
  cold: { label: 'Cold snap', walk: 0.85, deliver: 1.3 },
  heat: { label: 'Heat wave', walk: 0.8, deliver: 1.35 },
};

// ---------------------------------------------------------------- property
export const BILL = { period: 'October', due: 'Oct 31', lines: [['Property management', 162.4], ['Shared water and electricity', 23.6]] };
export const FEE_COLLECTION = { billed: 812, paidOnline: 598, paidDesk: 121, avgBill: 179.5 };

export const SEED_REQUESTS = [
  { id: 'q1', who: 'Mr. Brennan, A-402', src: 'Phone', text: 'Hallway light on floor 4 has been out for two days', t: 'Mon 9:30 AM', ageH: 75 },
  { id: 'q2', who: 'Mrs. Rossi, E-201', src: 'App', text: 'Trash room is overflowing and there are mice', t: '8:40 AM', ageH: 3 },
  { id: 'q3', who: 'Front desk', src: 'Walk-in', text: "Neighbor says Mrs. Haas is not answering her door since yesterday", t: '9:05 AM', ageH: 2 },
  { id: 'q4', who: 'Mr. Park, B-503', src: 'App', text: 'Loud drilling upstairs late at night again', t: '9:31 AM', ageH: 1.5 },
  { id: 'q5', who: 'Mrs. Lund, F-104', src: 'Phone', text: 'I think I was charged twice for the September property fee', t: '10:02 AM', ageH: 1 },
];

// ---------------------------------------------------------------- group buying
export const MERCHANTS = {
  m1: { name: 'Green Valley Farm', kind: 'Eggs and dairy' },
  m2: { name: 'Harbor Fish Co.', kind: 'Seafood' },
  m3: { name: 'Sunrise Bakery', kind: 'Bakery' },
  m4: { name: 'Orchard Co-op', kind: 'Fruit' },
};
export const COMMISSION = 0.08;
export const DEALS = [
  { id: 'd1', merchant: 'm1', name: 'Free-range eggs, 30 pack', price: 6.9, retail: 9.5, minGroup: 40, sold: 38, elapsedH: 30, windowH: 48, history: [96, 104, 99, 110, 101, 108, 112, 105], emoji: 'eggs' },
  { id: 'd2', merchant: 'm2', name: 'Cod fillets, 1 kg frozen', price: 11.5, retail: 15.9, minGroup: 25, sold: 9, elapsedH: 12, windowH: 48, history: [31, 28, 35, 30, 26, 33, 29, 34], emoji: 'fish' },
  { id: 'd3', merchant: 'm3', name: 'Whole-wheat loaf', price: 3.2, retail: 4.5, minGroup: 30, sold: 52, elapsedH: 40, windowH: 48, history: [61, 58, 66, 63, 70, 64, 67, 62], emoji: 'bread' },
  { id: 'd4', merchant: 'm4', name: 'Seasonal apples, 3 kg', price: 7.8, retail: 10.5, minGroup: 30, sold: 14, elapsedH: 20, windowH: 48, history: [44, 52, 39, 47, 58, 41, 49, 55], emoji: 'apples' },
];
export const DEAL_ART = { eggs: ['#F5E6C8', '#E9C46A'], fish: ['#D6E6F2', '#5B8DB8'], bread: ['#F1DFC6', '#C08A4A'], apples: ['#F6D5D2', '#C9433C'] };

// ---------------------------------------------------------------- platform pricing
export const PRICING = {
  saasPerHousehold: 1.2, // property company, per household per month
  paymentRate: 0.006, // property company, on fees collected in the app
  commission: COMMISSION, // merchants, on group-buy sales
  delivery: LUNCH_PRICE.delivery, // residents
};
// Month-to-date baseline for the revenue page (simulated)
export const MTD = { mealsSenior: 2140, mealsRegular: 610, deliveries: 690, groupBuyGMV: 18420 };

// ---------------------------------------------------------------- assistant knowledge base
export const KB = [
  { id: 'hours', keys: ['canteen', 'open', 'hours', 'lunch time', 'when'], answer: 'The canteen serves lunch 11:30 to 1:00 on weekdays. Delivered lunches arrive between 11:30 and 12:15.' },
  { id: 'lunch', keys: ['lunch', 'meal', 'eat', 'food', 'menu', 'order'], answer: `Today there are three lunches, all soft and easy to chew. Residents 65 and over pay $5.50; delivery is $1.00 more.`, action: { type: 'order_lunch' } },
  { id: 'fee', keys: ['property fee', 'bill', 'pay', 'fee', 'how much', 'owe', 'due'], answer: 'Your October bill is $186.00 (management $162.40, shared water and electricity $23.60), due October 31. You can pay it on the Bills tab.', action: { type: 'open_bills' } },
  { id: 'charged', keys: ['charged twice', 'double', 'refund', 'wrong amount', 'overcharged'], answer: 'I can send this to property billing. They reply within one working day and refunds go back to your wallet.', action: { type: 'file_request', text: 'I think I was charged twice on my bill' } },
  { id: 'repair', keys: ['broken', 'repair', 'fix', 'leak', 'light', 'not working', 'elevator'], answer: 'Tell me what is broken in one sentence and I will send it to the maintenance team.', action: { type: 'file_request' } },
  { id: 'package', keys: ['package', 'parcel', 'delivery box', 'mail'], answer: 'Parcels are kept at the front desk in Building A, 8 am to 8 pm. Bring your ID card.' },
  { id: 'elevator', keys: ['elevator maintenance', 'lift maintenance'], answer: 'The elevator in Building C has maintenance on Saturday from 9 to 11 am.' },
  { id: 'flu', keys: ['flu', 'vaccine', 'shot', 'doctor', 'clinic'], answer: 'Free flu shots are in the canteen on Thursday, 10 to 12. Bring your ID card.' },
  { id: 'groupbuy', keys: ['eggs', 'fish', 'bread', 'apples', 'group', 'buy', 'shop', 'deal'], answer: 'This week’s group buys are eggs, cod, bread and apples. Orders are picked up at the front desk on Friday afternoon.', action: { type: 'open_shop' } },
  { id: 'trash', keys: ['trash', 'garbage', 'recycling', 'rubbish'], answer: 'Trash is collected every morning. Recycling is Tuesday and Friday. Large items need a booking at the front desk.' },
  { id: 'emergency', keys: ['emergency', 'fell', 'chest', 'ambulance', 'hurt'], answer: 'If this is an emergency, call 911 now. I can also alert the community desk right away.', action: { type: 'help' } },
  { id: 'topup', keys: ['wallet', 'top up', 'money', 'balance', 'daughter pay', 'family'], answer: 'Your daughter can add money to your wallet from her phone. Your balance is on the Bills tab.' },
];
