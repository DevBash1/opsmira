"""Small DSP helpers shared by the sound-design scripts (numpy + scipy only, 48 kHz throughout)."""
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000


def n_of(seconds):
    return int(round(seconds * SR))


def t_of(n):
    return np.arange(n) / SR


def db(x):
    return 10 ** (x / 20.0)


def exp_env(n, tau, attack=0.0005):
    """Exponential decay with a very short linear attack (avoids a click at the start)."""
    t = t_of(n)
    e = np.exp(-t / tau)
    if attack > 0:
        e = e * np.minimum(1.0, t / attack)
    return e


def swell_env(n, attack, release_start, release):
    """0 -> 1 over `attack`, then 1 until `release_start`, then back to 0 over `release` (raised-cosine edges)."""
    t = t_of(n)
    a = np.clip(t / max(attack, 1e-6), 0, 1)
    a = 0.5 - 0.5 * np.cos(np.pi * a)
    r = np.clip((t - release_start) / max(release, 1e-6), 0, 1)
    r = 0.5 + 0.5 * np.cos(np.pi * r)
    return a * r


def sos_filter(x, kind, fc, order=3):
    sos = signal.butter(order, fc, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def bandpass(x, lo, hi, order=3):
    hi = min(hi, SR * 0.45)
    return sos_filter(x, "band", [lo, hi], order)


def lowpass(x, fc, order=3):
    return sos_filter(x, "low", min(fc, SR * 0.45), order)


def highpass(x, fc, order=2):
    return sos_filter(x, "high", fc, order)


def sine(f, n, phase=0.0):
    return np.sin(2 * np.pi * f * t_of(n) + phase)


def sweep(f0, f1, n, curve="exp"):
    d = n / SR
    t = t_of(n)
    f = f0 * (f1 / f0) ** (t / d) if curve == "exp" else f0 + (f1 - f0) * t / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def peak_norm(x, peak_db=-3.0):
    p = np.max(np.abs(x)) + 1e-12
    return x * (db(peak_db) / p)


def pan(x, p=0.0):
    """Constant-power pan of a mono signal -> (2, n). p in -1..1."""
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)])


def widen(x, ms=0.45):
    """Mono -> stereo with a tiny Haas offset between the channels (width without an audible echo)."""
    d = max(1, int(SR * ms / 1000))
    l = np.concatenate([x, np.zeros(d)])
    r = np.concatenate([np.zeros(d), x])
    return np.stack([l, r])


def fade_out(x, seconds):
    """Raised-cosine fade over the last `seconds` of x (mono or stereo): no abrupt end before a reverb tail."""
    m = min(x.shape[-1], n_of(seconds))
    k = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, m))
    y = x.copy()
    y[..., -m:] = y[..., -m:] * k
    return y


def pad_to(x, n):
    if x.shape[-1] >= n:
        return x[..., :n]
    return np.pad(x, [(0, 0)] * (x.ndim - 1) + [(0, n - x.shape[-1])])


def room_ir(rt60=1.4, predelay=0.012, hp=180, lp=7000, seed=1, stereo=True):
    """A synthetic room: exponentially decaying filtered noise, decorrelated between the ears."""
    r = np.random.default_rng(seed)
    n = n_of(rt60 * 1.15)
    t = t_of(n)
    decay = np.exp(-6.91 * t / rt60)  # -60 dB at rt60
    chans = []
    for _ in range(2 if stereo else 1):
        ir = r.standard_normal(n) * decay
        ir = highpass(lowpass(ir, lp, 2), hp, 1)
        ir[: n_of(0.002)] *= np.linspace(0, 1, n_of(0.002))
        chans.append(np.concatenate([np.zeros(n_of(predelay)), ir]))
    m = max(len(c) for c in chans)
    ir = np.stack([pad_to(c, m) for c in chans])
    return ir / (np.sqrt((ir**2).sum(axis=1, keepdims=True)) + 1e-12)


def reverb(x, mix=0.25, rt60=1.4, predelay=0.012, hp=180, lp=7000, seed=1, tail=None):
    """x: (2, n) or (n,). Returns (2, n + tail). `mix` is the wet level relative to the dry signal."""
    if x.ndim == 1:
        x = widen(x)
    ir = room_ir(rt60, predelay, hp, lp, seed)
    wet = np.stack([signal.fftconvolve(x[c], ir[c]) for c in range(2)])
    out_n = wet.shape[1] if tail is None else x.shape[1] + n_of(tail)
    out = pad_to(wet, out_n) * mix
    out[:, : x.shape[1]] += x
    return out


def stft_sweep_noise(n, centre_hz, width_oct, seed=0, nfft=2048):
    """Noise shaped by a band that follows `centre_hz(t)` (an array of length n): a clean, smooth whoosh."""
    r = np.random.default_rng(seed)
    x = r.standard_normal(n)
    f, tt, Z = signal.stft(x, fs=SR, nperseg=nfft, noverlap=nfft * 3 // 4, boundary="zeros")
    cen = np.interp(tt, t_of(n), centre_hz)
    ff = np.maximum(f, 1.0)[:, None]
    g = np.exp(-0.5 * (np.log2(ff / cen[None, :]) / width_oct) ** 2)
    _, y = signal.istft(Z * g, fs=SR, nperseg=nfft, noverlap=nfft * 3 // 4)
    return pad_to(y, n)


def write_wav(path, x, bits=24):
    """x: (2, n) float -> 48 kHz PCM wav. 24-bit keeps the quiet tails clean."""
    x = np.clip(x.T, -1.0, 1.0)
    if bits == 16:
        wavfile.write(path, SR, (x * 32767).astype(np.int16))
    elif bits == 24:
        # scipy has no 24-bit writer: pack manually.
        i = (x * 8388607).astype(np.int32)
        b = np.empty((i.shape[0], i.shape[1], 3), dtype=np.uint8)
        b[..., 0] = i & 0xFF
        b[..., 1] = (i >> 8) & 0xFF
        b[..., 2] = (i >> 16) & 0xFF
        import struct

        data = b.tobytes()
        ch = x.shape[1]
        with open(path, "wb") as fh:
            fh.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE")
            fh.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, ch, SR, SR * ch * 3, ch * 3, 24))
            fh.write(b"data" + struct.pack("<I", len(data)) + data)
    else:
        wavfile.write(path, SR, x.astype(np.float32))


def read_wav(path):
    """Read a 16/24/32-bit or float wav written by write_wav (or ffmpeg) -> (2, n) float32."""
    import struct

    with open(path, "rb") as fh:
        raw = fh.read()
    if raw[:4] != b"RIFF":
        raise ValueError(f"{path}: not a wav")
    pos = 12
    fmt = None
    data = None
    while pos + 8 <= len(raw):
        cid = raw[pos : pos + 4]
        size = struct.unpack("<I", raw[pos + 4 : pos + 8])[0]
        body = raw[pos + 8 : pos + 8 + size]
        if cid == b"fmt ":
            fmt = struct.unpack("<HHIIHH", body[:16])
        elif cid == b"data":
            data = body
        pos += 8 + size + (size & 1)
    tag, ch, sr, _, _, bits = fmt
    if sr != SR:
        raise ValueError(f"{path}: expected {SR} Hz, got {sr}")
    if tag == 3:
        a = np.frombuffer(data, dtype="<f4").reshape(-1, ch)
    elif bits == 16:
        a = np.frombuffer(data, dtype="<i2").reshape(-1, ch).astype(np.float32) / 32768.0
    elif bits == 24:
        b = np.frombuffer(data, dtype=np.uint8).reshape(-1, ch, 3).astype(np.int32)
        i = b[..., 0] | (b[..., 1] << 8) | (b[..., 2] << 16)
        i = np.where(i & 0x800000, i - 0x1000000, i)
        a = i.astype(np.float32) / 8388608.0
    elif bits == 32:
        a = np.frombuffer(data, dtype="<i4").reshape(-1, ch).astype(np.float32) / 2147483648.0
    else:
        raise ValueError(f"{path}: unsupported format tag={tag} bits={bits}")
    a = a.T
    if a.shape[0] == 1:
        a = np.vstack([a, a])
    return a
