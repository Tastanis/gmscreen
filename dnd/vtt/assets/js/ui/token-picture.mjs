// The picture part of a token's edit box (Brandon, October 27, 2026: "adjust the picture"). A round preview of the
// token's picture: drag it to move it, the slider zooms, "Other picture…" takes another file. Saving sends the
// framed picture as a new image (token-library.js, update-token imageData); nothing changes until then.

const VIEW = 132;      // the preview's size on screen
const OUT = 256;       // the saved picture's size

export function createPicturePicker(root) {
  root.innerHTML = `
    <div class="token-picture">
      <canvas class="token-picture__view" width="${VIEW}" height="${VIEW}" title="Drag to move the picture"></canvas>
      <div class="token-picture__tools">
        <label class="token-picture__zoom">Zoom <input type="range" min="1" max="4" step="0.02" value="1" data-picture-zoom></label>
        <div class="token-picture__buttons">
          <button type="button" class="btn btn--small" data-picture-file>Other picture…</button>
          <button type="button" class="btn btn--small" data-picture-reset hidden>Monster's own picture</button>
        </div>
        <input type="file" accept="image/png,image/jpeg,image/webp" data-picture-input hidden>
      </div>
    </div>`;
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const zoom = root.querySelector('[data-picture-zoom]');
  const fileInput = root.querySelector('[data-picture-input]');
  const resetButton = root.querySelector('[data-picture-reset]');
  let image = null, x = 0, y = 0, scale = 1, dirty = false, wantsReset = false, sourceUrl = '';

  const cover = () => (image ? Math.max(VIEW / image.naturalWidth, VIEW / image.naturalHeight) : 1);
  function draw(target = ctx, size = VIEW) {
    target.clearRect(0, 0, size, size);
    if (!image) return;
    const k = size / VIEW, s = cover() * scale * k, w = image.naturalWidth * s, h = image.naturalHeight * s;
    target.drawImage(image, size / 2 - w / 2 + x * k, size / 2 - h / 2 + y * k, w, h);
  }
  function clampOffset() {
    if (!image) return;
    const s = cover() * scale, w = image.naturalWidth * s, h = image.naturalHeight * s;
    const mx = Math.max(0, (w - VIEW) / 2), my = Math.max(0, (h - VIEW) / 2);
    x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
  }
  function load(url, { changed = false } = {}) {
    image = null; x = 0; y = 0; scale = 1; zoom.value = '1'; dirty = changed; draw();
    if (!url) return Promise.resolve(false);
    return new Promise((resolve) => {
      const next = new Image();
      next.decoding = 'async';
      next.onload = () => { image = next; clampOffset(); draw(); resolve(true); };
      next.onerror = () => resolve(false);
      next.src = url;
    });
  }

  zoom.addEventListener('input', () => { scale = Number(zoom.value) || 1; clampOffset(); dirty = true; wantsReset = false; draw(); });
  canvas.addEventListener('pointerdown', (event) => {
    if (!image) return;
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    const start = { px: event.clientX, py: event.clientY, x, y };
    const move = (e) => { x = start.x + e.clientX - start.px; y = start.y + e.clientY - start.py; clampOffset(); dirty = true; wantsReset = false; draw(); };
    const up = () => { canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); };
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
  });
  canvas.addEventListener('wheel', (event) => {
    if (!image) return;
    event.preventDefault();
    scale = Math.max(1, Math.min(4, scale * (event.deltaY < 0 ? 1.08 : 1 / 1.08))); zoom.value = String(scale); clampOffset(); dirty = true; wantsReset = false; draw();
  }, { passive: false });
  root.querySelector('[data-picture-file]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { wantsReset = false; load(String(reader.result), { changed: true }); };
    reader.readAsDataURL(file); fileInput.value = '';
  });
  resetButton.addEventListener('click', () => { load(sourceUrl).then(() => { dirty = false; wantsReset = true; }); });

  return {
    /** Shows a token's picture. `original`: the monster's own picture (offers going back to it). */
    open(url, original = '') { sourceUrl = original || ''; resetButton.hidden = !original || original === url; wantsReset = false; return load(url); },
    /** What saving should send: {imageData} for a new framing or file, {resetImage} for the monster's own, or {}. */
    changes() {
      if (wantsReset) return { resetImage: true };
      if (!dirty || !image) return {};
      const out = document.createElement('canvas'); out.width = OUT; out.height = OUT;
      draw(out.getContext('2d'), OUT);
      try { return { imageData: out.toDataURL('image/png') }; } catch (_) { return {}; }   // a picture from another site cannot be re-saved
    },
  };
}
