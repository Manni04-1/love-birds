import {
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Pressable, View } from 'react-native';

import { Glyph, IconButton, Row, T } from '@/components/ui';
import { signedUrl } from '@/lib/photos';
import { space, tabBarInset, useColors } from '@/lib/theme';
import { deleteRecording, durationLabel, VOICE_LIMIT, waveform } from '@/lib/voice';

/* Recording --------------------------------------------------------------- */

// Voice, not music: one channel at 64 kbps is clear and keeps five minutes under 2.5 MB.
const OPTIONS: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true };
const LEVEL_BARS = 32;

type Phase = 'starting' | 'recording' | 'stopped' | 'sending';

/** -60 dB (quiet room) to 0 dB (loud), as 0 to 1. */
const level = (db: number) => Math.max(0, Math.min(1, (db + 60) / 60));

function RedDot() {
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5484D', opacity: pulse }} />;
}

/**
 * Takes the place of the message box while you record a voice note. Recording starts as soon as
 * it appears (ask for the microphone first). It stops by itself after five minutes, and pauses
 * when you leave the chat, so nothing is recorded behind your back.
 */
export function VoiceRecorder({ onSend, onClose }: { onSend: (uri: string, ms: number) => Promise<boolean>; onClose: (note?: string) => void }) {
  const c = useColors();
  const recorder = useAudioRecorder(OPTIONS);
  const [phase, setPhase] = useState<Phase>('starting');
  const [ms, setMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'doNotMix' });
        await recorder.prepareToRecordAsync();
        if (!alive) return;
        recorder.record({ forDuration: VOICE_LIMIT });
        setPhase('recording');
      } catch {
        if (alive) close.current('Couldn\'t start recording. Try again.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [recorder]);

  // The clock and the sound level, a few times a second.
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => {
      const s = recorder.getStatus();
      setMs(s.durationMillis);
      if (typeof s.metering === 'number') {
        const l = level(s.metering);
        setLevels((prev) => [...prev.slice(1 - LEVEL_BARS), l]);
      }
      // Five minutes is the most: the recorder has stopped by itself.
      if (!s.isRecording && s.durationMillis >= VOICE_LIMIT * 1000 - 1000) setPhase('stopped');
    }, 120);
    return () => clearInterval(timer);
  }, [phase, recorder]);

  const pause = useCallback(async () => {
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch {
      // Already stopped.
    }
    setPhase((p) => (p === 'recording' ? 'stopped' : p));
  }, [recorder]);

  // Leaving the chat or the app stops recording; what you said so far waits for you to send it.
  useFocusEffect(
    useCallback(
      () => () => {
        pause();
      },
      [pause],
    ),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') pause();
    });
    return () => sub.remove();
  }, [pause]);

  async function cancel() {
    await pause();
    deleteRecording(recorder.uri);
    onClose();
  }

  async function send() {
    if (phase === 'starting' || phase === 'sending') return;
    const length = Math.max(ms, recorder.getStatus().durationMillis);
    setPhase('sending');
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch {
      // Already stopped.
    }
    const uri = recorder.uri;
    if (!uri || length < 1000) {
      deleteRecording(uri);
      onClose(uri ? 'That was too short to send. Tap the mic and talk for a moment.' : 'Couldn\'t save the recording. Try again.');
      return;
    }
    // On success the chat closes this bar; otherwise you can try sending again.
    if (!(await onSend(uri, length))) setPhase('stopped');
  }

  const atLimit = ms >= VOICE_LIMIT * 1000 - 1000;
  const note =
    phase === 'starting'
      ? 'Starting…'
      : phase === 'sending'
        ? 'Sending…'
        : phase === 'stopped'
          ? atLimit
            ? '5 minutes is the most'
            : 'Paused. Send it or delete it'
          : levels.length
            ? null
            : 'Recording…';

  return (
    <Row gap={space.sm} style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: tabBarInset + space.sm, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
      <IconButton label="Delete voice note" onPress={cancel}>
        <Glyph name="trash" color={c.danger} />
      </IconButton>
      <View
        accessible
        accessibilityLabel={`${phase === 'recording' ? 'Recording' : (note ?? '')}, ${durationLabel(ms)}`}
        style={{ flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.page, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }}>
        {phase === 'recording' ? <RedDot /> : <Glyph name="mic" color={c.muted} size={18} />}
        <T variant="strong" style={{ fontVariant: ['tabular-nums'] }}>
          {durationLabel(ms)}
        </T>
        {note ? (
          <T variant="small" muted numberOfLines={1} style={{ flex: 1 }}>
            {note}
          </T>
        ) : (
          <View style={{ flex: 1, height: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, overflow: 'hidden' }}>
            {levels.map((l, i) => (
              <View key={i} style={{ width: 3, height: 3 + l * 21, borderRadius: 2, backgroundColor: c.accent }} />
            ))}
          </View>
        )}
      </View>
      <IconButton label="Send voice note" accent onPress={send}>
        {phase === 'sending' ? <ActivityIndicator color={c.onAccent} /> : <Glyph name="send" color={c.onAccent} />}
      </IconButton>
    </Row>
  );
}

/* Listening --------------------------------------------------------------- */

/** One player for the whole chat, so starting a voice note stops the one before. */
export function useVoicePlayback() {
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function toggle(id: string, path: string) {
    setFailed(null);
    if (current === id) {
      if (player.playing) return player.pause();
      // Played to the end: start again from the beginning.
      if (player.duration > 0 && player.currentTime >= player.duration - 0.15) await player.seekTo(0);
      return player.play();
    }
    player.pause();
    setLoading(id);
    const url = await signedUrl(path).catch(() => null);
    setLoading(null);
    if (!url) return setFailed(id);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'doNotMix' }).catch(() => {});
    player.replace({ uri: url });
    player.play();
    setCurrent(id);
  }

  async function seek(id: string, fraction: number) {
    if (current !== id || !(player.duration > 0)) return;
    await player.seekTo(Math.max(0, Math.min(1, fraction)) * player.duration);
  }

  const pause = useCallback(() => {
    try {
      player.pause();
    } catch {
      // Nothing loaded yet.
    }
  }, [player]);

  return { player, current, loading, failed, toggle, seek, pause };
}

export type VoicePlayback = ReturnType<typeof useVoicePlayback>;

const BARS = 28;
const BAR = 3;
const GAP = 2;
const WAVE = BARS * BAR + (BARS - 1) * GAP;

function NoteBody({
  id,
  time,
  progress,
  playing,
  busy,
  failed,
  ink,
  fine,
  onToggle,
  onSeek,
}: {
  id: string;
  time: string;
  progress: number;
  playing: boolean;
  busy: boolean;
  failed: boolean;
  ink: string;
  fine: string;
  onToggle: () => void;
  onSeek?: (fraction: number) => void;
}) {
  const bars = waveform(id, BARS);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 8, paddingRight: 14, paddingVertical: 8 }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : failed ? 'Couldn\'t load the voice note. Try again' : `Play voice note, ${time}`}
        hitSlop={6}
        style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(127, 127, 127, 0.22)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
        {busy ? <ActivityIndicator color={ink} /> : <Glyph name={playing ? 'pause' : 'play'} color={ink} size={22} />}
      </Pressable>
      <View style={{ gap: 2 }}>
        <Pressable onPress={onSeek ? (e) => onSeek(e.nativeEvent.locationX / WAVE) : undefined} disabled={!onSeek} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {/* The bars ignore touches so the tap's position is measured across the whole waveform. */}
          <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', gap: GAP, height: 30, width: WAVE }}>
            {bars.map((h, i) => (
              <View key={i} style={{ width: BAR, height: 4 + h * 24, borderRadius: 2, backgroundColor: ink, opacity: (i + 0.5) / BARS <= progress ? 1 : 0.35 }} />
            ))}
          </View>
        </Pressable>
        <T variant="fine" color={fine} style={{ fontVariant: ['tabular-nums'] }}>
          {failed ? 'Couldn\'t load it. Tap play to try again' : time}
        </T>
      </View>
    </View>
  );
}

function LiveNote({ voice, id, ms, ink, fine, onToggle }: { voice: VoicePlayback; id: string; ms: number; ink: string; fine: string; onToggle: () => void }) {
  const status = useAudioPlayerStatus(voice.player);
  const total = status.duration > 0 ? status.duration : ms / 1000;
  const ended = !status.playing && total > 0 && status.currentTime >= total - 0.15;
  const progress = ended || !total ? 0 : Math.min(1, status.currentTime / total);
  const time = status.playing || progress > 0 ? `${durationLabel(status.currentTime * 1000)} / ${durationLabel(total * 1000)}` : durationLabel(total * 1000);
  return (
    <NoteBody
      id={id}
      time={time}
      progress={progress}
      playing={status.playing}
      busy={status.playing && status.isBuffering}
      failed={false}
      ink={ink}
      fine={fine}
      onToggle={onToggle}
      onSeek={(f) => voice.seek(id, f)}
    />
  );
}

/** A voice note in a chat bubble: play or pause it, and tap along the waveform to skip ahead. */
export function VoiceNote({ voice, id, path, ms, ink, fine }: { voice: VoicePlayback; id: string; path: string; ms: number | null | undefined; ink: string; fine: string }) {
  const toggle = () => voice.toggle(id, path);
  if (voice.current === id) return <LiveNote voice={voice} id={id} ms={ms ?? 0} ink={ink} fine={fine} onToggle={toggle} />;
  return (
    <NoteBody
      id={id}
      time={durationLabel(ms ?? 0)}
      progress={0}
      playing={false}
      busy={voice.loading === id}
      failed={voice.failed === id}
      ink={ink}
      fine={fine}
      onToggle={toggle}
    />
  );
}
