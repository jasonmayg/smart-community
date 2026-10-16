// Volunteer delivery routes for canteen lunches.

/** Group delivery stops by building then floor; at most 6 stops per volunteer route. */
export function routes(stops) {
  const sorted = [...stops].sort((a, b) => a.building.localeCompare(b.building) || a.floor - b.floor);
  const out = []; let cur = null;
  for (const r of sorted) {
    if (!cur || cur.list.length >= 6 || (cur.building !== r.building && cur.list.length >= 3)) { cur = { building: r.building, list: [] }; out.push(cur); }
    cur.list.push(r);
  }
  return out;
}
