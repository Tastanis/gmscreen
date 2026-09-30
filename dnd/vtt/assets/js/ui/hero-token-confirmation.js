let cancelActive = null;

export function heroTokenConfirmationPosition(anchor, popup, viewport, gap = 8) {
 const padding = 8, maxLeft = Math.max(padding, viewport.width - popup.width - padding);
 const maxTop = Math.max(padding, viewport.height - popup.height - padding);
 const right = anchor.right + gap, left = anchor.left - popup.width - gap;
 const x = right <= maxLeft ? right : left >= padding ? left : anchor.left;
 const y = anchor.top + popup.height <= viewport.height - padding ? anchor.top : anchor.bottom - popup.height;
 return { left: Math.max(padding, Math.min(maxLeft, x)), top: Math.max(padding, Math.min(maxTop, y)) };
}

export function showHeroTokenConfirmation(button) {
 cancelActive?.();
 if (!button?.isConnected) return Promise.resolve(false);
 return new Promise(resolve => {
  const popup = document.createElement('div');
  popup.className = 'vtt-character-token-confirmation';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', 'Use a hero token');
  popup.innerHTML = '<div class="vtt-character-token-confirmation__text">Does everyone agree to use a hero token?</div><div class="vtt-character-token-confirmation__actions"><button type="button" data-confirm-hero-token>Yes</button><button type="button" data-cancel-hero-token>Cancel</button></div>';
  let finished = false;
  const finish = value => {
   if (finished) return;
   finished = true;
   observer.disconnect();
   window.removeEventListener('resize', position);
   document.removeEventListener('scroll', position, true);
   document.removeEventListener('pointerdown', outside, true);
   document.removeEventListener('keydown', escape, true);
   popup.remove();
   if (cancelActive === cancel) cancelActive = null;
   resolve(value);
  };
  const cancel = () => finish(false);
  const position = () => {
   if (!button.isConnected) return cancel();
   const p = heroTokenConfirmationPosition(button.getBoundingClientRect(), popup.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
   popup.style.left = p.left + 'px'; popup.style.top = p.top + 'px';
  };
  const outside = event => { if (!popup.contains(event.target) && !button.contains(event.target)) cancel(); };
  const escape = event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } };
  const observer = new MutationObserver(() => { if (!button.isConnected) cancel(); });
  observer.observe(button.closest('#vtt-character-summary-panel') || button.parentElement, { childList: true, subtree: true });
  popup.querySelector('[data-confirm-hero-token]').onclick = () => finish(true);
  popup.querySelector('[data-cancel-hero-token]').onclick = cancel;
  document.body.append(popup);
  cancelActive = cancel;
  position();
  window.addEventListener('resize', position);
  document.addEventListener('scroll', position, true);
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', escape, true);
 });
}
