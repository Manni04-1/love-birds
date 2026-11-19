import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Button, ErrorText, Glyph, Row, Sheet, T } from '@/components/ui';
import { CHIMES, chimeInfo, type Chime, type ChimeKey } from '@/lib/chimes';
import { alpha, radius, space, useColors } from '@/lib/theme';

/** One chime in the list: tap it to hear it and pick it. */
function ChimeRow({ chime, picked, sounding, onPress }: { chime: Chime; picked: boolean; sounding: boolean; onPress: () => void }) {
  const c = useColors();
  const icon = chime.key === 'none' ? 'vibrate' : chime.key === 'phone' ? 'phone' : sounding ? 'stop' : 'play';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      aria-checked={picked}
      accessibilityLabel={chime.preview ? `${chime.label}. ${chime.note}. Plays it` : `${chime.label}. ${chime.note}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.sm,
        paddingHorizontal: space.sm,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: picked ? c.accent : 'transparent',
        backgroundColor: picked ? alpha(c.accent, 0.1) : pressed ? c.surface2 : 'transparent',
      })}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: sounding ? c.accent : alpha(c.accent, 0.14),
        }}>
        <Glyph name={icon} color={sounding ? c.onAccent : c.accent} size={22} />
      </View>
      <View style={{ flex: 1 }}>
        <T variant="strong">{chime.label}</T>
        <T variant="small" muted>
          {chime.note}
        </T>
      </View>
      {picked ? <Glyph name="check" color={c.accent} size={22} /> : null}
    </Pressable>
  );
}

/**
 * Picks the chime this phone plays for Love Birds. Tapping one plays it; nothing changes until
 * you tap Use, so you can listen to them all first.
 */
export function ChimePicker({
  open,
  current,
  onUse,
  onClose,
}: {
  open: boolean;
  current: ChimeKey;
  /** Saves the choice. Returns an error to show, or an empty string. */
  onUse: (key: ChimeKey) => Promise<string>;
  onClose: () => void;
}) {
  const c = useColors();
  const { height } = useWindowDimensions();
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const [picked, setPicked] = useState<ChimeKey>(current);
  const [heard, setHeard] = useState<ChimeKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Opening it again starts at the chime you have now.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPicked(current);
      setError('');
    }
  }
  const sounding = status.playing ? heard : null;

  function stop() {
    try {
      player.pause();
    } catch {
      // Nothing loaded yet.
    }
  }

  function close() {
    stop();
    onClose();
  }

  async function tap(key: ChimeKey) {
    setError('');
    setPicked(key);
    const preview = chimeInfo(key).preview;
    // Tapping the one that's playing stops it.
    if (!preview || sounding === key) return stop();
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', allowsRecording: false }).catch(() => {});
    player.replace(preview);
    player.play();
    setHeard(key);
  }

  async function use() {
    setBusy(true);
    const err = await onUse(picked);
    setBusy(false);
    if (err) return setError(err);
    close();
  }

  const label = chimeInfo(picked).label;
  return (
    <Sheet open={open} onClose={close}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="heading">Pick a chime</T>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Glyph name="close" color={c.muted} size={22} />
        </Pressable>
      </Row>
      <T variant="small" muted>
        Tap one to hear it. It plays on this phone when you get a message, a plan, a reminder or anything else from Love Birds.
      </T>
      <ScrollView style={{ maxHeight: Math.max(240, height * 0.5) }} contentContainerStyle={{ gap: 2 }}>
        {CHIMES.map((chime) => (
          <ChimeRow key={chime.key} chime={chime} picked={picked === chime.key} sounding={sounding === chime.key} onPress={() => tap(chime.key)} />
        ))}
      </ScrollView>
      <ErrorText>{error}</ErrorText>
      <Button title={picked === current ? 'Keep this chime' : `Use ${label}`} onPress={picked === current ? close : use} loading={busy} />
    </Sheet>
  );
}
