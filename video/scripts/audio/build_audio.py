#!/usr/bin/env python3
"""Mix the film's soundtrack from the timeline.

    voice   public/voice/*.mp3      each line levelled to the same speech loudness, lightly compressed, placed at its start
  + sfx     public/sfx/*.wav        every cue in timeline.sfx (same frames as the picture), a little ducked under speech
  + music   public/music/*.wav      a Mixkit track from the cut out of the hook, ducked under speech, faded out at the end
  = public/audio/master.wav         48 kHz stereo 24-bit, ~ -16 LUFS integrated, true peak below -1.5 dBTP

Everything is read from src/timeline.generated.json, so the sound re-times itself whenever `npm run timeline` does.
No API key is needed (the voice clips are already cached as mp3s).

    python3 scripts/audio/build_audio.py [--no-music] [--target -16] [--stems out/tmp/stems] [--out public/audio/master.wav]
"""
import argparse
import json
import os
import re
import subprocess
import sys
from fractions import Fraction

import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, db, n_of, read_wav, write_wav  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
VO_ACTIVE_DB = -20.0  # every line is levelled to this active-speech RMS (dBFS) before the bus is mixed


# ------------------------------------------------------------------------------------------------ measurement
def measure(path, frames=False):
    """EBU R128 via ffmpeg: integrated loudness, loudness range, true peak (and optionally the short-term curve)."""
    af = "ebur128=peak=true" + (":framelog=verbose" if frames else "")
    # the per-frame log is only printed at the verbose log level
    r = subprocess.run(["ffmpeg", "-nostats", "-hide_banner"] + (["-v", "verbose"] if frames else []) + ["-i", path, "-af", af, "-f", "null", "-"], capture_output=True, text=True)
    txt = r.stderr
    summ = txt[txt.rfind("Summary:") :]
    out = {
        "I": float(re.search(r"I:\s+(-?[\d.]+) LUFS", summ).group(1)),
        "LRA": float(re.search(r"LRA:\s+(-?[\d.]+) LU", summ).group(1)),
        "TP": float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summ).group(1)),
    }
    if frames:
        out["curve"] = [
            (float(m.group(1)), float(m.group(2)), float(m.group(3)))
            for m in re.finditer(r"t:\s*([\d.]+)\s+TARGET:\S+ LUFS\s+M:\s*(-?[\d.]+|-inf)\s+S:\s*(-?[\d.]+|-inf)", txt)
        ]
    return out


def write_tmp(x, name):
    os.makedirs(os.path.join(ROOT, "out", "tmp", "audio"), exist_ok=True)
    p = os.path.join(ROOT, "out", "tmp", "audio", name)
    write_wav(p, x, bits=24)
    return p


# ------------------------------------------------------------------------------------------------ small DSP
def decode_mono(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype="<f4").astype(np.float64)


def active_rms_db(x, frame=0.02, span=30.0):
    """RMS of the 'speaking' frames: those within `span` dB of the loudest frame."""
    n = int(SR * frame)
    m = len(x) // n
    fr = x[: m * n].reshape(m, n)
    p = (fr**2).mean(axis=1) + 1e-14
    lv = 10 * np.log10(p)
    keep = lv > lv.max() - span
    return 10 * np.log10(p[keep].mean())


def compressor(x, thresh_db=-13.0, ratio=3.0, attack=0.003, release=0.08, block=96):
    """Peak control, not squash: only the loudest syllables (above -13 dBFS when speech sits at -20) are pulled down, 3:1.
    Gain is computed per 2 ms block and smoothed."""
    nb = len(x) // block
    pk = np.abs(x[: nb * block]).reshape(nb, block).max(axis=1) + 1e-9
    lvl = 20 * np.log10(pk)
    target = np.where(lvl > thresh_db, -(lvl - thresh_db) * (1 - 1 / ratio), 0.0)
    a_att = np.exp(-block / SR / attack)
    a_rel = np.exp(-block / SR / release)
    g = np.zeros(nb)
    cur = 0.0
    for i in range(nb):
        t = target[i]
        cur = (a_att if t < cur else a_rel) * cur + (1 - (a_att if t < cur else a_rel)) * t
        g[i] = cur
    gain = db(np.interp(np.arange(len(x)), (np.arange(nb) + 0.5) * block, g))
    return x * gain


def smooth_follow(target, block_s, attack, release):
    """One-pole follower with different attack (target falling) and release (target rising) times."""
    a_att = np.exp(-block_s / max(attack, 1e-4))
    a_rel = np.exp(-block_s / max(release, 1e-4))
    out = np.zeros(len(target))
    cur = 0.0
    for i, t in enumerate(target):
        a = a_att if t < cur else a_rel
        cur = a * cur + (1 - a) * t
        out[i] = cur
    return out


def duck_curve(vo, n, depth_db, attack, release, lead=0.12, block_s=0.01):
    """Gain (linear, per sample) that dips by depth_db while the voice speaks, starting `lead` s before it does."""
    nb = int(np.ceil(n / (SR * block_s)))
    blk = int(SR * block_s)
    v = np.zeros(nb * blk)
    v[: len(vo)] = np.abs(vo)[: len(v)]
    env = v.reshape(nb, blk).max(axis=1)
    speaking = (env > db(-48)).astype(float)
    # bridge the tiny gaps between words so the music does not pump between syllables
    k = max(1, int(0.28 / block_s))
    speaking = np.convolve(speaking, np.ones(k), mode="same") > 0
    shift = int(round(lead / block_s))
    speaking = np.roll(speaking, -shift)
    if shift:
        speaking[-shift:] = False
    target = np.where(speaking, depth_db, 0.0)
    g = smooth_follow(target, block_s, attack, release)
    return db(np.interp(np.arange(n), (np.arange(nb) + 0.5) * blk, g))


def resample_rate(x, rate):
    """Pitch/time shift by `rate` (1.25 = a major third up and 20% shorter) with a polyphase resampler."""
    fr = Fraction(rate).limit_denominator(40)
    return signal.resample_poly(x, fr.denominator, fr.numerator, axis=-1)


def balance(x, p):
    """Constant-power balance for a stereo (2, n) signal; p in -1..1, 0 = untouched."""
    if abs(p) < 1e-6:
        return x
    a = (p + 1) * np.pi / 4
    out = x.copy()
    out[0] *= np.cos(a) * np.sqrt(2)
    out[1] *= np.sin(a) * np.sqrt(2)
    return out


def limiter(x, ceiling_db=-2.0, look=0.004):
    """A transparent look-ahead peak limiter: the gain dips smoothly before a peak and recovers after it."""
    c = db(ceiling_db)
    peak = np.abs(x).max(axis=0)
    need = np.minimum(1.0, c / (peak + 1e-12))
    w = max(2, int(look * SR))
    from scipy.ndimage import minimum_filter1d, uniform_filter1d

    g = minimum_filter1d(need, size=2 * w + 1, mode="nearest")
    g = uniform_filter1d(g, size=w, mode="nearest")
    return x * g, float(20 * np.log10(g.min()))


# ------------------------------------------------------------------------------------------------ the mix
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-music", action="store_true")
    ap.add_argument("--music", default=None, help="a different bed than the timeline's, relative to public/ (e.g. music/mixkit-134.wav)")
    ap.add_argument("--target", type=float, default=-16.0, help="integrated loudness, LUFS")
    ap.add_argument("--ceiling", type=float, default=-2.3, help="limiter ceiling, dBFS (sample peak)")
    ap.add_argument("--stems", default=None, help="also write vo/sfx/music stems to this directory")
    ap.add_argument("--out", default=os.path.join(ROOT, "public", "audio", "master.wav"))
    a = ap.parse_args()

    tl = json.load(open(os.path.join(ROOT, "src", "timeline.generated.json")))
    n = n_of(tl["durationInFrames"] / tl["fps"])
    report = {"samples": n, "seconds": n / SR}

    # ---- voice
    vo = np.zeros(n)
    rep_lines = []
    for lid in tl["voiceOrder"]:
        v = tl["voice"][lid]
        x = decode_mono(os.path.join(ROOT, "public", v["file"]))
        lvl = active_rms_db(x)
        x = x * db(VO_ACTIVE_DB - lvl)
        sos = signal.butter(2, 80, btype="high", fs=SR, output="sos")
        x = signal.sosfilt(sos, x)
        x = compressor(x)
        f_in, f_out = n_of(0.004), n_of(0.03)
        x[:f_in] *= np.linspace(0, 1, f_in)
        x[-f_out:] *= np.linspace(1, 0, f_out)
        i = n_of(v["start"])
        seg = x[: max(0, n - i)]
        vo[i : i + len(seg)] += seg
        rep_lines.append({"id": lid, "was_dB": round(lvl, 2), "peak_dBFS": round(float(20 * np.log10(np.abs(x).max())), 2)})
    report["voice"] = rep_lines
    vo2 = np.stack([vo, vo])

    # ---- sfx
    cache = {}
    # extra dB per file, written by fetch_sounds.py for recordings too peaky to be levelled inside the file
    trims_p = os.path.join(ROOT, "public", "sfx", "levels.json")
    trims = json.load(open(trims_p)) if os.path.exists(trims_p) else {}
    sfx = np.zeros((2, n))
    placed = []
    for c in tl["sfx"]:
        key = (c["file"], c.get("rate"))
        if key not in cache:
            w = read_wav(os.path.join(ROOT, "public", "sfx", f"{c['file']}.wav"))
            cache[key] = resample_rate(w, c["rate"]) if c.get("rate") and abs(c["rate"] - 1) > 1e-3 else w
        w = balance(cache[key], c.get("pan", 0.0)) * db(c["gain"] + trims.get(c["file"], 0.0))
        i = n_of(c["t"])
        if i >= n:
            continue
        seg = w[:, : n - i]
        sfx[:, i : i + seg.shape[1]] += seg
        placed.append((c["name"], c["t"], float(20 * np.log10(np.abs(w).max() + 1e-12))))
    # sound effects sit back a little while the voice speaks, so a shimmer never fights a word
    sfx_duck = duck_curve(vo, n, -2.5, attack=0.06, release=0.35, lead=0.05)
    sfx *= sfx_duck

    # ---- music
    music = np.zeros((2, n))
    mus = tl.get("music")
    if mus and not a.no_music:
        w = read_wav(os.path.join(ROOT, "public", a.music or mus["file"]))
        # `at` is where the track comes in: seconds, or the name of an event in the timeline
        at = mus.get("at", 0)
        s0 = n_of(tl["events"][at]["t"] if isinstance(at, str) else at)
        m = max(0, min(n - s0, w.shape[1]))
        music[:, s0 : s0 + m] = w[:, :m]
        fi = n_of(mus.get("fadeIn", 0))
        if fi > 1:
            music[:, s0 : s0 + fi] *= np.linspace(0, 1, fi)[None, :]
        # level it in loudness units while it is on its own, then fade out at the very end
        meas = measure(write_tmp(music, "music_raw.wav"))
        music *= db(mus["lufs"] - meas["I"])
        fo = n_of(mus.get("fadeOut", 2.0))
        music[:, -fo:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo)))[None, :]
        music *= duck_curve(vo, n, mus["duckDb"], attack=mus["attack"], release=mus["release"], lead=0.15)
        report["music_measured_LUFS_before"] = meas["I"]

    # ---- sum, tidy, loudness
    mix = vo2 + sfx + music
    sos = signal.butter(2, 28, btype="high", fs=SR, output="sos")
    mix = signal.sosfilt(sos, mix, axis=-1)
    # a 10 ms fade-in and the music/sfx tails fade by themselves; close the very end gently
    f_end = n_of(0.5)
    mix[:, -f_end:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, f_end)))[None, :]

    if a.stems:
        os.makedirs(a.stems, exist_ok=True)
        write_wav(os.path.join(a.stems, "vo.wav"), vo2)
        write_wav(os.path.join(a.stems, "sfx.wav"), sfx)
        write_wav(os.path.join(a.stems, "music.wav"), music)

    gain = 0.0
    final = mix
    for it in range(4):
        trial = mix * db(gain)
        trial, gr = limiter(trial, a.ceiling)
        m = measure(write_tmp(trial, "trial.wav"))
        err = a.target - m["I"]
        print(f"  pass {it}: gain {gain:+.2f} dB -> {m['I']:.2f} LUFS, true peak {m['TP']:.2f} dBTP, limiter max reduction {gr:.2f} dB")
        final = trial
        report["limiter_max_reduction_dB"] = round(gr, 2)
        if abs(err) < 0.08 and m["TP"] <= -1.55:
            break
        gain += err
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    write_wav(a.out, final, bits=24)
    # a small mp3 of the same mix, so Remotion Studio can play the sound while previewing (the final mux uses the wav)
    prev = os.path.join(os.path.dirname(a.out), "preview.mp3")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", a.out, "-c:a", "libmp3lame", "-b:a", "192k", prev], check=True)
    m = measure(a.out, frames=True)
    report.update({"integrated_LUFS": m["I"], "LRA": m["LRA"], "true_peak_dBTP": m["TP"], "master_gain_dB": round(gain, 2)})
    report["loudest_sfx"] = sorted(((nm, round(t, 2), round(pk + gain, 1)) for nm, t, pk in placed), key=lambda r: -r[2])[:10]
    short = [(t, s) for (t, _m, s) in m["curve"] if s > -70]
    report["short_term_max_LUFS"] = max(s for _, s in short) if short else None
    print(f"master: {m['I']:.2f} LUFS integrated, LRA {m['LRA']:.1f} LU, true peak {m['TP']:.2f} dBTP -> {os.path.relpath(a.out, ROOT)}")
    if a.stems:
        for nm in ("vo", "sfx", "music"):
            sm = measure(os.path.join(a.stems, f"{nm}.wav"))
            print(f"  stem {nm:6s} {sm['I']:.1f} LUFS (before master gain {gain:+.1f} dB)")
            report[f"stem_{nm}_LUFS"] = sm["I"]
    os.makedirs(os.path.join(ROOT, "out", "tmp"), exist_ok=True)
    json.dump(report, open(os.path.join(ROOT, "out", "tmp", "mix-report.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
