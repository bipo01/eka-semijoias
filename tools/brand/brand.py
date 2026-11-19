"""Brand asset pipeline for ÉKA.

Steps:
  recolor  <in> <out>             gradient-map the metal back to the original logo's dusty rose-gold ramp
  alpha    <in> <out>             white-to-alpha (keeps soft edges; crystals become light, semi-opaque)
  mask     <in> <out.pbm> [thr]   binary mask of the metal (for potrace)
  info     <in>                   size + metal ramp
"""
import sys
import numpy as np
from PIL import Image

# Luminance ramp measured on docs/reference/logo-eka-*.jpg (p05..p95), plus anchors.
RAMP = [
    (0.00, (0x5A, 0x3A, 0x2E)),
    (0.30, (0x97, 0x65, 0x52)),
    (0.42, (0xA7, 0x7D, 0x6A)),
    (0.55, (0xB4, 0x8C, 0x78)),
    (0.68, (0xC9, 0x9D, 0x86)),
    (0.80, (0xDA, 0xAF, 0x96)),
    (0.90, (0xE6, 0xBE, 0xA4)),
    (1.00, (0xF6, 0xE4, 0xD6)),
]


def load(p):
    return np.asarray(Image.open(p).convert('RGBA')).astype(float)


def lum(rgb):
    return rgb[..., :3] @ np.array([0.2126, 0.7152, 0.0722]) / 255


def recolor(src, dst):
    a = load(src)
    rgb = a[..., :3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    L = lum(rgb)
    # metal = warm and saturated; crystals/white stay untouched
    warm = (rgb[..., 0] >= rgb[..., 2]) & (sat > 0.12)
    xs = [p for p, _ in RAMP]
    mapped = np.stack([np.interp(L, xs, [c[i] for _, c in RAMP]) for i in range(3)], -1)
    # blend proportionally to saturation so anti-aliased edges stay smooth
    w = np.clip((sat - 0.12) / 0.25, 0, 1)[..., None] * warm[..., None]
    out = rgb * (1 - w) + mapped * w
    Image.fromarray(np.dstack([out, a[..., 3]]).clip(0, 255).astype(np.uint8)).save(dst)


def alpha(src, dst):
    a = load(src)
    rgb = a[..., :3] / 255
    al = np.clip(1 - rgb.min(-1), 0, 1)  # distance from white
    al = np.clip((al - 0.02) / 0.98, 0, 1)
    safe = np.maximum(al, 1e-4)[..., None]
    col = np.clip((rgb - (1 - safe)) / safe, 0, 1)
    out = np.dstack([col * 255, al * 255 * (a[..., 3] / 255)])
    Image.fromarray(out.astype(np.uint8)).save(dst)


def mask(src, dst, thr=0.18):
    a = load(src)
    rgb = a[..., :3] / 255
    dark = (1 - rgb.min(-1)) * (a[..., 3] / 255)
    m = dark > thr
    Image.fromarray((~m * 255).astype(np.uint8)).convert('1').save(dst)


def info(src):
    a = load(src)
    print(src, a.shape[1], 'x', a.shape[0])


if __name__ == '__main__':
    cmd, *args = sys.argv[1:]
    {'recolor': recolor, 'alpha': alpha, 'info': info,
     'mask': lambda s, d, t=0.18: mask(s, d, float(t))}[cmd](*args)
