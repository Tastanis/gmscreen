// Map quality (Brandon, October 2026): the 3D board can run lighter on smaller laptops. One setting for the
// browser, 'vtt-quality' = auto | high | balanced | low, set from the Table menu (or anything that writes it).
// What each level changes: how many pixels are drawn, the sun's shadow detail, the largest size of any picture the
// board loads (the map image, model textures), and how soon the Table unloads a map nobody is looking at.
// Pictures and models are loaded once, so a change of level takes full effect when the map is opened again.
export const QUALITY_KEY = 'vtt-quality';
export const LEVELS = {
  high: { label: 'High', pixelRatio: 1.6, shadow: 2048, maxTexture: 8192, unloadAfterMs: 0 },
  balanced: { label: 'Balanced', pixelRatio: 1, shadow: 1536, maxTexture: 1024, unloadAfterMs: 5 * 60 * 1000 },
  low: { label: 'Low', pixelRatio: .75, shadow: 1024, maxTexture: 512, unloadAfterMs: 2 * 60 * 1000 },
};

/** What Auto picks on this machine: small memory → Low, an 8 GB Mac → Balanced, otherwise High. */
export function autoLevel(nav = globalThis.navigator) {
  const memory = Number(nav?.deviceMemory);
  if (Number.isFinite(memory) && memory > 0 && memory <= 4) return 'low';
  const mac = /Mac/i.test(String(nav?.userAgentData?.platform || nav?.platform || ''));
  if (mac && Number.isFinite(memory) && memory <= 8) return 'balanced';
  return 'high';
}

/** The chosen setting ('auto' unless one was picked). */
export function qualityChoice(storage = globalThis.localStorage) {
  try { const v = storage?.getItem(QUALITY_KEY); return v && (v === 'auto' || LEVELS[v]) ? v : 'auto'; } catch { return 'auto'; }
}

/** The level in force: the chosen one, or what Auto picks. */
export function qualityLevel(storage, nav) {
  const choice = qualityChoice(storage);
  return choice === 'auto' ? autoLevel(nav) : choice;
}

export function quality(storage, nav) { return LEVELS[qualityLevel(storage, nav)]; }

/** A size that fits inside `max` on its longest side, keeping the shape (or the same size when it already fits). */
export function fitSize(width, height, max) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1), longest = Math.max(w, h);
  if (!(max > 0) || longest <= max) return { width: w, height: h, scaled: false };
  const k = max / longest;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: true };
}

/** An image (or bitmap) drawn no larger than the level allows; the original is returned when it already fits. */
export function shrinkImage(image, max = quality().maxTexture) {
  const w = image?.naturalWidth || image?.videoWidth || image?.width, h = image?.naturalHeight || image?.videoHeight || image?.height;
  const size = fitSize(w, h, max);
  if (!size.scaled || typeof document === 'undefined') return image;
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  canvas.getContext('2d').drawImage(image, 0, 0, size.width, size.height);
  if (typeof image.close === 'function') image.close();   // free the full-size bitmap
  return canvas;
}

/** A decoded bitmap no larger than the level allows (for GLB textures). */
export async function shrinkBitmap(bitmap, max = quality().maxTexture) {
  const size = fitSize(bitmap?.width, bitmap?.height, max);
  if (!size.scaled || typeof createImageBitmap !== 'function') return bitmap;
  const small = await createImageBitmap(bitmap, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'medium', imageOrientation: 'none', premultiplyAlpha: 'none' });
  bitmap.close?.();
  return small;
}
