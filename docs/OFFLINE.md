# Offline-first design

Property work happens where the signal isn’t: pump rooms, basements, elevator shafts, stairwells. Older residents are often on weak connections. A property company won’t buy a system that stops when the Wi-Fi does. So the app is built to keep working offline and to reconcile honestly when the connection comes back.

## What works offline

| Who | Works offline | Waits for a connection |
|---|---|---|
| Technician | Open orders, start, hold, resume, complete with notes; facility data | Merging duplicates |
| Desk staff | Assign, reassign, expedite, correct, close for a resident | Merging duplicates, live AI second opinion |
| Resident | Report a problem, mark it urgent, confirm or reopen a fix; offline assistant answers | Payments (nothing is charged offline). The help button saves the alert *and* shows one-tap phone calls to the desk and 911 |
| Everyone | The whole app opens with no network (installed as a PWA) | Live Claude features fall back to the offline rules automatically |

## How it works

1. **Installable app shell.** `sw.js` precaches every module, the stylesheet and icons; fonts are cached as they load; the model API is never cached. `tests/pwa.test.mjs` fails the build if a module is missing from the precache list.
2. **Operations, not edits.** Every change to a work order is an operation: who, which order, which transition, its arguments, and the order’s *version* when it was made (`domain/sync.js`).
3. **Outbox.** Offline, operations are applied to the device’s copy (so the screen updates at once) and queued.
4. **Replay on reconnect.** Each queued operation is replayed against the server copy:
   - **same version** → fast-forward;
   - **server moved on, change still valid** → merge (an expedite, a correction to a different field, a resident confirming);
   - **server moved on, change contradicts it** → conflict: the order was reassigned, closed, merged, or the same field was corrected. Later operations on the same order are bundled into the same conflict.
5. **Idempotent.** Each operation has an id and is applied at most once, so a flaky reconnect can resend safely.
6. **People decide conflicts.** Conflicts go to the person whose device made the change and to anyone who can assign work. “Apply the offline change” or “Keep the desk’s version”: either way the decision is written to the order’s history. Nothing is dropped silently.

## Try it in the demo

1. Click **Online** in the top bar to go offline (or switch off your network; the app notices).
2. View as **Raj Patel, Technician** → Work orders → Q1 → Start → Mark complete.
3. Click **Meanwhile, the desk changes something** (Marco reassigns Q1 to Leo).
4. Reconnect. Two changes sync and one conflict appears; view as **Marco Ruiz** and review it.

## In production

- The outbox would live in IndexedDB with background sync; the demo keeps it in the same store as everything else.
- On site, an edge gateway per building keeps door readers working from a local allow-list and buffers sensor readings when the building’s internet is down, then forwards them in order.
- Server-side, operations would be validated with the same `domain/` rules the client uses, so client and server can’t disagree about what a valid transition is.
