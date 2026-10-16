# PRD — Smart Community (portfolio demo)

**Author:** Jason Geng · **Status:** v1 demo · **Type:** interactive prototype with simulated data

> A from-scratch prototype with fictional data, based on the community-canteen and resident-services product line I worked on. No original code, data, designs or names are used.

---

## 1. Problem

Urban neighborhoods are aging fast. A typical community of ~800 households has 150–250 residents over 65; many live alone, can't cook every day, and don't use complex apps. At the same time:

| Party | Job to be done | Today's pain |
|---|---|---|
| **Older resident** | "Eat a decent hot meal, get help when something breaks, not feel alone" | Cooking is hard; the canteen menu is on a paper board; repair requests go through a phone call nobody logs |
| **Family member (often remote)** | "Know my parent is eating and OK" | No visibility unless they call |
| **Community canteen operator** | "Cook the right amount and stay profitable on subsidized meals" | Demand swings by day and weather; subsidies are reconciled by hand; delivery to homebound seniors is ad hoc |
| **Community manager / property office** | "Resolve issues fast and spot residents at risk" | Requests arrive by phone, chat apps and in person; no single queue; no early warning when someone stops showing up |
| **Volunteers** | "Help when I can" | No simple way to pick up a delivery or a check-in task |

**Core insight:** the daily meal is the most reliable touchpoint with an older resident. If the canteen and the service desk share one system, a missed meal becomes a wellbeing signal, not just lost revenue.

## 2. Goals & non-goals

**Goals (demo)**
1. One resident journey that is simple enough for a 75-year-old: order a meal in ≤ 3 taps, file a repair in one sentence.
2. Show how meal data, service requests and volunteer work feed one operations view.
3. Demonstrate AI that routes work and flags risk, with a human always deciding.

**Non-goals:** real payments, identity verification, medical advice, real messaging.

## 3. Personas & views

1. **Resident** — Mrs. Chen, 78, lives alone, mild arthritis
2. **Canteen** — operator of the community canteen
3. **Community desk** — community manager handling requests and wellbeing
4. **Volunteer** — neighbor who delivers meals and does check-ins

## 4. User stories (MVP)

**Resident (large-type, high-contrast, 3 big actions)**
- R1 See today's meals with price after senior subsidy; order dine-in or delivery in ≤ 3 taps
- R2 Subscribe to weekday lunches ("same as usual") and pause anytime
- R3 Report a problem in plain words ("the hallway light on floor 3 is broken") — no forms
- R4 Press "I'm OK today" or "I need help"
- R5 See the community notice board read aloud (text-to-speech button)

**Canteen**
- C1 Today's orders: dine-in vs. delivery, subscriptions vs. one-off
- C2 **AI demand forecast** for dine-in walk-ins, adjusted for weekday and weather
- C3 Subsidy reconciliation: meals served × subsidy tier = amount to claim, exportable
- C4 Delivery batch: group deliveries by building and hand them to volunteers

**Community desk**
- D1 One queue for all requests; **AI triage** assigns category (repair, sanitation, safety, care, noise, other), urgency, and suggested owner
- D2 **Wellbeing watchlist**: residents flagged when routine breaks (e.g., subscribed lunch skipped 2+ days with no pause, no "I'm OK" check-in) — with reason shown
- D3 Create a check-in task for a volunteer from any flag
- D4 Dashboard: request volume, median resolution time, meals served, active volunteers

**Volunteer**
- V1 See open tasks nearby (deliveries, check-ins) and claim one
- V2 Mark done with a quick note ("all fine", "needs follow-up")

## 5. AI & algorithm features

| Feature | Decision it changes | Method in demo | Honest label |
|---|---|---|---|
| **Request triage** | Who handles a request, how fast | Keyword + phrase scoring classifier with urgency rules (e.g., "gas", "fell", "no water" → urgent); shows matched cues | Real classifier on fictional requests |
| **Wellbeing flags** | Which residents get a check-in today | Rules on behavioral signals: missed subscribed meals, missing check-ins, sudden drop in orders; risk score with reasons | Real rules on simulated activity |
| **Demand forecast** | How many walk-in meals to cook | Day-of-week average × weather factor × trend | Real algorithm on simulated history |
| **Delivery batching** | Volunteer routes | Group by building, then floor; cap per volunteer | Real heuristic |

**Guardrails:** AI never contacts a resident on its own; every flag shows *why*; staff can dismiss with a reason; flags auto-expire. Wellbeing data is visible only to the community desk.

## 6. Success metrics (what I would measure in production)

| Area | Metric | Target |
|---|---|---|
| Access | % of residents 65+ who order at least weekly | > 40% |
| Ease | Median taps to order a meal (resident view) | ≤ 3 |
| Service | Median time to resolve a request | < 48h; urgent < 4h |
| Triage | % of AI categories accepted without change | > 85% |
| Care | Flagged residents checked within 24h | > 95% |
| Canteen | Food waste % | < 8% |
| Finance | Subsidy claims prepared automatically | 100% |

## 7. Demo script (2 minutes)

1. **Resident:** Mrs. Chen orders today's lunch for delivery in 3 taps → reports "water leaking from the ceiling in my bathroom".
2. **Community desk:** the request lands as *Repair, high priority* with the cues highlighted → assign. Wellbeing watchlist shows Mr. Zhao skipped two subscribed lunches → create a check-in.
3. **Volunteer:** claims the check-in and Mrs. Chen's delivery → marks done.
4. **Canteen:** forecast for tomorrow (rain → more deliveries) → subsidy reconciliation.

## 8. Risks & open questions

- Elderly users: a mini-app is a barrier for some; phone and in-person channels must feed the same queue (staff can enter on behalf).
- Wellbeing signals are sensitive: consent at sign-up, family members only see what the resident allows.
- False positives in flags create visit fatigue — tune thresholds and track "flag → real issue" rate.
