#!/usr/bin/env python3
"""Fetch the film's sound effects and music from Mixkit (mixkit.co) and fit them to the cues.

Every file in public/sfx keeps its name, so the cues in scripts/beats.mjs do not change. Each recording is
  - trimmed and shifted so it lands where the cue expects it: "onset" sounds start 2 ms into the file, "peak" sounds
    (whooshes, swells, risers) put their loudest moment where the synthesised file had it, so a whoosh still peaks on
    the cut it belongs to,
  - shortened to a sensible length with a fade, so quick repeats do not pile up,
  - levelled to the same active loudness as the synthesised file it replaces (sfx-targets.json), so the per-cue gains still hold.
The typing sounds are single keystrokes cut out of two laptop typing recordings.

The music tracks are decoded to public/music/mixkit-<id>.wav (leading silence trimmed); `music.file` in
scripts/beats.mjs picks the one the mix uses. Downloads are cached in out/cache/mixkit.

    python3 scripts/audio/fetch_sounds.py              # sound effects and every track in MUSIC
    python3 scripts/audio/fetch_sounds.py --music-only
    python3 scripts/audio/fetch_sounds.py --sfx-only

The first cut's synthesised sounds can be rebuilt with `npm run sfx:synth` (overwrites public/sfx) and `npm run music:synth`
(public/music/bed.wav; point `music.file` at it to use it).
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, db, n_of, read_wav, write_wav  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CACHE = os.path.join(ROOT, "out", "cache", "mixkit")
SFX_DIR = os.path.join(ROOT, "public", "sfx")
TARGETS = os.path.join(os.path.dirname(__file__), "sfx-targets.json")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

# name in public/sfx -> recordings (Mixkit id, title, where its first transient lands in this sound in s, dB),
# how it is aligned, its longest length and the fade at its end (s)
SFX = {
    "chatter": dict(src=[(1040, "Glitch data noise", 0, 0)], align="onset", max=3.4, fade=1.2),
    "drone": dict(src=[(786, "Cinematic suspense swell", 0, 0)], align="onset", max=5.6, fade=1.0),
    "impact": dict(src=[(2299, "Short bass hit", 0, 0), (1021, "Cinematic glitch trailer", 0, -2)], align="onset", max=2.0, fade=0.8),
    "glass_in": dict(src=[(2578, "Opening software interface", 0, 0)], align="peak", max=1.0, fade=0.3),
    "exhale": dict(src=[(1482, "Ending wind swoosh", 0, 0)], align="peak", max=2.4, fade=0.6),
    "whoosh_a": dict(src=[(1481, "Cinematic swoosh", 0, 0)], align="peak", max=1.6, fade=0.4),
    "whoosh_b": dict(src=[(1490, "Fast whoosh transition", 0, 0)], align="peak", max=1.5, fade=0.4),
    "whoosh_c": dict(src=[(1492, "Cinematic whoosh fast transition", 0, 0)], align="peak", max=1.6, fade=0.4),
    "whoosh_small": dict(src=[(1462, "Quick swoosh", 0, 0)], align="peak", max=1.0, fade=0.3),
    "ping_soft": dict(src=[(3108, "Crystal chime", 0, 0)], align="onset", max=2.0, fade=0.6),
    "click": dict(src=[(1116, "Single classic click", 0, 0)], align="onset", max=0.15, fade=0.04),
    "pop": dict(src=[(3005, "Explainer video pops whoosh light pop", 0, 0)], align="onset", max=0.25, fade=0.06),
    "tick": dict(src=[(3124, "Modern technology select", 0, 0)], align="onset", max=0.12, fade=0.04),
    "tick_up": dict(src=[(1112, "Positive interface click", 0, 0)], align="onset", max=0.25, fade=0.08),
    "audit_tick": dict(src=[(1140, "Tech click", 0, 0)], align="onset", max=0.15, fade=0.05),
    "gauge": dict(src=[(3160, "Sci fi power up", 0, 0)], align="peak", max=2.2, fade=0.6),
    "approve": dict(src=[(1113, "Mouse click close", 0, 0), (2865, "Success software tone", 0.04, 0)], align="onset", max=2.0, fade=0.7),
    "dial": dict(src=[(2548, "Digital signal interference", 0, 0)], align="peak", max=3.0, fade=0.6),
    "arrive": dict(src=[(3123, "Technology notification", 0, 0)], align="onset", max=1.5, fade=0.5),
    "strike": dict(src=[(1464, "Quick swoosh accent", 0, 0)], align="onset", max=0.35, fade=0.1),
    "wake": dict(src=[(951, "Positive notification", 0, 0)], align="onset", max=2.0, fade=0.6),
    "bloom_low": dict(src=[(2900, "Movie logo intro impact", 0, 0)], align="peak", max=5.9, fade=1.5),
    "mark_draw": dict(src=[(2638, "Magic transition sweep presentation", 0, 0)], align="peak", max=3.0, fade=0.8),
    "chime": dict(src=[(938, "Uplifting bells notification", 0, 0)], align="onset", max=2.9, fade=0.4),
}
# risk_ticks is the new tick played at the moments the synthesised one ticked
RISK_FROM = "tick"
# keystrokes: cut from these recordings
TYPING = [(2537, "Laptop keyboard typing sequence"), (2531, "Typing on a laptop keyboard")]
KEY_LEN = {"key_a": 0.11, "key_b": 0.11, "key_c": 0.11, "key_d": 0.11, "key_space": 0.14, "key_enter": 0.2}

# music: id -> (title, artist)
MUSIC = {
    726: ("Uplifting Bass", "Lily J"),
    134: ("Deep Techno Ambience", "Alejandro Magaña"),
    69: ("Ramp It Up", "Ahjay Stelino"),
    720: ("New Bass 01", "Lily J"),
}


# ------------------------------------------------------------------------------------------------ io
def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    if not os.path.exists(p) or os.path.getsize(p) == 0:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r, open(p + ".part", "wb") as fh:
            fh.write(r.read())
        os.replace(p + ".part", p)
    return p


def decode(path):
    """Any audio file -> (2, n) float at 48 kHz."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype="<f4").reshape(-1, 2).T.astype(np.float64)


def sfx_source(i):
    return decode(fetch(f"https://assets.mixkit.co/active_storage/sfx/{i}/{i}.wav", f"sfx-{i}.wav"))


# ------------------------------------------------------------------------------------------------ measuring
def envelope(x, win=0.02):
    """Moving RMS of the louder channel (win seconds)."""
    m = np.abs(x).max(axis=0)
    k = max(1, int(win * SR))
    return np.sqrt(np.convolve(m**2, np.ones(k) / k, mode="same"))


def onset(x):
    m = np.abs(x).max(axis=0)
    return int(np.argmax(m > 0.1 * m.max()))


def peak(x):
    return int(envelope(x).argmax())


def active_rms(x, frame=0.01, span=20.0):
    """RMS of the frames within `span` dB of the loudest one: how loud the sound is while it sounds."""
    n = int(SR * frame)
    m = x.shape[1] // n
    p = (x[:, : m * n].reshape(2, m, n) ** 2).mean(axis=(0, 2)) + 1e-14
    lv = 10 * np.log10(p)
    return 10 * np.log10(p[lv > lv.max() - span].mean())


# ------------------------------------------------------------------------------------------------ shaping
def place(x, at_sample, length=None):
    """Shift x so its sample 0 lands at `at_sample` (negative cuts the front off)."""
    if at_sample >= 0:
        x = np.concatenate([np.zeros((2, at_sample)), x], axis=1)
    else:
        x = x[:, -at_sample:]
    if length is not None:
        x = x[:, :length] if x.shape[1] >= length else np.concatenate([x, np.zeros((2, length - x.shape[1]))], axis=1)
    return x


def fade_out(x, seconds):
    f = min(x.shape[1], n_of(seconds))
    if f > 1:
        x[:, -f:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, f)))[None, :]
    return x


def level_to(x, target_db, ceiling_db=-1.0):
    x = x * db(target_db - active_rms(x))
    pk = np.abs(x).max()
    if pk > db(ceiling_db):
        x *= db(ceiling_db) / pk
    return x


def build(name, spec, tgt):
    layers = []
    for i, _title, at, gain in spec["src"]:
        w = sfx_source(i) * db(gain)
        layers.append(place(w, n_of(at) - onset(w)))
    n = max(l.shape[1] for l in layers)
    x = sum(place(l, 0, n) for l in layers)
    if spec["align"] == "onset":
        x = place(x, n_of(0.002) - onset(x))
    else:
        shift = n_of(tgt["peak_s"]) - peak(x)
        x = place(x, shift)
        if shift < 0:  # the front of the swell was cut: bring it in instead of starting mid-air
            fi = max(n_of(0.03), int(peak(x) * 0.6))
            x[:, :fi] *= np.linspace(0, 1, fi)[None, :] ** 2
    x = x[:, : n_of(spec["max"])]
    x = fade_out(x, spec["fade"])
    return level_to(x, tgt["active_db"])


def tick_times(x):
    """(seconds, relative level) of each tick in a sound made of ticks."""
    m = envelope(x, 0.002)
    hits = []
    i = 0
    while i < len(m):
        if m[i] > 0.25 * m.max() and (not hits or i - hits[-1][0] > n_of(0.04)):
            j = i + int(np.argmax(m[i : i + n_of(0.01)]))
            hits.append((j, m[j]))
            i = j + n_of(0.04)
        i += 1
    return [[round(j / SR, 4), round(float(a / m.max()), 3)] for j, a in hits]


def risk_ticks(tick, tgt):
    """The new tick at each moment the synthesised risk_ticks ticked, at its relative levels."""
    x = np.zeros((2, n_of(tgt["len_s"])))
    for t, a in tgt["ticks"]:
        j = n_of(t) - onset(tick)
        seg = tick[:, : x.shape[1] - j] * a
        x[:, j : j + seg.shape[1]] += seg
    return level_to(x, tgt["active_db"]), len(tgt["ticks"])


def keystrokes():
    """Isolated keystrokes from the typing recordings: (stereo clip, peak dB, brightness) each."""
    hits = []
    for i, _title in TYPING:
        w = sfx_source(i)
        e = envelope(w, 0.002)
        fr = n_of(0.002)
        lv = 20 * np.log10(e[::fr] + 1e-9)
        floor = lv.max() - 40
        k = 10
        ons = []
        for f in range(k, len(lv) - 10):
            if lv[f] > floor and lv[f] - lv[f - k : f].min() > 14 and (not ons or f - ons[-1] > 20):
                ons.append(f)
        # a keystroke runs until the next one starts (keys come ~90 ms apart, so the clip stops there and fades)
        for a, b in zip(ons, ons[1:] + [len(lv)]):
            pre = lv[a - k : a - 2].max()
            hit = lv[a : a + 10].max()
            if hit - pre < 15 or (b - a) * 2 < 60:
                continue
            s = a * fr
            clip = w[:, max(0, s - n_of(0.004)) : min(b * fr - n_of(0.003), s + n_of(0.22))].copy()
            if np.abs(clip).max() > 0.98:  # clipped in the recording
                continue
            clip = fade_out(clip, 0.012)
            seg = clip.mean(axis=0)[: n_of(0.03)]
            sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
            fq = np.fft.rfftfreq(len(seg), 1 / SR)
            hits.append((clip, hit, float((sp * fq).sum() / sp.sum())))
    return hits


def build_keys():
    hits = keystrokes()
    if len(hits) < 8:
        raise SystemExit(f"only {len(hits)} isolated keystrokes found")
    lv = np.array([h[1] for h in hits])
    med = np.median(lv)
    out = {}
    loud = [h for h in hits if h[1] >= med]
    out["key_enter"] = max(hits, key=lambda h: h[1])
    rest = [h for h in loud if h is not out["key_enter"]]
    out["key_space"] = min(rest, key=lambda h: h[2])
    usual = sorted((h for h in hits if abs(h[1] - med) < 4 and h is not out["key_space"] and h is not out["key_enter"]), key=lambda h: h[2])
    if len(usual) < 4:
        usual = sorted((h for h in hits if h is not out["key_space"] and h is not out["key_enter"]), key=lambda h: abs(h[1] - med))[:4]
        usual.sort(key=lambda h: h[2])
    for name, q in zip(("key_a", "key_b", "key_c", "key_d"), (0.15, 0.4, 0.6, 0.85)):
        out[name] = usual[min(len(usual) - 1, int(q * len(usual)))]
    print(f"  keystrokes: {len(hits)} isolated hits found")
    return {k: v[0] for k, v in out.items()}


# ------------------------------------------------------------------------------------------------ main
def load_targets():
    """Loudness, peak time and length of each synthesised sound a recording stands in for. They were measured once from
    the `npm run sfx:synth` files and are kept in sfx-targets.json, so fitting needs neither those files nor a rebuild;
    delete the json (with the synthesised files in out/cache/sfx-synth) to measure again."""
    if os.path.exists(TARGETS):
        return json.load(open(TARGETS))
    src = os.path.join(ROOT, "out", "cache", "sfx-synth")
    t = {}
    for name in list(SFX) + list(KEY_LEN) + ["risk_ticks"]:
        x = read_wav(os.path.join(src, f"{name}.wav")).astype(np.float64)
        t[name] = {"active_db": round(float(active_rms(x)), 2), "peak_s": round(peak(x) / SR, 4), "len_s": round(x.shape[1] / SR, 4)}
    t["risk_ticks"]["ticks"] = tick_times(read_wav(os.path.join(src, "risk_ticks.wav")).astype(np.float64))
    json.dump(t, open(TARGETS, "w"), indent=1)
    return t


def do_sfx():
    T = load_targets()
    made = {}
    for name, spec in SFX.items():
        made[name] = build(name, spec, T[name])
    made["risk_ticks"], nt = risk_ticks(made[RISK_FROM], T["risk_ticks"])
    for name, clip in build_keys().items():
        x = place(clip, n_of(0.002) - onset(clip))[:, : n_of(KEY_LEN[name])]
        made[name] = level_to(fade_out(x, min(0.04, 0.4 * x.shape[1] / SR)), T[name]["active_db"])
    # a recording with sharper peaks than the synthesised sound cannot reach the same loudness under the -1 dBFS
    # ceiling; the difference goes to levels.json, which build_audio.py adds to every cue that plays the file
    trims = {}
    for name, x in made.items():
        write_wav(os.path.join(SFX_DIR, f"{name}.wav"), x)
        short = T[name]["active_db"] - active_rms(x)
        if short > 0.25:
            trims[name] = round(float(short), 2)
        print(f"  {name:13s} {x.shape[1] / SR:5.2f}s  active {active_rms(x):6.1f} dB (target {T[name]['active_db']:6.1f})  peak at {peak(x) / SR:5.3f}s (was {T[name]['peak_s']:5.3f})")
    print(f"  risk_ticks: {nt} ticks; level trims for build_audio.py: {trims}")
    json.dump(trims, open(os.path.join(SFX_DIR, "levels.json"), "w"), indent=1)


def do_music():
    os.makedirs(os.path.join(ROOT, "public", "music"), exist_ok=True)
    for i, (title, artist) in MUSIC.items():
        x = decode(fetch(f"https://assets.mixkit.co/music/{i}/{i}.mp3", f"music-{i}.mp3"))
        e = envelope(x, 0.01)
        start = max(0, int(np.argmax(e > e.max() * db(-45))) - n_of(0.005))
        x = x[:, start:]
        out = os.path.join(ROOT, "public", "music", f"mixkit-{i}.wav")
        write_wav(out, x)
        print(f"  mixkit-{i}.wav  {title} ({artist})  {x.shape[1] / SR:5.1f}s, lead-in trimmed {start / SR:.2f}s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sfx-only", action="store_true")
    ap.add_argument("--music-only", action="store_true")
    a = ap.parse_args()
    if not a.music_only:
        print("sound effects -> public/sfx")
        do_sfx()
    if not a.sfx_only:
        print("music -> public/music")
        do_music()


if __name__ == "__main__":
    main()
