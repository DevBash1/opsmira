#!/usr/bin/env python3
"""Measure a voice clip (16-bit mono wav) so voices and takes can be compared without listening.

Prints one JSON object: duration, active-speech level, peak, leading/trailing silence, voiced fraction,
pitch statistics (autocorrelation F0, in Hz and as a spread in semitones) and the energy of the last 80 ms
(a clean ending decays towards silence instead of being cut mid-sound).
"""
import json
import sys

import numpy as np
from scipy.io import wavfile


def frames(x, size, hop):
    n = 1 + max(0, (len(x) - size) // hop)
    idx = np.arange(size)[None, :] + hop * np.arange(n)[:, None]
    return x[idx]


def main(path):
    sr, x = wavfile.read(path)
    if x.ndim > 1:
        x = x.mean(axis=1)
    if x.dtype == np.int16:
        x = x.astype(np.float32) / 32768.0
    else:
        x = x.astype(np.float32)
    dur = len(x) / sr
    eps = 1e-9

    hop = int(sr * 0.010)
    win = int(sr * 0.025)
    fr = frames(np.pad(x, (0, win)), win, hop)
    rms = np.sqrt((fr**2).mean(axis=1) + eps)
    rms_db = 20 * np.log10(rms)
    peak_db = 20 * np.log10(np.abs(x).max() + eps)
    thr = max(-52.0, rms_db.max() - 38.0)
    voiced_idx = np.where(rms_db > thr)[0]
    if len(voiced_idx) == 0:
        print(json.dumps({"error": "silent"}))
        return
    lead = voiced_idx[0] * hop / sr
    trail = max(0.0, dur - (voiced_idx[-1] * hop + win) / sr)
    active = rms_db[rms_db > thr]
    active_rms_db = float(20 * np.log10(np.sqrt((10 ** (active / 10)).mean())))

    # Pitch: normalised autocorrelation on 40 ms frames.
    size = int(sr * 0.040)
    pf = frames(np.pad(x, (0, size)), size, hop)
    lo, hi = int(sr / 320), int(sr / 70)
    f0 = []
    for i in range(0, len(pf), 1):
        if rms_db[min(i, len(rms_db) - 1)] < thr + 4:
            continue
        seg = pf[i] - pf[i].mean()
        e = (seg**2).sum()
        if e < 1e-7:
            continue
        ac = np.correlate(seg, seg, mode="full")[size - 1 :]
        ac = ac / (ac[0] + eps)
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.45:
            f0.append(sr / k)
    f0 = np.array(f0)
    if len(f0) > 5:
        # drop octave jumps: keep the central 90 %
        a, b = np.percentile(f0, [5, 95])
        f0 = f0[(f0 >= a) & (f0 <= b)]
        semis = 12 * np.log2(f0 / np.median(f0))
        pitch = {
            "f0_median_hz": float(np.median(f0)),
            "f0_spread_semitones": float(semis.std()),
            "f0_range_semitones": float(semis.max() - semis.min()),
        }
    else:
        pitch = {"f0_median_hz": None, "f0_spread_semitones": None, "f0_range_semitones": None}

    tail = x[-int(sr * 0.08) :]
    tail_db = float(20 * np.log10(np.sqrt((tail**2).mean()) + eps))
    print(
        json.dumps(
            {
                "duration": round(dur, 3),
                "lead_silence": round(float(lead), 3),
                "trail_silence": round(float(trail), 3),
                "active_rms_db": round(active_rms_db, 2),
                "peak_db": round(float(peak_db), 2),
                "voiced_fraction": round(float(len(voiced_idx) / len(rms_db)), 3),
                "tail80_db": round(tail_db, 1),
                **{k: (None if v is None else round(v, 2)) for k, v in pitch.items()},
            }
        )
    )


if __name__ == "__main__":
    main(sys.argv[1])
