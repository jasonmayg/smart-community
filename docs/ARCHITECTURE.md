# Architecture

A static web app with no build step, no framework and no backend. The structure is built so the product logic can be read, tested and swapped without touching the UI.

```
index.html            loads assets/app.css and assets/js/main.js (ES module)
assets/js/
  main.js             shell, sidebar, router, settings
  state.js            the one app store + actions (pay, fileRequest, addTask, log)
  lib/                generic helpers, no product knowledge
    format.js         money, numbers, escaping, seeded RNG (pure)
    store.js          createStore(key, defaults): versioned localStorage + listeners
    ui.js             $, toast, modal, bottom sheet (DOM)
    icons.js          stroke icon set
    llm.js            optional Claude call from the browser + JSON extraction
  domain/             product logic: pure, DOM-free, unit-tested
    data.js           fictional community, residents, deals, pricing, handbook
    triage.js         request classifier, deadlines, model prompt + validation
    wellbeing.js      explainable risk score and watchlist
    forecast.js       walk-in and group-buy forecasts
    routes.js         delivery route batching
    ledger.js         payment splits and revenue by customer
    assistant.js      offline answers, model prompt, reply validation
  views/              one file per page; render(root) returns a cleanup function
tests/domain.test.mjs node:test, run in CI on every push
```

## Rules the code follows

1. **Domain code never touches the DOM.** Everything in `domain/` runs in Node, which is how the tests run it. Views format and lay out, and they never compute product numbers themselves.
2. **One store, changed only through actions.** Views call `store.update` or the actions in `state.js`; every page subscribes with `store.onChange` and repaints, so a payment in the resident app updates the revenue page and the merchant forecast.
3. **Views clean up after themselves.** `render(root)` returns an unsubscribe; the router calls it before mounting the next page, so listeners never pile up.
4. **Model output is untrusted input.** `fromModel` and `parseModelReply` validate categories, urgencies and action types against fixed lists, and anything else falls back to the offline answer. The resident confirms every suggested action.
5. **Every AI feature works offline.** The live model is an upgrade, not a dependency.

## Data flow example: “Water is leaking from my bathroom ceiling”

1. `views/resident.js` → `triage(text)` (domain) → optional `ask()` (lib/llm) → `fromModel()` validates.
2. `fileRequest()` (state) adds the request; `log()` writes the activity feed.
3. Every subscribed view repaints. The desk shows it as *Repair, high* with a 24 h deadline and the cues highlighted.
