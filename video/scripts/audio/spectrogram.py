#!/usr/bin/env python3
"""Draw spectrograms (log frequency, dB colour) of wav files into one PNG, so sounds can be checked by eye.

    python3 scripts/audio/spectrogram.py out/tmp/spec.png public/sfx/chime.wav public/sfx/whoosh_a.wav ...
    python3 scripts/audio/spectrogram.py out/tmp/spec.png master.wav --seconds 0:20   # a window of a long file
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import signal

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, read_wav  # noqa: E402


def colour(v):
    """0..1 -> a dark-blue to yellow ramp."""
    stops = [(0.0, (8, 10, 24)), (0.35, (40, 40, 120)), (0.6, (170, 60, 140)), (0.82, (245, 150, 60)), (1.0, (255, 245, 170))]
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if v <= b:
            k = (v - a) / (b - a)
            return tuple(int(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
    return stops[-1][1]


def render(path, w=900, h=220, window=None):
    x = read_wav(path).mean(axis=0)
    if window:
        a, b = window
        x = x[int(a * SR) : int(b * SR)]
    dur = len(x) / SR
    nper = 2048 if dur > 1 else 1024
    f, t, S = signal.spectrogram(x, fs=SR, nperseg=nper, noverlap=nper * 3 // 4, mode="magnitude")
    S = 20 * np.log10(S + 1e-9)
    top = S.max()
    S = np.clip((S - (top - 80)) / 80, 0, 1)
    fmin, fmax = 40, 16000
    img = Image.new("RGB", (w, h), (8, 10, 24))
    px = img.load()
    fi = np.geomspace(fmin, fmax, h)
    rows = np.searchsorted(f, fi).clip(0, len(f) - 1)
    cols = np.linspace(0, len(t) - 1, w).astype(int)
    for y in range(h):
        for xx in range(w):
            px[xx, h - 1 - y] = colour(S[rows[y], cols[xx]])
    d = ImageDraw.Draw(img)
    d.text((6, 4), f"{os.path.basename(path)}  {dur:.2f}s  peak {20 * np.log10(np.abs(x).max() + 1e-12):.1f} dBFS", fill=(255, 255, 255))
    for hz in (100, 1000, 10000):
        y = h - 1 - int(np.log(hz / fmin) / np.log(fmax / fmin) * (h - 1))
        d.line([(0, y), (w, y)], fill=(255, 255, 255, 40), width=1)
        d.text((w - 44, y - 11), f"{hz}", fill=(200, 200, 200))
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--seconds", default=None, help="a:b window in seconds")
    ap.add_argument("--width", type=int, default=900)
    ap.add_argument("--height", type=int, default=200)
    a = ap.parse_args()
    window = tuple(float(v) for v in a.seconds.split(":")) if a.seconds else None
    tiles = [render(p, a.width, a.height, window) for p in a.files]
    sheet = Image.new("RGB", (a.width, a.height * len(tiles)))
    for i, im in enumerate(tiles):
        sheet.paste(im, (0, i * a.height))
    sheet.save(a.out)
    print(a.out, sheet.size)


if __name__ == "__main__":
    main()
