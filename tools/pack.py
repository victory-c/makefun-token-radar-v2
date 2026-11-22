"""Fit captured screenshots into the dossier budget (each <= 350 KB, the rules ask 300-350 KB).

    python3 tools/pack.py <captured dir> screenshots/

A PNG that already fits is kept as PNG (optimised); otherwise the highest JPEG quality that fits,
with 4:4:4 chroma so coloured text stays sharp.
"""
import io
import os
import sys

from PIL import Image

CAP = 350 * 1024
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for old in os.listdir(dst):
    if old.lower().endswith((".png", ".jpg", ".jpeg")):
        os.remove(os.path.join(dst, old))

for name in sorted(os.listdir(src)):
    if not name.endswith(".png"):
        continue
    im = Image.open(os.path.join(src, name)).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    if buf.tell() <= CAP:
        out, data = name, buf.getvalue()
    else:
        out, data = name[:-4] + ".jpg", None
        for q in range(97, 60, -1):
            b = io.BytesIO()
            im.save(b, "JPEG", quality=q, subsampling=0, optimize=True)
            if b.tell() <= CAP:
                data = b.getvalue()
                break
        assert data is not None, name
    with open(os.path.join(dst, out), "wb") as f:
        f.write(data)
    print(f"{out}: {im.size[0]}x{im.size[1]} {len(data) // 1024} KB")
