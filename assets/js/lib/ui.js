// DOM helpers shared by all views: selectors, toasts, modals, bottom sheets.
import { esc } from './format.js';
import { ico } from './icons.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function toast(msg, icon = 'check') {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const t = document.createElement('div');
  t.className = 'toast'; t.innerHTML = ico(icon) + `<div>${msg}</div>`;
  box.append(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}

/** Centered dialog. Returns a close function. */
export function modal(title, bodyHtml, { onMount, width } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${width ? `style="width:min(${width}px,100%)"` : ''}>
    <div class="modal-h"><h3>${esc(title)}</h3><button class="btn icon ghost" data-close aria-label="Close">${ico('x')}</button></div>
    <div class="modal-b">${bodyHtml}</div></div>`;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  back.querySelector('input,textarea,button:not([data-close]),select')?.focus();
  onMount?.(back.querySelector('.modal'), close);
  return close;
}

/** Bottom sheet inside a phone frame. */
export function sheet(container, html, { onMount } = {}) {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  container.append(back);
  onMount?.(back.querySelector('.sheet'), close);
  return close;
}

/** Status pill for urgency / state. */
export const pill = (tone, text) => `<span class="pill ${tone}">${esc(text)}</span>`;
