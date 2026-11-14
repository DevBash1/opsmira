#!/usr/bin/env python3
"""Checks a finished deliverable and prints what it found (and writes out/tmp/verify-<name>.json).

    python3 scripts/verify.py out/opsmira-launch-16x9.mp4

  - container and streams (ffprobe): size, fps, codecs, pixel format, colour tags, durations, start times
  - loudness of the muxed audio (ffmpeg ebur128, true peak): integrated, loudness range, true peak
  - black frames (ffmpeg blackdetect, strict thresholds so the dark theme is not flagged)
  - audio alignment: decode the mp4's audio, cross-correlate it with public/audio/master.wav (should be 0 ms)
  - cue alignment: onset of sharp sound cues in the mp4's audio against their time in the timeline (only cues that start
    out of silence are measurable; where another sound plays underneath the result is null)

The picture side of the sync check is done by eye on frames around an event (see README): every cue and every visual
move hangs on the same named event in scripts/beats.mjs, so what is measured here is that the encoded file keeps them there.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
from scipy import signal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "audio"))
from dsp import SR, read_wav  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TL = json.load(open(os.path.join(ROOT, "src", "timeline.generated.json")))
FPS = TL["fps"]


def run(argv, **kw):
    return subprocess.run(argv, capture_output=True, **kw)


def probe(path):
    r = run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", path])
    return json.loads(r.stdout)


def loudness(path):
    r = run(["ffmpeg", "-nostats", "-i", path, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"])
    txt = r.stderr.decode(errors="replace")
    tail = txt[txt.rfind("Summary:") :]
    g = lambda pat: float(re.search(pat, tail).group(1))
    return {"integrated_LUFS": g(r"I:\s+(-?[\d.]+) LUFS"), "LRA_LU": g(r"LRA:\s+([\d.]+) LU"), "true_peak_dBTP": g(r"Peak:\s+(-?[\d.]+) dBFS")}


def black_frames(path):
    r = run(["ffmpeg", "-nostats", "-i", path, "-an", "-vf", "blackdetect=d=0.04:pix_th=0.02:pic_th=0.985", "-f", "null", "-"])
    return re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", r.stderr.decode(errors="replace"))


def decode_audio(path):
    r = run(["ffmpeg", "-v", "error", "-i", path, "-vn", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"])
    return np.frombuffer(r.stdout, dtype="<f4").reshape(-1, 2).T


def envelope(x, hop=48):
    m = x.mean(axis=0)
    n = len(m) // hop
    return np.sqrt((m[: n * hop].reshape(n, hop) ** 2).mean(axis=1))  # 1 ms steps


def lag_ms(a, b):
    """Positive when `a` is later than `b`."""
    ea, eb = envelope(a), envelope(b)
    n = min(len(ea), len(eb))
    ea, eb = ea[:n] - ea[:n].mean(), eb[:n] - eb[:n].mean()
    c = signal.correlate(ea, eb, mode="full", method="fft")
    k = np.argmax(c) - (n - 1)
    return float(k)  # one envelope step is 1 ms


def onset(x, t, before=0.06, after=0.30):
    """First moment (seconds) the high-passed signal rises above 40 % of its peak inside the window around t."""
    m = x.mean(axis=0)
    sos = signal.butter(2, 600, btype="high", fs=SR, output="sos")
    a, b = int((t - before) * SR), int((t + after) * SR)
    seg = signal.sosfilt(sos, m[max(a, 0) : b])
    env = np.abs(seg)
    k = int(0.001 * SR)
    env = np.convolve(env, np.ones(k) / k, mode="same")
    peak = env.max()
    if peak < 1e-4:
        return None
    lead = int(before * SR * 0.8)  # the stretch just before the cue must be clearly quieter, or something else is playing underneath
    if env[:lead].max() > 0.32 * peak:
        return None
    idx = int(np.argmax(env > 0.4 * peak))
    return (max(a, 0) + idx) / SR


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out", "opsmira-launch-16x9.mp4")
    name = os.path.splitext(os.path.basename(path))[0]
    rep = {"file": path, "bytes": os.path.getsize(path)}

    info = probe(path)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = next(s for s in info["streams"] if s["codec_type"] == "audio")
    rep["container"] = {"duration_s": float(info["format"]["duration"]), "size_MB": round(int(info["format"]["size"]) / 1048576, 2), "bitrate_kbps": round(int(info["format"]["bit_rate"]) / 1000)}
    rep["video"] = {k: v.get(k) for k in ["codec_name", "profile", "width", "height", "pix_fmt", "r_frame_rate", "nb_frames", "duration", "start_time", "color_space", "color_primaries", "color_transfer", "color_range"]}
    rep["audio"] = {k: a.get(k) for k in ["codec_name", "profile", "sample_rate", "channels", "channel_layout", "bit_rate", "duration", "start_time"]}
    with open(path, "rb") as fh:
        head = fh.read(1 << 20)
    i, j = head.find(b"moov"), head.find(b"mdat")
    rep["faststart"] = i != -1 and (j == -1 or i < j)  # the index sits in front of the media data

    rep["loudness"] = loudness(path)
    rep["black_frames"] = black_frames(path)

    dec = decode_audio(path)
    master = read_wav(os.path.join(ROOT, "public", "audio", "master.wav"))
    n = min(dec.shape[1], master.shape[1])
    rep["audio_vs_master_lag_ms"] = lag_ms(dec[:, :n], master[:, :n])
    rep["audio_seconds"] = round(dec.shape[1] / SR, 3)

    sharp = [c for c in TL["sfx"] if c["file"] in ("impact", "click", "pop", "strike", "approve", "key_enter", "tick_up", "audit_tick")]
    picks = {}
    for c in sharp:
        picks.setdefault(c["file"], []).append(c)
    cues = []
    for file, lst in picks.items():
        for c in lst[:2]:
            o = onset(dec, c["t"])
            cues.append({"cue": c.get("name", file), "file": file, "t": round(c["t"], 3), "audio_onset_s": None if o is None else round(o, 3), "delta_ms": None if o is None else round((o - c["t"]) * 1000)})
    rep["cue_onsets"] = cues

    out = os.path.join(ROOT, "out", "tmp", f"verify-{name}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(rep, open(out, "w"), indent=2)

    print(json.dumps({k: rep[k] for k in ["container", "video", "audio", "faststart", "loudness", "black_frames", "audio_vs_master_lag_ms", "audio_seconds"]}, indent=1))
    print("cue onsets (audio, ms after the cue time):", [(c["file"], c["t"], c["delta_ms"]) for c in cues])
    print("->", out)


if __name__ == "__main__":
    main()
