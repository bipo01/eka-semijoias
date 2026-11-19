"""Binary mask of a logo raster (transparent or white bg) for potrace. Usage: trace.py <in> <out.pbm> [scale]"""
import sys
import numpy as np
from PIL import Image, ImageFilter
src, dst = sys.argv[1], sys.argv[2]
scale = int(sys.argv[3]) if len(sys.argv) > 3 else 3
im = Image.open(src).convert('RGBA')
bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
im = bg.convert('RGB').resize((im.width * scale, im.height * scale), Image.LANCZOS)
a = np.asarray(im).astype(float) / 255
mx, mn = a.max(-1), a.min(-1)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-3), 0)
m = (sat > 0.14) | ((1 - mn) > 0.30)
mi = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))
Image.fromarray(255 - np.asarray(mi)).convert('1').save(dst)
