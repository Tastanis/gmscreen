"""Shrinks rubble pictures for the app and cleans the fringe left by background removal.

Large originals stay outside the repository; only the small copies this writes go into
dnd/vtt/assets/images/rubble/. The originals are read and never changed.

    python dnd/vtt/tools/shrink-rubble-art.py "<folder of originals>" dnd/vtt/assets/images/rubble

Originals are PNGs named rubble-<kind>-<number>.png (see the README in the rubble folder). A
name with "-heap-" in it is a heap, shrunk to 512 on its long side; anything else is a strip,
shrunk to 600 wide. Needs Pillow and numpy."""
import sys, os, glob
import numpy as np
from PIL import Image, ImageFilter

STRIP_WIDTH = 600   # a wall piece is drawn about 170 px long at 150 px a square; this leaves room to zoom in
HEAP_LONG = 512

def defringe(image):
    """Edge pixels left by background removal carry the old background's colour. Nothing solid is
    repainted: nearly-clear pixels are dropped, and part-clear pixels take their colour from the
    solid pixels beside them. Alpha is otherwise left as it is."""
    a = np.asarray(image.convert('RGBA')).astype(np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3]
    solid = (alpha >= 0.85).astype(np.float32)
    # Colour of the solid neighbourhood: blur the solid pixels' colour and divide by the blurred coverage.
    def blur(channel, radius):
        return np.asarray(Image.fromarray((channel * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) / 255.0
    near = np.zeros_like(rgb); cover = np.zeros_like(alpha)
    for radius in (2, 5):
        c = blur(solid, radius)
        n = np.stack([blur(rgb[..., i] * solid, radius) for i in range(3)], axis=2)
        use = (cover < 0.05) & (c >= 0.05)
        near[use] = n[use] / c[use][:, None]
        cover[use] = c[use]
    part = (alpha < 0.85) & (cover >= 0.05)
    out = rgb.copy()
    # The clearer the pixel, the more of its colour comes from its solid neighbours.
    weight = np.clip((0.85 - alpha) / 0.6, 0, 1)[..., None]
    out[part] = (rgb * (1 - weight) + near * weight)[part]
    new_alpha = alpha.copy()
    new_alpha[alpha < 0.06] = 0                      # nearly clear: gone
    new_alpha[(alpha < 0.85) & (cover < 0.05) & (alpha < 0.35)] = 0   # faint specks with nothing solid near them
    return Image.fromarray((np.dstack([out, new_alpha]) * 255 + 0.5).astype(np.uint8), 'RGBA')

def shrink(image, heap):
    w, h = image.size
    scale = (HEAP_LONG / max(w, h)) if heap else (STRIP_WIDTH / w)
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    # Scale colour weighted by alpha so clear pixels do not darken or tint the edges.
    a = np.asarray(image).astype(np.float32) / 255.0
    premult = np.dstack([a[..., :3] * a[..., 3:4], a[..., 3]])
    small = np.asarray(Image.fromarray((premult * 255 + 0.5).astype(np.uint8), 'RGBA').resize(size, Image.LANCZOS)).astype(np.float32) / 255.0
    alpha = small[..., 3]
    rgb = np.where(alpha[..., None] > 1e-4, small[..., :3] / np.maximum(alpha[..., None], 1e-4), 0)
    return Image.fromarray((np.clip(np.dstack([rgb, alpha]), 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')

def main(source, out):
    os.makedirs(out, exist_ok=True)
    total = 0
    for path in sorted(glob.glob(os.path.join(source, 'rubble-*.png'))):
        name = os.path.splitext(os.path.basename(path))[0]
        original = Image.open(path).convert('RGBA')
        small = shrink(defringe(original), heap='-heap-' in name)
        target = os.path.join(out, name + '.webp')
        small.save(target, 'WEBP', quality=84, method=6, exact=False)
        size = os.path.getsize(target); total += size
        print('%-24s %4dx%-4d -> %3dx%-3d  %5.1f KB' % (name, original.size[0], original.size[1], small.size[0], small.size[1], size / 1024))
    print('total %.0f KB' % (total / 1024))

if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
