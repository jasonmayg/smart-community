// Guided tour for first-time visitors: a few highlighted stops, skippable, shown once, replayable.
//
// A step is { title, body, route?, sel? }. `route` switches the page first; `sel` is the element to
// spotlight. If the element is missing or hidden (a narrow screen, a role without access), the step is
// shown as a centered card instead of failing.
const KEY = 'tour.v1.done';

export function tourSeen() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return true; } // storage blocked: never nag
}
function markSeen() { try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } }

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 16 && r.height > 16 && getComputedStyle(el).visibility !== 'hidden'; };

function waitFor(sel, ms = 1500) {
  return new Promise(res => {
    const t0 = performance.now();
    const tick = () => {
      const el = sel && document.querySelector(sel);
      if (!sel || visible(el) || performance.now() - t0 > ms) return res(visible(el) ? el : null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

let active = null;

export function startTour(steps, { onEnd } = {}) {
  if (active) active.end(false);
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `<div class="tour-spot" aria-hidden="true"></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle"></div>`;
  document.body.appendChild(root);
  const spot = root.querySelector('.tour-spot'), card = root.querySelector('.tour-card');
  const opener = document.activeElement;
  let i = 0, target = null;

  const place = () => {
    const narrow = innerWidth < 640;
    if (!target) {
      spot.style.cssText = 'left:50%;top:50%;width:0;height:0';
      card.className = 'tour-card center';
      card.style.cssText = '';
      return;
    }
    const b = target.getBoundingClientRect(), pad = 6;
    // Clamp the spotlight to the screen so a tall element still reads as "this area".
    const r = { left: Math.max(4, b.left), top: Math.max(4, b.top), right: Math.min(innerWidth - 4, b.right), bottom: Math.min(innerHeight - 4, b.bottom) };
    r.width = r.right - r.left; r.height = r.bottom - r.top;
    spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    if (narrow) { card.className = 'tour-card dock'; card.style.cssText = ''; return; }
    card.className = 'tour-card';
    const cw = Math.min(360, innerWidth - 32), ch = card.offsetHeight || 180;
    if (r.height > innerHeight * 0.5) {
      // Tall target: put the card beside it rather than on top of it.
      const side = r.right + 16 + cw < innerWidth ? r.right + 16 : r.left - 16 - cw >= 0 ? r.left - 16 - cw : innerWidth - cw - 16;
      card.style.cssText = `left:${side}px;top:${Math.max(16, innerHeight / 2 - ch / 2)}px;width:${cw}px`;
      return;
    }
    const below = r.bottom + pad + 12, above = r.top - pad - 12 - ch;
    const top = below + ch < innerHeight - 12 ? below : above > 12 ? above : Math.max(12, innerHeight - ch - 12);
    const left = Math.min(Math.max(16, r.left + r.width / 2 - cw / 2), innerWidth - cw - 16);
    card.style.cssText = `left:${left}px;top:${top}px;width:${cw}px`;
  };

  const show = async k => {
    i = k;
    const s = steps[i];
    // Let the page switch first, so an element with the same id on the old page isn't picked up.
    if (s.route && location.hash !== '#/' + s.route) { location.hash = '#/' + s.route; await new Promise(r => setTimeout(r, 250)); }
    target = await waitFor(s.sel);
    if (!active || active.root !== root) return;
    if (target) { target.scrollIntoView({ block: 'center', inline: 'nearest' }); await new Promise(r => setTimeout(r, 120)); }
    card.innerHTML = `<div class="tour-step">${i + 1} / ${steps.length}</div><h2 id="tourTitle">${esc(s.title)}</h2><p>${s.body}</p>
      <div class="tour-actions"><button class="btn ghost sm" data-tour="skip">${i === steps.length - 1 ? 'Close' : 'Skip tour'}</button><span class="spacer"></span>
      ${i ? '<button class="btn secondary sm" data-tour="back">Back</button>' : ''}<button class="btn primary sm" data-tour="next">${i === steps.length - 1 ? 'Done' : 'Next'}</button></div>`;
    place();
    card.querySelector('[data-tour="next"]').focus();
  };

  const end = (done = true) => {
    markSeen();
    root.remove(); removeEventListener('resize', place); removeEventListener('scroll', place, true); removeEventListener('keydown', key, true);
    active = null;
    if (opener && opener.focus) opener.focus();
    if (onEnd) onEnd(done);
  };
  const key = e => {
    if (e.key === 'Escape') { e.preventDefault(); end(false); }
    else if (e.key === 'ArrowRight' && i < steps.length - 1) show(i + 1);
    else if (e.key === 'ArrowLeft' && i > 0) show(i - 1);
  };
  root.addEventListener('click', e => {
    const a = e.target.closest('[data-tour]')?.dataset.tour;
    if (a === 'skip') end(false);
    else if (a === 'back') show(i - 1);
    else if (a === 'next') { if (i < steps.length - 1) show(i + 1); else end(true); }
  });
  addEventListener('resize', place); addEventListener('scroll', place, true); addEventListener('keydown', key, true);
  active = { root, end };
  show(0);
}
