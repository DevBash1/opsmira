#!/usr/bin/env python3
"""Synthesise every sound effect of the film (no samples, no downloads): numpy + scipy only.

Writes 48 kHz stereo 16-bit WAVs to public/sfx/, each peak-normalised to -3 dBFS. Levels in the film are set per cue
(scripts/beats.mjs -> sfx), so these files only carry character: soft key ticks, a mouse click, pill ticks, a gauge
sweep, whooshes, the Approve click with its low bloom, the outbound "dial", the end chime.

    python3 scripts/audio/make_sfx.py            # all
    python3 scripts/audio/make_sfx.py chime key_a  # just these
"""
import os
import sys

import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(__file__))
from dsp import (  # noqa: E402
    SR,
    bandpass,
    db,
    fade_out,
    exp_env,
    highpass,
    lowpass,
    n_of,
    pad_to,
    pan,
    peak_norm,
    reverb,
    sine,
    stft_sweep_noise,
    swell_env,
    sweep,
    t_of,
    widen,
    write_wav,
)

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "sfx")
rng = np.random.default_rng(20261024)
SOUNDS = {}


def sound(fn):
    SOUNDS[fn.__name__] = fn
    return fn


def noise(n):
    return rng.standard_normal(n)


def mono_to_stereo(x, p=0.0, wide=True):
    return pan(x, p) if not wide else pan(widen(x)[0] * 0 + x, p) * 1.0


# ---------------------------------------------------------------- keys and clicks


def _key(f0, bright, decay, click_amp=0.55, length=0.11):
    n = n_of(length)
    t = t_of(n)
    body = np.sin(2 * np.pi * f0 * t * (1 + 0.2 * np.exp(-t / 0.005))) * np.exp(-t / decay)
    click = bandpass(noise(n), 2300 * bright, 7600 * bright) * np.exp(-t / 0.0016)
    click2 = bandpass(noise(n), 900, 2200) * np.exp(-t / 0.004) * 0.35
    x = body + click_amp * click + click2
    x = lowpass(x, 9500, 2)
    x *= np.minimum(1.0, t / 0.0004)
    return x


def _stereo_key(x, p):
    return pan(x, p)


@sound
def key_a():
    return _stereo_key(_key(205, 0.95, 0.011), -0.05)


@sound
def key_b():
    return _stereo_key(_key(232, 1.08, 0.010), 0.04)


@sound
def key_c():
    return _stereo_key(_key(186, 0.9, 0.012), 0.0)


@sound
def key_d():
    return _stereo_key(_key(250, 1.15, 0.009), 0.06)


@sound
def key_space():
    return _stereo_key(_key(128, 0.8, 0.017, click_amp=0.35, length=0.14), 0.0)


@sound
def key_enter():
    x = _key(142, 0.85, 0.021, click_amp=0.5, length=0.18)
    sub = sine(68, len(x)) * exp_env(len(x), 0.05) * 0.5
    return _stereo_key(x + sub, 0.0)


@sound
def click():
    n = n_of(0.16)
    t = t_of(n)
    down = bandpass(noise(n), 1700, 8200) * np.exp(-t / 0.0013) + 0.7 * sine(2500, n) * np.exp(-t / 0.0035)
    up = np.roll(down, n_of(0.072)) * 0.42
    up[: n_of(0.07)] = 0
    x = lowpass(down + up, 10000, 2)
    return pan(x, 0.0)


@sound
def tick():
    n = n_of(0.09)
    t = t_of(n)
    x = sine(1480, n) * np.exp(-t / 0.011) + 0.4 * bandpass(noise(n), 3000, 9000) * np.exp(-t / 0.0013)
    return pan(lowpass(x, 9000, 2), 0.0)


@sound
def tick_up():
    n = n_of(0.16)
    t = t_of(n)
    a = sine(1180, n) * np.exp(-t / 0.014)
    b = np.roll(sine(1770, n) * np.exp(-t / 0.018), n_of(0.045))
    b[: n_of(0.045)] = 0
    return pan(lowpass(a + 0.8 * b, 8000, 2), 0.0)


@sound
def pop():
    n = n_of(0.22)
    t = t_of(n)
    x = sweep(420, 780, n) * np.exp(-t / 0.05) * np.minimum(1, t / 0.003)
    x += 0.25 * sweep(840, 1560, n) * np.exp(-t / 0.03)
    x += 0.2 * bandpass(noise(n), 1500, 5000) * np.exp(-t / 0.002)
    return reverb(pan(lowpass(x, 6000, 2), 0.0), mix=0.12, rt60=0.5)


@sound
def audit_tick():
    n = n_of(0.1)
    t = t_of(n)
    x = sine(2050, n) * np.exp(-t / 0.007) + 0.35 * bandpass(noise(n), 4000, 11000) * np.exp(-t / 0.0011)
    return pan(x, 0.0)


@sound
def risk_ticks():
    n = n_of(0.5)
    out = np.zeros(n)
    for k, f in enumerate([880, 1046, 1318]):
        off = n_of(0.13 * k)
        m = n - off
        tt = t_of(m)
        out[off:] += sine(f, m) * np.exp(-tt / 0.02) * np.minimum(1, tt / 0.002) * (0.75 + 0.15 * k)
    return reverb(pan(lowpass(out, 7000, 2), 0.0), mix=0.1, rt60=0.5)


# ---------------------------------------------------------------- sheens, sweeps, pings


@sound
def glass_in():
    n = n_of(0.7)
    env = swell_env(n, 0.14, 0.22, 0.42)
    air = highpass(bandpass(noise(n), 2600, 9500), 2200, 1) * env * 0.5
    glints = sum(sine(f, n) * np.exp(-((t_of(n) - c) ** 2) / (2 * 0.05**2)) for f, c in [(1568, 0.2), (2093, 0.3), (2637, 0.4)]) * 0.18
    return reverb(widen(lowpass(air + glints, 9500, 2)), mix=0.2, rt60=0.8)


@sound
def gauge():
    # a rising tone for the 1.1 s the ring fills, landing on a soft bell at its target pitch
    n = n_of(1.6)
    n1 = n_of(1.1)
    t1 = t_of(n1)
    trem = 1 - 0.14 * (0.5 - 0.5 * np.cos(2 * np.pi * 13 * t1))
    env = swell_env(n1, 0.1, 0.85, 0.25)
    rise = (sweep(330, 1500, n1) + 0.25 * sweep(660, 3000, n1)) * trem * env
    x = np.zeros(n)
    x[:n1] += rise
    tt = t_of(n - n1)
    x[n1:] += (sine(1500, n - n1) + 0.2 * sine(3000, n - n1)) * np.exp(-tt / 0.22) * 0.55 * np.minimum(1, tt / 0.004)
    return reverb(widen(lowpass(x, 4800, 2)), mix=0.22, rt60=0.9)


@sound
def ping_soft():
    n = n_of(1.8)
    t = t_of(n)
    x = sine(1318, n) * np.exp(-t / 0.32) + 0.22 * sine(2636, n) * np.exp(-t / 0.18) + 0.08 * sine(3951, n) * np.exp(-t / 0.08)
    x = fade_out(x * np.minimum(1, t / 0.004), 0.7)
    return reverb(widen(x), mix=0.35, rt60=1.4)


@sound
def wake():
    n = n_of(0.9)
    t = t_of(n)
    a = sine(659, n) * np.exp(-t / 0.16)
    b = np.roll(sine(880, n) * np.exp(-t / 0.2), n_of(0.11))
    b[: n_of(0.11)] = 0
    x = fade_out((a + 0.9 * b) * np.minimum(1, t / 0.005), 0.4)
    return reverb(widen(lowpass(x, 5000, 2)), mix=0.3, rt60=1.0)


@sound
def dial():
    n = n_of(1.9)
    t = t_of(n)
    rate = 5.5 + 5.0 * t / (n / SR)
    ph = 2 * np.pi * np.cumsum(rate) / SR
    pulses = (0.5 - 0.5 * np.cos(ph)) ** 3
    tone = sweep(300, 1250, n)
    body = tone * pulses
    air = bandpass(noise(n), 1800, 6500) * pulses * 0.12
    env = swell_env(n, 0.18, 1.35, 0.5)
    x = lowpass((body + air) * env, 5200, 2)
    # a left -> right drift: the signal leaves the machine and travels to the console
    p = np.linspace(-0.5, 0.55, n)
    a = (p + 1) * np.pi / 4
    st = np.stack([x * np.cos(a), x * np.sin(a)])
    return reverb(st, mix=0.2, rt60=1.1)


@sound
def arrive():
    n = n_of(2.2)
    t = t_of(n)
    f0 = 988
    x = 0
    for ratio, amp, tau in [(1, 1, 0.75), (2.0, 0.42, 0.42), (2.76, 0.2, 0.26), (4.16, 0.1, 0.13)]:
        x = x + amp * sine(f0 * ratio, n) * np.exp(-t / tau)
    x = fade_out(x * np.minimum(1, t / 0.003), 0.9)
    return reverb(widen(x), mix=0.4, rt60=1.8, hp=250)


@sound
def strike():
    n = n_of(0.34)
    t = t_of(n)
    cen = 7000 * (2200 / 7000) ** (t / (n / SR))
    sw = stft_sweep_noise(n, cen, 0.45, seed=3, nfft=1024)
    env = np.exp(-t / 0.09) * np.minimum(1, t / 0.004)
    x = sw * env * 2.0 + 0.5 * sine(2400, n) * np.exp(-t / 0.006)
    return pan(widen(x)[0], 0.0)


# ---------------------------------------------------------------- whooshes


def _whoosh(dur, lo, hi, end, pk, width, direction, seed, low=0.0):
    n = n_of(dur)
    t = t_of(n) / dur
    # centre frequency rises to `hi` at the peak, then falls to `end`
    cen = np.where(t < pk, lo * (hi / lo) ** (t / pk), hi * (end / hi) ** ((t - pk) / (1 - pk)))
    x = stft_sweep_noise(n, cen, width, seed=seed)
    env = np.sin(np.pi * np.clip(t, 0, 1)) ** 2.2
    env = env * np.where(t < pk, 1.0, 1.0)
    x = x * env
    if low:
        sub = sine(70, n) * env * low
        x = x + sub
    p = direction * np.cos(np.pi * t)  # pan sweeps across
    a = (p * 0.65 + 1) * np.pi / 4
    st = np.stack([x * np.cos(a), x * np.sin(a)])
    return reverb(st, mix=0.18, rt60=0.9)


@sound
def whoosh_a():
    return _whoosh(0.85, 220, 3600, 700, 0.42, 0.7, -1, 11)


@sound
def whoosh_b():
    return _whoosh(0.8, 300, 4200, 900, 0.4, 0.65, 1, 12)


@sound
def whoosh_c():
    return _whoosh(1.1, 160, 3000, 450, 0.45, 0.8, 1, 13, low=0.35)


@sound
def whoosh_small():
    return _whoosh(0.5, 400, 2600, 800, 0.45, 0.55, 1, 14)


# ---------------------------------------------------------------- the mark, the chime, the bloom


@sound
def mark_draw():
    n = n_of(1.9)
    t = t_of(n)
    rise = np.clip(t / 1.0, 0, 1) ** 1.6
    air = stft_sweep_noise(n, 700 * (6500 / 700) ** np.clip(t / 1.0, 0, 1), 0.5, seed=21) * rise * 0.5
    glide = sweep(440, 880, n) * rise * 0.5 * (t < 1.0)
    ting_t = np.clip(t - 1.0, 0, None)
    ting = (sine(1760, n) + 0.3 * sine(3520, n)) * np.exp(-ting_t / 0.28) * (t >= 1.0) * 0.55
    x = (air + glide + ting) * np.minimum(1, t / 0.02)
    return reverb(widen(lowpass(x, 9000, 2)), mix=0.3, rt60=1.4)


@sound
def chime():
    n = n_of(6.0)
    t = t_of(n)
    out = np.zeros(n)
    notes = [(587.33, 0.0, 1.0), (739.99, 0.13, 0.8), (880.0, 0.26, 0.85), (1318.51, 0.43, 0.6)]
    for f0, start, amp in notes:
        m = n - n_of(start)
        tt = t_of(m)
        v = np.zeros(m)
        for ratio, a, tau in [(1.0, 1.0, 2.4), (2.0, 0.45, 1.5), (3.01, 0.2, 0.9), (4.16, 0.1, 0.5), (5.43, 0.04, 0.3)]:
            v += a * sine(f0 * ratio, m) * np.exp(-tt / tau)
        v *= np.minimum(1, tt / 0.004) * amp
        out[n_of(start) :] += v
    x = fade_out(lowpass(out, 9500, 2), 2.0)
    st = widen(x, 0.6)
    return reverb(st, mix=0.45, rt60=2.8, hp=220, lp=6500)


@sound
def bloom_low():
    n = n_of(3.6)
    env = swell_env(n, 0.7, 1.6, 1.9)
    x = 0
    for f, a in [(73.4, 0.9), (110.0, 0.7), (146.8, 0.55), (220.0, 0.35), (293.7, 0.2), (440.0, 0.08)]:
        x = x + a * (sine(f, n) + 0.5 * sine(f * 1.003, n, 1.3))
    x = lowpass(x * env, 1200, 2)
    return reverb(widen(x, 0.5), mix=0.4, rt60=2.0, hp=60, lp=3000)


@sound
def approve():
    n = n_of(2.8)
    t = t_of(n)
    down = bandpass(noise(n), 900, 5200) * np.exp(-t / 0.0022) + 0.8 * sine(1750, n) * np.exp(-t / 0.006) + 0.5 * sine(240, n) * np.exp(-t / 0.03)
    bloom = 0
    for f, a in [(110.0, 1.0), (164.8, 0.62), (220.0, 0.5), (329.6, 0.3)]:
        bloom = bloom + a * sine(f, n) * np.minimum(1, t / 0.05) * np.exp(-t / 0.95)
    shimmer = sum(a * sine(f, n) * np.exp(-t / tau) for f, a, tau in [(880, 0.2, 0.4), (1320, 0.12, 0.3), (1760, 0.06, 0.2)])
    x = fade_out(lowpass(down * 0.9 + bloom * 0.55 + shimmer, 9000, 2), 1.2)
    return reverb(widen(x, 0.4), mix=0.32, rt60=1.8, hp=70)


# ---------------------------------------------------------------- the cold open


@sound
def impact():
    n = n_of(1.2)
    t = t_of(n)
    thud = sweep(130, 42, n) * np.exp(-t / 0.22)
    burst = lowpass(noise(n), 2200, 2) * np.exp(-t / 0.035)
    crack = bandpass(noise(n), 1500, 6000) * np.exp(-t / 0.004) * 0.5
    x = np.tanh(1.6 * (thud + 0.55 * burst)) + crack
    return reverb(widen(lowpass(x, 7000, 2), 0.3), mix=0.25, rt60=0.9, hp=40)


@sound
def chatter():
    dur = 3.4
    n = n_of(dur)
    out = np.zeros((2, n))
    t = 0.0
    r = np.random.default_rng(77)
    while t < dur:
        rate = 85 * np.exp(-t / 2.2) + 16  # ticks per second, thinning out as it goes quiet
        t += r.exponential(1.0 / rate)
        if t >= dur - 0.05:
            break
        m = n_of(r.uniform(0.002, 0.006))
        tick_ = bandpass(r.standard_normal(m), r.uniform(1800, 4200), r.uniform(5000, 10500)) * np.exp(-t_of(m) / (m / SR / 3))
        amp = r.uniform(0.15, 1.0) ** 1.5
        st = pan(tick_ * amp, r.uniform(-0.9, 0.9))
        i = n_of(t)
        out[:, i : i + m] += st[:, : n - i]
    env = swell_env(n, 0.06, dur - 1.4, 1.4)
    return out * env


@sound
def drone():
    dur = 3.8
    n = n_of(dur)
    t = t_of(n)
    saw1 = signal.sawtooth(2 * np.pi * 73.4 * t)
    saw2 = signal.sawtooth(2 * np.pi * 73.4 * 1.0075 * t + 1.1)
    minor2 = sine(77.8, n) * np.exp(-t / 1.2)
    sub = sine(36.7, n)
    x = 0.55 * saw1 + 0.5 * saw2 + 0.6 * minor2 + 0.7 * sub
    # a filter that closes as the tension lets go
    out = np.zeros(n)
    block = 4096
    for i in range(0, n, block):
        j = min(n, i + block)
        fc = 950 * (160 / 950) ** (min(1.0, (i / SR) / dur))
        sos = signal.butter(2, fc, btype="low", fs=SR, output="sos")
        if i == 0:
            zi = signal.sosfilt_zi(sos) * x[0]
        seg, zi = signal.sosfilt(sos, x[i:j], zi=zi)
        out[i:j] = seg
    trem = 1 - (0.38 * np.exp(-t / 2.2)) * (0.5 - 0.5 * np.cos(2 * np.pi * 3.1 * t))
    env = swell_env(n, 0.25, 2.1, 1.7)
    return widen(out * trem * env, 0.5)


@sound
def exhale():
    n = n_of(1.8)
    t = t_of(n)
    env = swell_env(n, 0.55, 0.55, 1.2)
    air = bandpass(noise(n), 500, 3200) * env * 0.5
    pad = 0
    for f, a in [(293.66, 1.0), (369.99, 0.7), (440.0, 0.8), (587.33, 0.35)]:
        pad = pad + a * sine(f, n)
    pad = pad * swell_env(n, 0.5, 0.5, 1.2) * 0.3
    return reverb(widen(lowpass(air + pad, 4500, 2), 0.5), mix=0.35, rt60=1.8)


def main(names):
    os.makedirs(OUT, exist_ok=True)
    todo = names or list(SOUNDS)
    for name in todo:
        x = SOUNDS[name]()
        if x.ndim == 1:
            x = widen(x)
        x = peak_norm(x, -3.0)
        # a 2 ms fade at both ends so no file can click when it is placed
        fade = n_of(0.002)
        x[:, :fade] *= np.linspace(0, 1, fade)
        x[:, -fade:] *= np.linspace(1, 0, fade)
        write_wav(os.path.join(OUT, f"{name}.wav"), x, bits=16)
        print(f"{name:12s} {x.shape[1] / SR:5.2f}s  rms {20 * np.log10(np.sqrt((x**2).mean()) + 1e-12):6.1f} dBFS")


if __name__ == "__main__":
    main(sys.argv[1:])
