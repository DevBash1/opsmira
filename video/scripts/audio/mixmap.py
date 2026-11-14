#!/usr/bin/env python3
"""Draw a picture of the mix, so balance can be judged by eye: voice / sfx / music / master levels (dB, 100 ms RMS)
over time with the scene cuts marked, plus every sound cue as a tick.

    python3 scripts/audio/mixmap.py out/tmp/mixmap.png out/tmp/stems [public/audio/master.wav]
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, read_wav  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def env_db(x, win=0.1):
    x = x.mean(axis=0) if x.ndim == 2 else x
    n = int(SR * win)
    m = len(x) // n
    r = np.sqrt((x[: m * n].reshape(m, n) ** 2).mean(axis=1) + 1e-12)
    return 20 * np.log10(r)


def main():
    out, stems = sys.argv[1], sys.argv[2]
    master = sys.argv[3] if len(sys.argv) > 3 else os.path.join(ROOT, "public", "audio", "master.wav")
    tl = json.load(open(os.path.join(ROOT, "src", "timeline.generated.json")))
    curves = [
        ("voice", env_db(read_wav(os.path.join(stems, "vo.wav"))), (120, 220, 190)),
        ("sfx", env_db(read_wav(os.path.join(stems, "sfx.wav"))), (240, 170, 90)),
        ("music", env_db(read_wav(os.path.join(stems, "music.wav"))), (140, 160, 255)),
        ("master", env_db(read_wav(master)), (235, 235, 235)),
    ]
    dur = tl["durationSeconds"]
    W, H = 1800, 120 * len(curves) + 70
    img = Image.new("RGB", (W, H), (14, 18, 16))
    d = ImageDraw.Draw(img)
    x0 = 70
    sx = (W - x0 - 10) / dur
    lo, hi = -70.0, 0.0
    for r, (name, c, col) in enumerate(curves):
        top = 40 + r * 120
        d.text((6, top + 4), name, fill=col)
        d.line([(x0, top + 110), (W - 10, top + 110)], fill=(50, 60, 55))
        for g in (-60, -40, -20):
            y = top + 110 - (g - lo) / (hi - lo) * 105
            d.line([(x0, y), (W - 10, y)], fill=(36, 44, 40))
            d.text((x0 - 34, y - 5), str(g), fill=(110, 120, 115))
        pts = []
        for i, v in enumerate(c):
            t = i * 0.1
            y = top + 110 - (np.clip(v, lo, hi) - lo) / (hi - lo) * 105
            pts.append((x0 + t * sx, y))
        d.line(pts, fill=col, width=1)
    for sid in tl["sceneOrder"][1:]:
        x = x0 + tl["scenes"][sid]["cut"] * sx
        d.line([(x, 30), (x, H - 30)], fill=(90, 100, 160))
        d.text((x + 3, 16), sid, fill=(150, 160, 230))
    for c in tl["sfx"]:
        if c["file"].startswith("key_"):
            continue
        x = x0 + c["t"] * sx
        d.line([(x, H - 28), (x, H - 14)], fill=(240, 170, 90))
    for k in range(0, int(dur) + 1, 5):
        x = x0 + k * sx
        d.text((x - 6, H - 12), f"{k}", fill=(150, 160, 155))
    img.save(out)
    print(out, img.size)


if __name__ == "__main__":
    main()
