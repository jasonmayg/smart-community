// Small SVG charts: a weekly line with an optional annotation, and a sparkline.
const fmt = (v, unit) => unit === '%' ? (v * 100).toFixed(0) + '%' : unit === 's' ? v.toFixed(1) + ' s' : unit === 'kg' ? v.toFixed(0) + ' kg' : v.toFixed(1);

/** values: number[] (one per week); note: { at: index, text } */
export function lineChart(values, { unit = '', note = null, color = 'var(--brand)', label = '', height = 200, min = null, max = null } = {}) {
  const W = 600, H = height, L = 46, R = 14, T = 16, B = 28;
  const lo = min ?? Math.min(...values) * 0.97, hi = max ?? Math.max(...values) * 1.03;
  const X = i => L + i / (values.length - 1) * (W - L - R), Y = v => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  const area = `${d}L${X(values.length - 1)} ${H - B}L${X(0)} ${H - B}Z`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${label}">
    ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--border)"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" class="ax">${fmt(v, unit)}</text>`).join('')}
    ${values.map((_, i) => `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="ax">W${i + 1}</text>`).join('')}
    ${note ? `<line x1="${X(note.at)}" x2="${X(note.at)}" y1="${T}" y2="${H - B}" stroke="var(--faint)" stroke-dasharray="4 4"/><text x="${X(note.at) + 6}" y="${T + 10}" class="ax">${note.text}</text>` : ''}
    <path d="${area}" fill="${color}" opacity=".08"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.5"/>
    ${values.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="#fff" stroke="${color}" stroke-width="2"><title>Week ${i + 1}: ${fmt(v, unit)}</title></circle>`).join('')}
  </svg>`;
}

export function sparkline(values, { color = 'var(--brand)', note = null } = {}) {
  const W = 160, H = 40, lo = Math.min(...values), hi = Math.max(...values);
  const X = i => 2 + i / (values.length - 1) * (W - 4), Y = v => 4 + (1 - (v - lo) / (hi - lo || 1)) * (H - 8);
  return `<svg viewBox="0 0 ${W} ${H}" class="spark" aria-hidden="true">${note != null ? `<line x1="${X(note)}" x2="${X(note)}" y1="0" y2="${H}" stroke="var(--faint)" stroke-dasharray="3 3"/>` : ''}<path d="${values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('')}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
}
