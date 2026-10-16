// A tiny persistent store: one versioned JSON object in localStorage, with change listeners.
// Storage can be unavailable (private mode, blocked site data); the app then runs in memory.

export function createStore(key, defaults) {
  const listeners = new Set();
  const fresh = () => structuredClone(defaults());
  let data;
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null');
    data = saved && saved.v === defaults().v ? saved : fresh();
  } catch { data = fresh(); }

  const persist = () => { try { globalThis.localStorage?.setItem(key, JSON.stringify(data)); } catch { /* memory only */ } };
  const emit = () => listeners.forEach(fn => fn(data));

  return {
    get data() { return data; },
    /** Mutate state inside fn, then save and notify. */
    update(fn) { fn(data); persist(); emit(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    reset() { data = fresh(); persist(); emit(); },
  };
}
