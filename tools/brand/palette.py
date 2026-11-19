"""Extract the metallic tones and the paper white from the ÉKA logo and check WCAG contrast.
Usage: python palette.py <logo.jpg>"""
import sys
import numpy as np
from PIL import Image

img = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
px = img.reshape(-1, 3)
r, g, b = px[:, 0], px[:, 1], px[:, 2]
mx, mn = px.max(1), px.min(1)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)

def hexc(c):
    return '#%02X%02X%02X' % tuple(int(round(v)) for v in c)

# Background: brightest, near-neutral pixels
bg = px[(mx > 235) & (sat < 0.04)]
print('paper white (median):', hexc(np.median(bg, 0)), 'n=', len(bg))

# Metal: warm (r>g>b), saturated pixels
metal = px[(r > g) & (g > b) & (sat > 0.25) & (mx < 250)]
lum = metal @ np.array([0.2126, 0.7152, 0.0722])
print('metal pixels:', len(metal))
for q in (5, 15, 30, 50, 70, 85, 95):
    t = np.percentile(lum, q)
    sel = metal[np.abs(lum - t) < 4]
    print(f'  luminance p{q:02d}:', hexc(np.median(sel, 0)))

def rel_lum(hexs):
    c = np.array([int(hexs[i:i + 2], 16) for i in (1, 3, 5)]) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return c @ np.array([0.2126, 0.7152, 0.0722])

def contrast(a, b):
    la, lb = sorted([rel_lum(a), rel_lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)

if len(sys.argv) > 2:
    pairs = [p.split(':') for p in sys.argv[2:]]
    for fg, bgc in pairs:
        print(f'{fg} on {bgc}: {contrast(fg, bgc):.2f}:1')
