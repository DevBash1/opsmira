#!/usr/bin/env python3
"""A quiet harmonic bed for the film, synthesised from sine partials (no samples, no downloads).

It is a slow pad of stacked fifths over a moving bass, all inside D major (so any overlap between neighbouring chords
stays consonant). It enters with the calm (the first scene is silence and tension), breathes
a little, lifts for the end card, and is ducked under the voice by scripts/audio/build_audio.py.

Writes public/music/bed.wav (48 kHz stereo, 16-bit, peak -6 dBFS).
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, lowpass, n_of, peak_norm, t_of, write_wav  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "music", "bed.wav")

def hz(name, octave):
    semis = {"C": 0, "C#": 1, "D": 2, "E": 4, "F#": 6, "G": 7, "A": 9, "B": 11}[name] + 12 * (octave + 1) - 69
    return 440.0 * 2 ** (semis / 12)


# Stacked fifths ("sus2" colours) from each root: every note is in D major and nothing sits a semitone from a neighbour,
# so the slow cross-fades can overlap without ever beating. The bass carries the movement; the upper notes are common tones.
DSUS = [("D", 3), ("A", 3), ("E", 4)]
BSUS = [("B", 2), ("F#", 3), ("C#", 4)]
ASUS = [("A", 2), ("E", 3), ("B", 3), ("F#", 4)]
# (start second, upper notes, bass note)  -- cue points follow the film's scenes
CHORDS = [
    (5.6, DSUS, ("D", 2)),  # the calm begins
    (16.4, BSUS, ("B", 1)),  # the live surface
    (26.0, DSUS, ("G", 2)),  # the approval card
    (32.2, ASUS, ("A", 2)),  # connect
    (43.0, DSUS, ("D", 2)),  # watch
    (53.5, BSUS, ("B", 1)),  # the tasks fill up
    (62.0, DSUS, ("G", 2)),  # command mode
    (69.4, ASUS, ("A", 2)),  # open source
    (76.5, BSUS, ("B", 1)),  # models and keys
    (79.2, DSUS, ("D", 2)),  # the end: home
]
TOTAL = 87.0


def voice(freq, n, rng, side):
    """One pad note: three slightly detuned sines + a quiet octave, a slow shimmer in amplitude."""
    t = t_of(n)
    out = np.zeros(n)
    for cents, amp in [(-5, 0.8), (0.0, 1.0), (5, 0.8)]:
        f = freq * 2 ** ((cents + side * 3.0) / 1200)
        out += amp * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28))
    out += 0.16 * np.sin(2 * np.pi * freq * 2 * t + rng.uniform(0, 6.28))
    out *= 1 + 0.08 * np.sin(2 * np.pi * rng.uniform(0.06, 0.13) * t + rng.uniform(0, 6.28))
    return out


def chord_window(i, t):
    """Raised-cosine membership of chord i over time: it fades in around its cue and out around the next one.
    Windows of neighbouring chords are complementary (they sum to 1 in the overlap), so a note that two chords share
    simply keeps sounding: one continuous oscillator, no phase cancellation at the change."""
    half = 2.5
    start = CHORDS[i][0]
    end = CHORDS[i + 1][0] if i + 1 < len(CHORDS) else TOTAL + 10
    up = np.clip((t - (start - half)) / (2 * half), 0, 1)
    down = np.clip(((end + half) - t) / (2 * half), 0, 1)
    return (0.5 - 0.5 * np.cos(np.pi * up)) * (0.5 - 0.5 * np.cos(np.pi * down))


def build():
    rng = np.random.default_rng(424242)
    n = n_of(TOTAL)
    t = t_of(n)
    # amplitude envelope of every distinct pitch, summed over the chords that contain it
    pitches = {}
    for i, (_, notes, bass) in enumerate(CHORDS):
        w = chord_window(i, t)
        for note, weight in [(nt, 0.2) for nt in notes] + [(bass, 0.24)]:
            if note in pitches:
                pitches[note] = (pitches[note][0] + w * weight, max(pitches[note][1], weight))
            else:
                pitches[note] = (w * weight, weight)
    mix = np.zeros((2, n))
    for (note, octave), (env, cap) in pitches.items():
        env = np.minimum(env, cap)  # a note two chords share is not louder in the overlap
        for side, ch in [(-1, 0), (1, 1)]:
            mix[ch] += voice(hz(note, octave), n, rng, side) * env
    x = lowpass(mix, 1800, 2)
    # overall shape: nothing during the cold open, the calm arrives with the second scene, a lift for the end card
    gain = np.interp(t, [0, 5.4, 9.0, 78.5, 82.0, 84.5, 87.0], [0, 0, 0.82, 0.82, 1.0, 0.95, 0.0])
    x = x * gain
    return peak_norm(x, -6.0)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    x = build()
    write_wav(OUT, x, bits=16)
    print(f"{os.path.relpath(OUT)}  {x.shape[1] / SR:.1f}s  rms {20 * np.log10(np.sqrt((x**2).mean())):.1f} dBFS")
