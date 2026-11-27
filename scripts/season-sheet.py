#!/usr/bin/env python3
# Pictures side by side with a label under each (needs PIL): the four seasons of a view.
#   python3 scripts/season-sheet.py out.png label=file.png [label=file.png ...] [--cols 2]
import sys
from PIL import Image, ImageDraw
args = sys.argv[1:]; cols = 2
if '--cols' in args: i = args.index('--cols'); cols = int(args[i + 1]); del args[i:i + 2]
out, items = args[0], [a.split('=', 1) for a in args[1:]]
ims = [(l, Image.open(f).convert('RGB')) for l, f in items]
w, h = ims[0][1].size; rows = (len(ims) + cols - 1) // cols; bar = 26
sheet = Image.new('RGB', (cols * w + (cols - 1) * 4, rows * (h + bar)), (18, 18, 20)); d = ImageDraw.Draw(sheet)
for k, (l, im) in enumerate(ims):
    x, y = (k % cols) * (w + 4), (k // cols) * (h + bar)
    sheet.paste(im.resize((w, h)), (x, y)); d.text((x + 8, y + h + 6), l, fill=(235, 235, 235))
sheet.save(out); print(out, sheet.size)
