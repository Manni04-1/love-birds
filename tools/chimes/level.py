"""Evens out the chimes' loudness, keeps their peaks safe, and encodes them as MP3.

    python3 level.py RAW_DIR OUT_DIR

Loudness is matched on the loudest moment (EBU R128 momentary loudness, a 400 ms window), which
suits short sounds better than the average over the whole sound. The original Love birds chime
peaks at -12.6 LUFS this way. A look-ahead limiter catches any peak above -1.5 dBFS.
"""
import os
import re
import subprocess
import sys
import tempfile
import wave

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

SR = 44100
CEILING = 10 ** (-1.5 / 20)
TARGET = -12.6
# High, bright sounds feel louder on a phone's speaker than the meter says.
OFFSET = {'birdsong': -1.8, 'whistle': -1.8, 'sparkle': -1.2, 'crystal': -0.8, 'wind_chimes': -0.8, 'music_box': -0.5, 'heartbeat': +0.5}


def read(path):
    with wave.open(path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32768


def write(path, x):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(np.round(np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())


def momentary_max(path):
    err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    values = [float(v) for v in re.findall(r'M:\s*(-?[\d.]+)', err)]
    return max(values)


def limit(x, look=0.003, release=0.08):
    n = len(x)
    k = int(look * SR)
    a = np.concatenate([np.abs(x), np.zeros(k)])
    ahead = sliding_window_view(a, k + 1).max(axis=1)[:n]
    want = np.minimum(1.0, CEILING / np.maximum(ahead, 1e-9))
    g = np.empty(n)
    cur = 1.0
    r = np.exp(-1 / (release * SR))
    for i, w in enumerate(want.tolist()):
        cur = w if w < cur else w + (cur - w) * r
        g[i] = cur
    # Smooth the gain so the limiter doesn't distort: the lowest nearby gain, then averaged.
    lo = sliding_window_view(np.concatenate([np.ones(k), g, np.ones(k)]), 2 * k + 1).min(axis=1)
    g = np.convolve(lo, np.ones(k) / k, mode='same')
    return x * np.minimum(g, 1.0)


def main():
    raw, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    tmp = tempfile.mkdtemp()
    for file in sorted(os.listdir(raw)):
        if not file.endswith('.wav'):
            continue
        name = file[:-4]
        x = read(os.path.join(raw, file))
        target = TARGET + OFFSET.get(name, 0)
        y = x
        for _ in range(4):
            path = os.path.join(tmp, file)
            write(path, y)
            m = momentary_max(path)
            if abs(m - target) < 0.15:
                break
            y = limit(y * 10 ** ((target - m) / 20))
        wav = os.path.join(tmp, f'final-{file}')
        write(wav, y)
        mp3 = os.path.join(out, f'{name}.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', '-ac', '1', '-ar', str(SR),
                        '-map_metadata', '-1', '-id3v2_version', '0', '-write_id3v1', '0', mp3], check=True)
        reduction = 20 * np.log10(np.max(np.abs(x)) * 10 ** ((target - momentary_max(os.path.join(raw, file))) / 20) / max(np.max(np.abs(y)), 1e-9))
        print(f'{name:12s} M max {momentary_max(mp3):6.1f} (target {target:5.1f})  limited {max(reduction, 0):4.1f} dB  {os.path.getsize(mp3) // 1024} KB')


main()
