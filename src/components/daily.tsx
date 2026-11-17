import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';

import { HeartShape, usePulse, useReducedMotion } from '@/components/hero';
import { Photo } from '@/components/photo';
import { Button, ErrorText, Field, Glyph, Row, T } from '@/components/ui';
import { MOODS } from '@/content/moods';
import { heartbeat, type Mood } from '@/lib/daily';
import { friendlyError } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/* Hearts that burst up and fade ------------------------------------------ */

const BURST = [
  { dx: -70, dy: -90, size: 18, delay: 0 },
  { dx: -30, dy: -120, size: 24, delay: 60 },
  { dx: 10, dy: -105, size: 16, delay: 20 },
  { dx: 45, dy: -130, size: 22, delay: 90 },
  { dx: 80, dy: -85, size: 14, delay: 40 },
  { dx: -50, dy: -60, size: 12, delay: 120 },
  { dx: 60, dy: -55, size: 13, delay: 150 },
];

function BurstHeart({ t, dx, dy, size, color }: { t: Animated.Value; dx: number; dy: number; size: number; color: string }) {
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
  const opacity = t.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 0.9, 0] });
  const scale = t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.15, 0.9] });
  return (
    <Animated.View style={{ position: 'absolute', opacity, transform: [{ translateX }, { translateY }, { scale }] }}>
      <HeartShape size={size} color={color} />
    </Animated.View>
  );
}

/** A little burst of hearts from the middle of its parent. Fires again each time `burst` goes up. */
export function HeartBurst({ burst, color }: { burst: number; color: string }) {
  const [values] = useState(() => BURST.map(() => new Animated.Value(0)));
  useEffect(() => {
    if (!burst) return;
    values.forEach((v) => v.setValue(0));
    const anim = Animated.parallel(
      values.map((v, i) =>
        Animated.sequence([
          Animated.delay(BURST[i].delay),
          Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ),
    );
    anim.start();
    return () => anim.stop();
  }, [burst, values]);
  if (!burst) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      {BURST.map((b, i) => (
        <BurstHeart key={i} t={values[i]} dx={b.dx} dy={b.dy} size={b.size} color={color} />
      ))}
    </View>
  );
}

/* Thinking of you -------------------------------------------------------- */

/** One tap sends your partner a heartbeat buzz and the love chime. */
export function NudgeButton({ partnerName, theirs, mine, onSend }: { partnerName: string; theirs: number; mine: number; onSend: () => Promise<void> }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const beat = usePulse(1300, 0, reduced);
  const scale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const [burst, setBurst] = useState(0);
  const [note, setNote] = useState('');

  async function press() {
    heartbeat();
    setBurst((b) => b + 1);
    setNote('');
    try {
      await onSend();
      setNote(`Sent. ${partnerName}'s phone just buzzed 💓`);
    } catch (e) {
      setNote(friendlyError(e));
    }
  }

  const sub = note || (theirs ? `${partnerName} thought of you ${times(theirs)} today` : mine ? `You've sent ${times(mine)} today` : `Tap to make ${partnerName}'s phone buzz`);

  return (
    <Pressable
      onPress={press}
      accessibilityRole="button"
      accessibilityLabel={`Thinking of you. Sends ${partnerName} a heartbeat.`}
      style={({ pressed }) => ({
        backgroundColor: c.accent2,
        borderRadius: radius.pill,
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}>
      <Row>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <HeartShape size={26} color={c.onAccent2} />
          </Animated.View>
        </View>
        <View style={{ flex: 1 }}>
          <T variant="strong" color={c.onAccent2} style={{ fontSize: 17 }}>
            Thinking of you
          </T>
          <T variant="small" color={c.onAccent2} style={{ opacity: 0.85 }} numberOfLines={1}>
            {sub}
          </T>
        </View>
        <T style={{ fontSize: 22 }}>💭</T>
      </Row>
      <HeartBurst burst={burst} color={c.accent} />
    </Pressable>
  );
}

/** Slides in when your partner taps Thinking of you while you have the app open. */
export function NudgeToast({ name, ping }: { name: string; ping: number }) {
  const c = useColors();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!ping) return;
    heartbeat();
    const anim = Animated.sequence([
      Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 6 }),
      Animated.delay(3200),
      Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [ping, v]);
  if (!ping) return null;
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        top: space.sm,
        left: space.lg,
        right: space.lg,
        zIndex: 10,
        opacity: v,
        transform: [{ translateY }],
        backgroundColor: c.ink,
        borderRadius: radius.lg,
        padding: space.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
      }}>
      <T style={{ fontSize: 28, lineHeight: 34 }}>💓</T>
      <View style={{ flex: 1 }}>
        <T variant="strong" color={c.page}>
          {name} is thinking of you
        </T>
        <T variant="small" color={c.page} style={{ opacity: 0.8 }}>
          Send one back?
        </T>
      </View>
      <HeartBurst burst={ping} color={c.accent} />
    </Animated.View>
  );
}

/* Mood ------------------------------------------------------------------- */

function MoodTile({ eyebrow, mood, empty, onPress, label }: { eyebrow: string; mood: Mood | null; empty: string; onPress?: () => void; label: string }) {
  const c = useColors();
  const body = (
    <>
      <T variant="eyebrow" numberOfLines={1}>
        {eyebrow}
      </T>
      <Row gap={space.sm}>
        {mood || !onPress ? (
          <T style={{ fontSize: 30, lineHeight: 36 }}>{mood?.emoji ?? '🤍'}</T>
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name="plus" color={c.accent} size={18} />
          </View>
        )}
        <T variant="strong" numberOfLines={2} style={{ flex: 1 }} muted={!mood}>
          {mood ? mood.word || 'Feeling it' : empty}
        </T>
      </Row>
    </>
  );
  const style = { flex: 1, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: 4 } as const;
  if (!onPress)
    return (
      <View style={style} accessibilityLabel={label}>
        {body}
      </View>
    );
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [style, pressed && { opacity: 0.85 }]}>
      {body}
    </Pressable>
  );
}

/** How you're each feeling today, side by side. Tap yours to change it. */
export function MoodRow({ mine, partner, partnerName, onPick }: { mine: Mood | null; partner: Mood | null; partnerName: string; onPick: () => void }) {
  return (
    <Row gap={space.sm} style={{ alignItems: 'stretch' }}>
      <MoodTile
        eyebrow="You feel"
        mood={mine}
        empty="How are you today?"
        onPress={onPick}
        label={mine ? `You feel ${mine.word ?? mine.emoji}. Tap to change.` : 'Share how you feel today'}
      />
      <MoodTile
        eyebrow={`${partnerName} feels`}
        mood={partner}
        empty="Not shared yet"
        label={partner ? `${partnerName} feels ${partner.word ?? partner.emoji}` : `${partnerName} hasn't shared a mood yet`}
      />
    </Row>
  );
}

/** A sheet of moods to pick from, with an optional word of your own. */
export function MoodPicker({ open, current, onClose, onSave }: { open: boolean; current: Mood | null; onClose: () => void; onSave: (emoji: string, word: string) => Promise<void> }) {
  const c = useColors();
  const [emoji, setEmoji] = useState(current?.emoji ?? '');
  const [word, setWord] = useState(current?.word ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wasOpen, setWasOpen] = useState(open);

  // Start from your current mood each time the sheet opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEmoji(current?.emoji ?? '');
      setWord(current?.word ?? '');
      setError('');
    }
  }

  async function save() {
    if (!emoji) return setError('Pick an emoji first.');
    setBusy(true);
    setError('');
    try {
      await onSave(emoji, word);
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    }
    setBusy(false);
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: c.page, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, paddingBottom: space.xxl, gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="heading">How are you feeling?</T>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
              <Glyph name="close" color={c.muted} />
            </Pressable>
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {MOODS.map((m) => {
              const selected = emoji === m.emoji;
              return (
                <Pressable
                  key={m.emoji}
                  onPress={() => {
                    setEmoji(m.emoji);
                    setWord(m.word);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={m.word}
                  style={{
                    width: '23%',
                    flexGrow: 1,
                    alignItems: 'center',
                    paddingVertical: space.sm,
                    borderRadius: radius.md,
                    borderWidth: 2,
                    borderColor: selected ? c.accent : 'transparent',
                    backgroundColor: selected ? c.accentSoft : c.surface,
                  }}>
                  <T style={{ fontSize: 28, lineHeight: 34 }}>{m.emoji}</T>
                  <T variant="fine" numberOfLines={1} color={selected ? c.ink : c.muted}>
                    {m.word}
                  </T>
                </Pressable>
              );
            })}
          </View>
          <Field label="In your own words (optional)" value={word} onChangeText={setWord} maxLength={40} placeholder="Missing you" />
          <ErrorText>{error}</ErrorText>
          <Button title="Share my mood" onPress={save} loading={busy} disabled={!emoji} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* Today's tiles ---------------------------------------------------------- */

/**
 * A square-ish tile for one of today's rituals.
 * todo: you haven't done it yet. waiting: you have, your partner hasn't.
 */
export function TodayTile({
  emoji,
  title,
  status,
  todo,
  onPress,
  children,
}: {
  emoji: string;
  title: string;
  status: string;
  todo: boolean;
  onPress: () => void;
  children?: ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${status}`}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 150,
        backgroundColor: todo ? c.accentSoft : c.surface,
        borderColor: todo ? 'transparent' : c.line,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: space.md,
        gap: 4,
        overflow: 'hidden',
        opacity: pressed ? 0.85 : 1,
      })}>
      {children}
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <T style={{ fontSize: 32, lineHeight: 38 }}>{emoji}</T>
        {todo && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent, marginTop: 6 }} />}
      </Row>
      <View style={{ flex: 1 }} />
      <T variant="strong">{title}</T>
      <T variant="small" muted numberOfLines={3}>
        {status}
      </T>
    </Pressable>
  );
}

/** Your partner's photo of the day, faded behind the tile once you can both see them. */
export function TilePhoto({ path }: { path: string | null | undefined }) {
  const c = useColors();
  if (!path) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      <Photo path={path} style={{ flex: 1 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%', backgroundColor: c.surface, opacity: 0.88 }} />
    </View>
  );
}

/* Today's sweet gesture -------------------------------------------------- */

export function GestureCard({ text, done, onToggle }: { text: string; done: boolean; onToggle: () => void }) {
  const c = useColors();
  const [burst, setBurst] = useState(0);
  return (
    <View style={{ backgroundColor: c.surface2, borderRadius: radius.lg, padding: space.lg, gap: space.sm }}>
      <Row gap={space.sm}>
        <T style={{ fontSize: 20 }}>💝</T>
        <T variant="eyebrow" style={{ flex: 1 }}>
          Today&apos;s sweet gesture
        </T>
      </Row>
      <T variant="heading" style={{ fontSize: 19, lineHeight: 25 }}>
        {text}
      </T>
      <T variant="fine">Just for you. Your partner has a different one, so keep it a surprise.</T>
      <Pressable
        onPress={() => {
          if (!done) setBurst((b) => b + 1);
          onToggle();
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          marginTop: 4,
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          backgroundColor: done ? c.accent : c.surface,
          borderWidth: 1.5,
          borderColor: done ? c.accent : c.line,
          opacity: pressed ? 0.85 : 1,
        })}>
        <Glyph name={done ? 'check' : 'heartOutline'} color={done ? c.onAccent : c.accent} size={16} />
        <T variant="small" color={done ? c.onAccent : c.ink} style={{ fontWeight: '700' }}>
          {done ? 'Done. Lovely!' : 'I did it'}
        </T>
        <HeartBurst burst={burst} color={c.accent} />
      </Pressable>
    </View>
  );
}
