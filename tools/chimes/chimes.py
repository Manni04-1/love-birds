"""Synthesises Love Birds' notification chimes from scratch (no samples), one WAV per chime.

    python3 chimes.py OUT_DIR [name ...]

Each chime is built from simple physical models: struck bars, tines and bells (inharmonic modes),
plucked strings (harmonic partials that fade from the top down), and gliding sines for birds,
bubbles and the whistle. A small synthetic room is added, then the edges are smoothed.
Loudness is matched afterwards by level.py:

    python3 chimes.py raw && python3 level.py raw ../../assets/sounds

Needs numpy and ffmpeg (with libmp3lame).
"""
import os
import sys
import wave

import numpy as np

SR = 44100
LEAD = 0.03  # silence first, so phones that wake their speaker late don't clip the start

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
NOTE = {f'{n}{o}': 440.0 * 2 ** ((12 * (o + 1) + i - 69) / 12) for o in range(1, 9) for i, n in enumerate(NAMES)}


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------

def tt(seconds):
    return np.arange(int(round(seconds * SR))) / SR


def ramp_in(sig, seconds):
    n = min(len(sig), max(2, int(seconds * SR)))
    sig[:n] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))
    return sig


def fade_out(sig, seconds):
    n = min(len(sig), int(seconds * SR))
    sig[-n:] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
    return sig


def band(sig, lo, hi):
    """Zero-phase band-pass by FFT, with soft edges."""
    spec = np.fft.rfft(sig)
    f = np.fft.rfftfreq(len(sig), 1 / SR)
    gain = np.ones_like(f)
    if lo:
        gain *= 1 / (1 + (lo / np.maximum(f, 1e-9)) ** 4)
    if hi:
        gain *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(spec * gain, len(sig))


def unit(sig):
    peak = np.max(np.abs(sig))
    return sig / peak if peak else sig


class Mix:
    def __init__(self, seconds):
        self.buf = np.zeros(int(round(seconds * SR)))

    def left(self, at):
        """Seconds from `at` to the end, so a note rings on instead of stopping short (a click)."""
        return len(self.buf) / SR - at

    def add(self, sig, at, gain=1.0):
        i = int(round(at * SR))
        n = min(len(sig), len(self.buf) - i)
        if n > 0:
            self.buf[i:i + n] += gain * sig[:n]


def tick(rng, seconds, lo, hi, decay=None):
    """A short noise burst: a mallet, a pick, a fingertip or a clapper touching."""
    n = int(seconds * SR)
    noise = band(rng.standard_normal(n * 4), lo, hi)[:n]
    env = np.exp(-np.arange(n) / (n * (decay or 0.25)))
    return ramp_in(unit(noise) * env, 0.0004)


def modal(freq, seconds, modes, attack=0.0015, twin=0.0, twin_hz=0.0, swell=None):
    """A struck bar, tine, bell or glass. modes: (ratio, amplitude, decay in seconds).
    A twin a fraction of a hertz away gives the slow shimmer of real metal and glass."""
    t = tt(seconds)
    out = np.zeros_like(t)
    for k, (ratio, amp, decay) in enumerate(modes):
        f = freq * ratio
        if f > 0.42 * SR:
            continue
        env = np.exp(-t / decay)
        if swell and k in swell:
            env *= 1 - np.exp(-t / swell[k])
        out += amp * env * np.sin(2 * np.pi * f * t)
        if twin:
            out += amp * twin * env * np.sin(2 * np.pi * (f + twin_hz * ratio) * t + 0.7)
    return ramp_in(out, attack)


def pluck(freq, seconds, pos=0.2, tilt=1.4, decay=1.0, damp=0.5, inharm=0.0, twin=0.35, top=12000):
    """A plucked string: harmonics shaped by where it's plucked, the high ones fading first.
    The twin is the string's other direction of swing, slightly detuned and slower to fade."""
    t = tt(seconds)
    out = np.zeros_like(t)
    n = 1
    while True:
        fn = n * freq * np.sqrt(1 + inharm * n * n)
        if fn > min(0.42 * SR, top):
            break
        a = abs(np.sin(n * np.pi * pos)) / n ** tilt
        d = decay / (1 + damp * (n - 1))
        out += a * np.exp(-t / d) * np.sin(2 * np.pi * fn * t)
        if twin:
            out += a * twin * np.exp(-t / (d * 1.7)) * np.sin(2 * np.pi * (fn + 0.3) * t + 1.1)
        n += 1
    return ramp_in(out, 0.002)


def glide(freqs, env, harmonics=((1, 1.0),)):
    """A sine (with a few harmonics) following a pitch curve."""
    ph = 2 * np.pi * np.cumsum(freqs) / SR
    return env * sum(a * np.sin(k * ph) for k, a in harmonics)


def reverb(x, rt60=0.9, wet=0.18, lp=6000, pre=0.011, seed=11):
    """A small synthetic room: decaying noise that darkens, plus a few early reflections."""
    rng = np.random.default_rng(seed)
    n = int(rt60 * 1.1 * SR)
    t = np.arange(n) / SR
    ir = band(rng.standard_normal(n), 120, lp) * np.exp(-6.91 * t / rt60)
    ir[: int(pre * SR)] = 0
    for ms, g in ((5.3, 0.9), (8.9, 0.7), (13.1, 0.55), (19.7, 0.45), (27.1, 0.3)):
        ir[int(ms * SR / 1000)] += g * np.max(np.abs(ir))
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet_sig = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x + wet * wet_sig


def highpass(x, hz):
    """First-order high-pass (causal, so nothing rings before the sound starts)."""
    rc = 1 / (2 * np.pi * hz)
    a = rc / (rc + 1 / SR)
    y = np.empty_like(x)
    prev_x = prev_y = 0.0
    for i, v in enumerate(x.tolist()):
        prev_y = a * (prev_y + v - prev_x)
        prev_x = v
        y[i] = prev_y
    return y


def finish(x, fade=0.25, hp=70):
    x = highpass(x, hp)
    x = fade_out(x, fade)
    x = unit(x) * 0.7
    return np.concatenate([np.zeros(int(LEAD * SR)), x])


# ---------------------------------------------------------------------------
# The chimes
# ---------------------------------------------------------------------------

def birdsong():
    """Two little birds: one calls "swee-tee, swee-tee", the other answers with a trill and a tweet."""
    m = Mix(1.45)

    def chirp(f0, f1, dur, amp, vib=0.0, rate=0.0, h2=0.06):
        t = tt(dur)
        x = t / dur
        shape = 1 - (1 - x) ** 1.8 if f1 > f0 else x ** 0.8
        f = f0 + (f1 - f0) * shape
        if vib:
            f = f * (1 + vib * np.sin(2 * np.pi * rate * t))
        env = np.sin(np.pi * x ** 0.7) ** 2
        return amp * glide(f, env, ((1, 1.0), (2, h2)))

    # Bird one.
    m.add(chirp(2900, 4100, 0.075, 0.85), 0.00)
    m.add(chirp(4500, 3300, 0.085, 1.00), 0.10)
    m.add(chirp(2900, 4100, 0.075, 0.80), 0.24)
    m.add(chirp(4600, 3200, 0.120, 0.95, vib=0.025, rate=42), 0.34)
    # Bird two: a quick trill, then a rising tweet.
    for i in range(6):
        m.add(chirp(3900, 2900, 0.032, 0.55 + 0.05 * i), 0.62 + 0.052 * i)
    m.add(chirp(2800, 3800, 0.095, 0.75), 0.97)
    # Bird one again, a soft "tsip".
    m.add(chirp(4800, 4200, 0.040, 0.45), 1.13)
    return finish(reverb(m.buf, rt60=0.5, wet=0.12, lp=9000), fade=0.12, hp=300)


MUSIC_BOX = [(1, 1.0, 1.4), (2.0, 0.05, 0.35), (6.267, 0.30, 0.16), (17.55, 0.05, 0.04)]


def music_box():
    """A tiny lullaby on a music box comb: steel tines with their bright, quickly fading overtone."""
    rng = np.random.default_rng(1)
    m = Mix(2.0)
    notes = [(0.00, 'G5', 0.85), (0.17, 'C6', 0.80), (0.34, 'E6', 0.80), (0.51, 'G6', 0.85), (0.72, 'E6', 0.75), (0.72, 'C6', 0.50)]
    for at, name, vel in notes:
        tone = unit(modal(NOTE[name], m.left(at), MUSIC_BOX, attack=0.0008, twin=0.4, twin_hz=0.8))
        tone[: int(0.004 * SR)] += 0.10 * tick(rng, 0.004, 3000, 9000)
        m.add(tone, at, vel)
    return finish(reverb(m.buf, rt60=1.1, wet=0.2), fade=0.4)


def harp():
    """A quick sweep up the strings of a harp, landing on a ringing top note."""
    m = Mix(2.0)
    names = ['C5', 'E5', 'G5', 'B5', 'D6', 'E6', 'G6']
    for i, name in enumerate(names):
        tone = unit(pluck(NOTE[name], m.left(i * 0.048), pos=0.33, tilt=1.7, decay=1.5, damp=0.35, twin=0.3, top=9000))
        m.add(tone, i * 0.048, 0.6 + 0.05 * i if i < len(names) - 1 else 1.0)
    return finish(reverb(m.buf, rt60=1.4, wet=0.25), fade=0.45)


KALIMBA = [(1, 1.0, 0.75), (5.9, 0.28, 0.06), (3.0, 0.04, 0.18), (2.0, 0.03, 0.3)]


def kalimba():
    """Warm thumb-piano notes falling down a chord, with a soft echo at the end."""
    rng = np.random.default_rng(2)
    m = Mix(1.5)
    for at, name, vel in [(0.00, 'A5', 0.85), (0.11, 'F#5', 0.80), (0.24, 'D5', 1.00), (0.43, 'A5', 0.42)]:
        tone = unit(modal(NOTE[name], m.left(at), KALIMBA, attack=0.001))
        tone[: int(0.003 * SR)] += 0.12 * tick(rng, 0.003, 1500, 6000)
        m.add(tone, at, vel)
    return finish(reverb(m.buf, rt60=0.8, wet=0.15), fade=0.35)


MARIMBA = [(1, 1.0, 0.55), (3.93, 0.32, 0.09), (9.2, 0.08, 0.025)]


def marimba():
    """A bouncy little tune on wooden bars."""
    rng = np.random.default_rng(3)
    m = Mix(1.4)
    notes = [(0.00, 'G5', 0.75), (0.09, 'G5', 0.55), (0.19, 'D6', 0.85), (0.33, 'B5', 1.00), (0.33, 'G5', 0.45)]
    for at, name, vel in notes:
        tone = unit(modal(NOTE[name], m.left(at), MARIMBA, attack=0.0012))
        tone[: int(0.006 * SR)] += 0.15 * tick(rng, 0.006, 500, 3000)
        m.add(tone, at, vel)
    return finish(reverb(m.buf, rt60=0.7, wet=0.14), fade=0.3)


STEEL_PAN = [(1, 1.0, 0.85), (2.0, 0.55, 0.5), (3.0, 0.28, 0.28), (4.02, 0.08, 0.12)]


def steel_pan():
    """Sunny steel pan notes: the octave above each note swells in just after it's struck."""
    rng = np.random.default_rng(4)
    m = Mix(1.6)
    for at, name, vel in [(0.00, 'D6', 0.80), (0.11, 'B5', 0.75), (0.22, 'G5', 0.80), (0.38, 'D6', 1.00)]:
        tone = unit(modal(NOTE[name], m.left(at), STEEL_PAN, attack=0.002, swell={1: 0.018, 2: 0.01}))
        tone[: int(0.003 * SR)] += 0.05 * tick(rng, 0.003, 1000, 4000)
        m.add(tone, at, vel)
    return finish(reverb(m.buf, rt60=0.9, wet=0.16), fade=0.35)


def piano_note(freq, seconds, vel, rng):
    """A soft piano note: slightly stretched harmonics, three strings a hair apart, and the
    piano's two-stage fade (quick at first, then a long ring)."""
    t = tt(seconds)
    out = np.zeros_like(t)
    b = 0.00035
    for n in range(1, 30):
        fn = n * freq * np.sqrt(1 + b * n * n)
        if fn > 10000:
            break
        a = abs(np.sin(n * np.pi * 0.12)) / n * np.exp(-(n - 1) * (1.15 - vel) * 0.3)
        env = 0.65 * np.exp(-t * (1 + 0.25 * (n - 1)) / 0.35) + 0.35 * np.exp(-t * (1 + 0.18 * (n - 1)) / 3.0)
        for detune, ph in ((-0.18, 0.0), (0.0, 1.3), (0.21, 2.1)):
            out += a * env * np.sin(2 * np.pi * (fn + detune) * t + ph) / 3
    out = ramp_in(out, 0.002)
    out[: int(0.01 * SR)] += 0.03 * tick(rng, 0.01, 100, 1200)
    return unit(out) * vel


def piano():
    """A gentle, dreamy chord rolled from the bottom up."""
    rng = np.random.default_rng(5)
    m = Mix(2.1)
    for at, name, vel in [(0.00, 'D4', 0.35), (0.00, 'D5', 0.60), (0.06, 'F#5', 0.55), (0.12, 'A5', 0.60), (0.18, 'C#6', 0.65), (0.24, 'E6', 0.70)]:
        m.add(piano_note(NOTE[name], m.left(at), vel, rng), at)
    return finish(reverb(m.buf, rt60=1.6, wet=0.25), fade=0.55)


def ukulele():
    """A happy little strum on a ukulele: down, up, and a last down that rings."""
    rng = np.random.default_rng(6)
    m = Mix(1.6)
    chord = ['G4', 'C4', 'E4', 'C5']  # a C chord, strings in the order a down-strum meets them

    def string(name, vel, at):
        tone = unit(pluck(NOTE[name], m.left(at), pos=0.15, tilt=1.4, decay=0.9, damp=0.6, inharm=0.00005, twin=0.35, top=8000))
        tone[: int(0.004 * SR)] += 0.04 * tick(rng, 0.004, 1500, 6000)
        return tone * vel

    for start, order, vel in [(0.00, chord, 0.75), (0.22, chord[::-1][:3], 0.5), (0.36, chord, 1.0)]:
        for i, name in enumerate(order):
            m.add(string(name, vel, start + i * 0.014), start + i * 0.014)
    return finish(reverb(m.buf, rt60=0.7, wet=0.12), fade=0.4)


WIND_CHIME = [(1, 1.0, 2.2), (2.756, 0.5, 1.2), (5.404, 0.22, 0.55), (8.933, 0.08, 0.25)]


def wind_chimes():
    """Metal tubes tinkling in a breeze."""
    rng = np.random.default_rng(7)
    m = Mix(2.0)
    scale = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7']
    picks = [3, 1, 4, 2, 5, 0, 3, 1]
    times = [0.00, 0.11, 0.19, 0.34, 0.47, 0.63, 0.80, 1.02]
    for i, (at, k) in enumerate(zip(times, picks)):
        tone = unit(modal(NOTE[scale[k]], m.left(at), WIND_CHIME, attack=0.0006, twin=0.35, twin_hz=1.1))
        tone[: int(0.002 * SR)] += 0.05 * tick(rng, 0.002, 4000, 10000)
        m.add(tone, at, 0.55 + 0.45 * rng.random() if i else 0.9)
    return finish(reverb(m.buf, rt60=1.2, wet=0.2), fade=0.6)


GLASS = [(1, 1.0, 2.0), (2.83, 0.22, 0.8), (5.42, 0.08, 0.35), (8.9, 0.03, 0.15)]


def crystal():
    """Two clear tings on a glass, the second a fifth higher."""
    rng = np.random.default_rng(8)
    m = Mix(1.9)
    for at, name, vel in [(0.00, 'E6', 1.0), (0.17, 'B6', 0.7)]:
        tone = unit(modal(NOTE[name], m.left(at), GLASS, attack=0.0006, twin=0.25, twin_hz=0.4))
        tone[: int(0.0015 * SR)] += 0.04 * tick(rng, 0.0015, 5000, 12000)
        m.add(tone, at, vel)
    return finish(reverb(m.buf, rt60=1.6, wet=0.22), fade=0.5)


def sparkle():
    """A quick magic twinkle: a run up high glassy notes, with a few glints after."""
    rng = np.random.default_rng(9)
    m = Mix(1.35)
    run = ['G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7']
    for i, name in enumerate(run):
        tone = unit(modal(NOTE[name], m.left(i * 0.03), [(1, 1.0, 0.5), (2.76, 0.3, 0.15), (5.4, 0.1, 0.06)], attack=0.0006))
        m.add(tone, i * 0.03, 0.5 + 0.06 * i)
    for at, f in [(0.30, 3520), (0.37, 4186), (0.46, 3136), (0.55, 4699)]:
        m.add(unit(modal(f, m.left(at), [(1, 1.0, 0.12)], attack=0.0015)), at, 0.12)
    return finish(reverb(m.buf, rt60=1.2, wet=0.25), fade=0.35)


DOORBELL = [(1, 1.0, 1.6), (2.0, 0.04, 0.8), (2.76, 0.10, 0.35), (5.40, 0.035, 0.12)]


def doorbell():
    """Ding-dong, like a doorbell's two tone bars."""
    rng = np.random.default_rng(10)
    m = Mix(2.1)
    for at, name, vel in [(0.00, 'E5', 1.0), (0.48, 'C5', 0.95)]:
        tone = unit(modal(NOTE[name], m.left(at), DOORBELL, attack=0.003, twin=0.3, twin_hz=0.5))
        tone[: int(0.003 * SR)] += 0.03 * tick(rng, 0.003, 1000, 4000)
        m.add(tone, at, vel)
    return finish(reverb(m.buf, rt60=1.0, wet=0.16), fade=0.5)


def bubbles():
    """Playful bubbles rising and popping, each one going up in pitch."""
    m = Mix(0.85)
    pops = [(0.00, 560, 0.08, 0.8), (0.12, 760, 0.06, 0.7), (0.19, 640, 0.06, 0.6), (0.33, 900, 0.07, 0.85), (0.42, 1150, 0.09, 1.0)]
    for at, f0, dur, amp in pops:
        t = tt(dur)
        x = t / dur
        f = f0 * (1 + 0.85 * x ** 0.7)
        env = np.exp(-t / (dur * 0.38)) * (1 - x) ** 0.5
        m.add(ramp_in(glide(f, env, ((1, 1.0), (2, 0.08))), 0.0015), at, amp)
    return finish(reverb(m.buf, rt60=0.4, wet=0.1), fade=0.15, hp=200)


def whistle():
    """A cheeky whistle: a quick rise, then a long swoop down."""
    rng = np.random.default_rng(12)
    m = Mix(1.05)

    def part(f, attack, release):
        n = len(f)
        env = np.ones(n)
        a = int(attack * SR)
        r = int(release * SR)
        env[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
        env[-r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
        tone = glide(f, env, ((1, 1.0), (2, 0.04)))
        # Breath: noise in a narrow band that follows the pitch.
        breath = band(rng.standard_normal(n), None, 140) * np.sin(2 * np.pi * np.cumsum(f) / SR)
        return tone + 0.6 * unit(breath) * env * 0.08

    t1 = tt(0.24)
    x1 = t1 / 0.24
    m.add(part(1150 + 1300 * x1 ** 1.6, 0.04, 0.03), 0.00)
    t2 = tt(0.55)
    x2 = t2 / 0.55
    up = np.clip(x2 / 0.15, 0, 1)
    down = np.clip((x2 - 0.15) / 0.85, 0, 1)
    f2 = np.where(x2 < 0.15, 1500 + 1050 * (1 - (1 - up) ** 2), 2550 - 1550 * (1 - (1 - down) ** 1.6))
    f2 = f2 * (1 + 0.008 * np.sin(2 * np.pi * 5.5 * t2) * down)
    env_tail = 1 - 0.55 * down
    m.add(part(f2, 0.025, 0.12) * env_tail, 0.33)
    return finish(reverb(m.buf, rt60=0.6, wet=0.12), fade=0.12, hp=300)


def heartbeat():
    """Two soft heartbeats, "ba-dum, ba-dum", in time with the phone's heartbeat buzz. A real
    heartbeat is too low for a phone's small speaker, so each beat is also a warm, rounded note."""
    rng = np.random.default_rng(13)
    m = Mix(1.5)

    def beat(at, strength, freq):
        t = tt(m.left(at))
        # Starts a little sharp and settles, like a drum skin.
        f = freq * (1 + 0.22 * np.exp(-t / 0.02))
        ph = 2 * np.pi * np.cumsum(f) / SR
        note = sum(np.exp(-t * (1 + 0.35 * (n - 1)) / 0.1) * np.sin(n * ph) / n ** 0.7 for n in range(1, 10))
        # The thump underneath, for headphones and bigger speakers.
        thump = np.sin(2 * np.pi * np.cumsum(55 + 70 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.07)
        knock = band(rng.standard_normal(len(t)), 300, 1500) * np.exp(-t / 0.01)
        return ramp_in(unit(note) + 0.3 * thump + 0.12 * unit(knock), 0.004) * strength

    for at, s, f in [(0.00, 1.0, NOTE['A3']), (0.24, 0.8, NOTE['C#4']), (0.84, 0.9, NOTE['A3']), (1.08, 0.72, NOTE['C#4'])]:
        m.add(beat(at, s, f), at)
    return finish(reverb(m.buf, rt60=0.5, wet=0.08), fade=0.15, hp=40)


CHIMES = {
    'birdsong': birdsong,
    'music_box': music_box,
    'harp': harp,
    'kalimba': kalimba,
    'marimba': marimba,
    'steel_pan': steel_pan,
    'piano': piano,
    'ukulele': ukulele,
    'wind_chimes': wind_chimes,
    'crystal': crystal,
    'sparkle': sparkle,
    'doorbell': doorbell,
    'bubbles': bubbles,
    'whistle': whistle,
    'heartbeat': heartbeat,
}


def write(path, x):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for name in sys.argv[2:] or CHIMES:
        x = CHIMES[name]()
        write(os.path.join(out, f'{name}.wav'), x)
        print(f'{name:12s} {len(x) / SR:.2f}s')
