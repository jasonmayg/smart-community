# PRD: Smart Community (portfolio demo)

**Author:** Jason Geng  
**Status:** v3 prototype  
**Type:** interactive prototype with simulated data

> A from-scratch prototype with fictional data, based on a smart-community product I led. No original code, data, designs or names are used.

---

## 1. Problem

Residential communities are aging fast. A typical community of ~800 households has 150 to 250 residents over 65. Many of them live alone, can’t cook every day and don’t use complex apps. Four parties serve them through separate channels:

| Party | Job to be done | Today’s pain |
|---|---|---|
| **Older resident** | “Eat a hot meal, get things fixed, not feel alone” | Paper menus; repairs go through a phone call nobody logs; apps assume good eyesight and typing |
| **Family member (often remote)** | “Know my parent is OK” | No visibility unless they call |
| **Property company** | “Resolve issues fast, collect fees, keep residents safe” | Requests arrive by phone, chat and in person, with no single queue; fee collection is manual; no early warning when someone stops showing up |
| **Canteen operator** | “Cook the right amount and reach homebound residents” | Demand swings with weekday and weather; deliveries are ad hoc |
| **Local merchants** | “Sell more with less waste” | Group buys run in chat groups; stock is a guess |

**Core insight:** daily touchpoints (a lunch order, a door opening, a bill paid, a request typed) are small, reliable signals. One system that carries all of them can route work, flag risk and fund itself.

## 2. Goals and non-goals

**Goals (demo)**
1. A resident journey simple enough for a 78-year-old: order lunch in 3 taps or fewer, report a problem in one sentence or by voice, check in with one button.
2. One operations view where requests, care flags, canteen demand and merchant demand come from the same data.
3. AI that routes work, flags risk and answers questions, always explains itself and never acts without a person.
4. A business model that is visible: three paying customers.

**Non-goals:** real payments, identity verification, medical advice, real messaging, real sensors.

## 3. Personas and views

1. **Resident:** Mrs. Chen, 78, lives alone, mild arthritis (resident app)
2. **Property desk staff:** handle requests and fee collection
3. **Care coordinator and volunteers:** wellbeing checks, deliveries, errands
4. **Canteen operator:** orders, forecast, routes
5. **Merchant:** group-buy deals and settlement
6. **Platform business owner:** revenue by customer

## 4. User stories

**Resident**
- R1 Order today’s lunch (dine-in or delivery) and pay from the wallet in 3 taps or fewer
- R2 Join or leave a weekday lunch plan (“same as usual”)
- R3 Report a problem in plain words or by voice; get a plain answer about what happens next
- R4 Press “I’m OK today” or “I need help”
- R5 Hear community notices read aloud
- R6 Pay the monthly property bill; ask a family member to top up the wallet
- R7 Join a group buy; get refunded automatically if it doesn’t fill
- R8 Ask the assistant a question and act on its suggestion with one button

**Property desk**
- D1 One queue for every channel with AI category, urgency, owner and response deadline, plus the cues that drove it
- D2 Override the owner (logged); optionally compare with a live model
- D3 See requests past deadline
- D4 See fee collection and send reminders

**Care**
- C1 Watchlist of residents whose routines broke, with a score, named reasons and a 14-day signal strip
- C2 Send a volunteer, call family, pause a meal plan, or dismiss
- C3 Volunteers claim tasks and close them with an outcome; “No answer” raises an urgent case

**Canteen**
- K1 Today’s orders by source
- K2 Walk-in forecast for tomorrow with weather adjustment and an 80% range
- K3 Delivery routes grouped by building and floor, at most six stops each

**Work orders (v3)**
- W1 Every request becomes a work order: new → assigned → in progress (on hold) → done → resident confirms or reopens
- W2 Resident can expedite once with a reason; staff can raise urgency further
- W3 Overdue orders escalate automatically: department lead, then property manager (50% past deadline), then group (100% past)
- W4 Staff correct category, department, urgency or asset with a structured reason; duplicates are merged and the second requester follows the original
- W5 AI assist on every order: matched asset, whether the lifecycle model had already flagged it, suggested assignee, likely duplicates
- W6 Triage accuracy is computed from corrections and shown on the queue

**Facilities (v3)**
- F1 Registry of lights, door readers, elevator doors, pumps and circuits with install date, usage rate and sensor status
- F2 Per asset: life used, failure probability in 30/90/365 days, best replacement age and date, and policy (planned or run to failure)
- F3 Condition alerts when a health signal drifts from the asset’s own baseline
- F4 Time to notice a failure, with or without sensors, and the cost of retrofitting sensors by building
- F5 Replacements due in 90 days batched into one visit per building; approving creates preventive work orders
- F6 AI-written maintenance plan (offline from model outputs, or by Claude)

**Organization and access (v3)**
- O1 Group → properties → departments → staff; property → households → head, adults, older adults, children
- O2 Roles: platform admin, group admin, property manager, department lead, staff (title by department), household head, adult, older adult, child
- O3 Anyone can grant only roles below their own and only inside their scope; department leads add staff to their department only; household heads add family only; only management registers a household head
- O4 Pages and actions follow permissions (a technician sees his department’s orders and facility health; a household head sees his household)
- O5 Every grant, removal and limit change is logged; the group sees a portfolio of its properties

**Merchants**
- M1 Live deals with orders so far, minimum, forecast range and stock advice
- M2 Chance of reaching the minimum before the window closes
- M3 Settlement: sales, commission, payout

**Business**
- B1 Revenue by paying customer and stream
- B2 Every payment split between recipients

## 5. AI and algorithm features

| Feature | Decision it changes | Method in demo | Honest label |
|---|---|---|---|
| **Request triage** | Who handles a request, how fast | Cue-weight classifier (7 categories) with urgency rules and deadlines; optional Claude comparison returning category, urgency, reason and a resident reply | Real code; fictional requests |
| **Assistant** | What a resident does next | Offline handbook retrieval; live mode grounded in the same handbook, JSON reply plus at most one action, resident confirms | Real code; live mode optional |
| **Wellbeing score** | Who gets a check-in today | Named signals with fixed points (meals, door sensor vs. own baseline, check-ins), context only when another signal fired | Real rules; simulated signals |
| **Walk-in forecast** | How much to cook | Weighted same-weekday average × weather; back-tested range | Real code; simulated history |
| **Group-buy forecast** | How much stock a merchant brings | Pace ÷ expected share, blended with history by time elapsed; 70th-percentile stock | Real code; simulated history |
| **Facility lifecycle** | When to replace each asset, which to watch | Weibull over usage, conditional failure probability, age-replacement cost minimization, baseline drift on sensor signals | Real code; simulated ages and signals |
| **Work-order assist** | Who gets the job, whether it’s already known | Text → asset match, prediction cross-check, least-loaded assignee, duplicate detection | Real code |
| **Delivery routes** | Volunteer workload | Group by building then floor, cap 6 | Real heuristic |

**Guardrails:** AI never contacts a resident or acts by itself. Every flag shows why it fired. Flags expire daily. Wellbeing data is visible only to care staff. There are no cameras and no location tracking.

## 6. Business model

| Customer | Pays for | Demo pricing |
|---|---|---|
| Property company | Software subscription; in-app fee collection | $1.20 per household per month; 0.6% of fees collected |
| Residents | Canteen meals; delivery | $5.50 senior lunch (30% gross margin); $1.00 delivery |
| Merchants | Group-buy sales | 8% commission |

Software gets the platform into a community. Everyday services make it pay.

## 7. Success metrics (what I would measure in production)

| Area | Metric | Target |
|---|---|---|
| Access | Residents 65+ ordering lunch at least weekly | > 40% |
| Ease | Median taps to order lunch | ≤ 3 |
| Service | Urgent requests answered | < 4 h |
| Triage | AI category accepted without change | > 85% |
| Care | Flagged residents checked within 24 h | > 95% |
| Care | Flags that turned out to need help | track; tune thresholds if < 20% |
| Canteen | Food waste | < 8% |
| Merchants | Group-buy stock left over | < 5% |
| Business | Revenue per household per month | > 5× software price |
| Work orders | Resolved before deadline | > 90% |
| Work orders | Reopened after “fixed” | < 5% |
| Facilities | Failures caught by a sensor or prediction before a resident reports | > 60% |
| Facilities | Emergency call-outs vs planned replacements | falling quarter over quarter |

## 8. Demo script (2 minutes)

1. **Resident:** order steamed fish for delivery and pay. Report “Water is leaking from my bathroom ceiling”. Press “I’m OK”. Ask the assistant “How much is my bill?” and pay it.
2. **Property desk:** the leak is *Repair, high*, with the cue words highlighted; one request is past its deadline.
3. **Care:** Mr. Zhao (85) has missed two plan lunches, his door activity has dropped and he hasn’t checked in. Send a volunteer, who reports “No answer”, and an urgent case appears at the desk.
4. **Group buying:** join the eggs deal in the resident app and watch the forecast and stock move.
5. **Revenue:** every payment from step 1, split between the property company, canteen, merchant and platform.

## 9. Risks and open questions

- Some older residents won’t use any app. Phone and front-desk channels must feed the same queue, and staff can file on a resident’s behalf.
- Wellbeing signals are sensitive. They need consent at sign-up, and family sees only what the resident allows.
- False positives cause visit fatigue, so track the flag-to-real-issue rate and tune the thresholds.
- A live model can misroute an urgent case. Keep the rules’ urgency as a floor, so the model can only raise it.
- Merchant quality reflects on the platform, so it needs ratings and automatic refunds for missed minimums.
