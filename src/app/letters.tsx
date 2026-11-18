import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Animated, Easing, KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { BackHeader } from '@/components/game-ui';
import { HeartShape, useReducedMotion } from '@/components/hero';
import { Button, Chip, Empty, ErrorText, Field, Glyph, IconButton, Row, T } from '@/components/ui';
import { OCCASIONS, occasionEmoji } from '@/content/letters';
import { dayLabel, toISODate } from '@/lib/dates';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import type { Letter } from '@/lib/types';

const when = (iso: string) => dayLabel(toISODate(new Date(iso)));
/** For the middle of a sentence: "today", but "Tue 10 Nov". */
const whenInline = (iso: string) => {
  const w = when(iso);
  return /^(Today|Tomorrow|Yesterday)$/.test(w) ? w.toLowerCase() : w;
};

/** A sealed envelope with a heart for a wax seal. */
function Envelope({ width, flap, sealed }: { width: number; flap?: Animated.AnimatedInterpolation<number>; sealed: boolean }) {
  const c = useColors();
  const h = width * 0.62;
  return (
    <View style={{ width, height: h }}>
      <Svg width={width} height={h} viewBox="0 0 100 62">
        <Path d="M2 6 Q2 2 6 2 L94 2 Q98 2 98 6 L98 56 Q98 60 94 60 L6 60 Q2 60 2 56 Z" fill={c.surface} stroke={c.line} strokeWidth={1.2} />
        <Path d="M2 58 L42 30 M98 58 L58 30" stroke={c.line} strokeWidth={1.2} />
      </Svg>
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width,
          height: h * 0.62,
          transformOrigin: 'top',
          transform: flap ? [{ scaleY: flap }] : [],
        }}>
        <Svg width={width} height={h * 0.62} viewBox="0 0 100 38">
          <Path d="M3 1.5 L97 1.5 L52 36 Q50 37.5 48 36 Z" fill={c.surface2} stroke={c.line} strokeWidth={1.2} />
        </Svg>
      </Animated.View>
      {sealed && (
        <View
          style={{
            position: 'absolute',
            left: width / 2 - 15,
            top: h * 0.62 - 17,
            width: 30,
            height: 30,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Svg width={30} height={30} viewBox="0 0 30 30" style={{ position: 'absolute' }}>
            <Circle cx={15} cy={15} r={14} fill={c.accent} />
          </Svg>
          <HeartShape size={14} color={c.onAccent} />
        </View>
      )}
    </View>
  );
}

/** Opening a letter: the flap lifts, the letter slides out, and the words appear. */
function OpenLetter({ letter, from, onClose }: { letter: Letter | null; from: string; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!letter) return;
    t.setValue(reduced ? 1 : 0);
    if (!reduced)
      Animated.timing(t, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start();
  }, [letter, reduced, t]);

  if (!letter) return null;
  const flap = t.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [1, -1, -1],
  });
  const envelopeY = t.interpolate({
    inputRange: [0, 0.35, 0.75, 1],
    outputRange: [0, 0, 260, 320],
  });
  const envelopeFade = t.interpolate({
    inputRange: [0, 0.6, 0.85],
    outputRange: [1, 1, 0],
  });
  const paperY = t.interpolate({
    inputRange: [0, 0.3, 0.75, 1],
    outputRange: [120, 120, -10, 0],
  });
  const paperFade = t.interpolate({
    inputRange: [0, 0.3, 0.45, 1],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View
        style={{
          flex: 1,
          backgroundColor: c.page,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}>
        <Row
          style={{
            paddingHorizontal: space.lg,
            paddingVertical: space.sm,
            justifyContent: 'flex-end',
          }}>
          <IconButton label="Close" onPress={onClose}>
            <Glyph name="close" color={c.ink} />
          </IconButton>
        </Row>
        <ScrollView
          contentContainerStyle={{
            padding: space.lg,
            paddingBottom: space.xxl,
            alignItems: 'center',
          }}>
          <Animated.View
            style={{
              width: '100%',
              opacity: paperFade,
              transform: [{ translateY: paperY }],
            }}>
            <View
              style={{
                backgroundColor: c.surface,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: c.line,
                padding: space.xl,
                gap: space.md,
              }}>
              <T style={{ fontSize: 34, lineHeight: 40 }}>{occasionEmoji(letter.occasion)}</T>
              <T variant="heading">{letter.occasion}</T>
              <T style={{ fontSize: 18, lineHeight: 28 }}>{letter.body}</T>
              <T variant="small" muted style={{ textAlign: 'right' }}>
                With love, {from}
              </T>
            </View>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: space.lg,
              opacity: envelopeFade,
              transform: [{ translateY: envelopeY }],
            }}>
            <Envelope width={280} flap={flap} sealed={false} />
          </Animated.View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Write({ open, partnerName, onClose, onSent }: { open: boolean; partnerName: string; onClose: () => void; onSent: () => void }) {
  const c = useColors();
  const ctx = useCouple();
  const insets = useSafeAreaInsets();
  const [occasion, setOccasion] = useState(OCCASIONS[0].text);
  const [custom, setCustom] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const own = occasion === '';

  async function send() {
    setError('');
    const title = own ? custom.trim() : occasion;
    if (!title) return setError('Finish the line "Open when…".');
    if (!body.trim()) return setError('Write your letter first.');
    if (!ctx) return;
    setBusy(true);
    const { error: err } = await supabase.from('letters').insert({ couple_id: ctx.couple.id, occasion: title, body: body.trim() });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setBody('');
    setCustom('');
    onSent();
  }

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.page, paddingTop: insets.top }} behavior="padding">
        <Row
          style={{
            paddingHorizontal: space.lg,
            paddingVertical: space.sm,
            justifyContent: 'space-between',
          }}>
          <T variant="strong" style={{ fontSize: 18 }}>
            A letter for {partnerName}
          </T>
          <IconButton label="Close" onPress={onClose}>
            <Glyph name="close" color={c.ink} />
          </IconButton>
        </Row>
        <ScrollView
          contentContainerStyle={{
            padding: space.lg,
            gap: space.md,
            paddingBottom: space.xxl + insets.bottom,
          }}
          keyboardShouldPersistTaps="handled">
          <T variant="small" muted>
            Pick when {partnerName} should open it. They&apos;ll see the envelope straight away, but not your words until they open it.
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {OCCASIONS.map((o) => (
              <Chip key={o.text} label={`${o.emoji} ${o.text.replace('Open when ', '…')}`} selected={occasion === o.text} onPress={() => setOccasion(o.text)} />
            ))}
            <Chip label="✍️ My own" selected={own} onPress={() => setOccasion('')} />
          </View>
          {own && <Field label="Open when…" value={custom} onChangeText={setCustom} placeholder="Open when you land in Mombasa" maxLength={80} />}
          <Field label="Your letter" value={body} onChangeText={setBody} placeholder="My love…" multiline maxLength={5000} style={{ minHeight: 200 }} />
          <ErrorText>{error}</ErrorText>
          <Button title="Seal it and send 💌" onPress={send} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function Letters() {
  const c = useColors();
  const ctx = useCouple();
  const userId = ctx?.userId;
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [writing, setWriting] = useState(false);
  const [reading, setReading] = useState<Letter | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('get_letters');
    setLetters((data ?? []) as Letter[]);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!ctx) return null;
  const { partner, profile } = ctx;
  const forMe = letters.filter((l) => l.from_user !== userId);
  const fromMe = letters.filter((l) => l.from_user === userId);

  async function open(l: Letter) {
    setError('');
    if (l.body) return setReading(l);
    const { data, error: err } = await supabase.rpc('open_letter', {
      p_id: l.id,
    });
    if (err) return setError(friendlyError(err));
    const opened = {
      ...l,
      body: data as string,
      opened_at: l.opened_at ?? new Date().toISOString(),
    };
    setLetters((prev) => prev.map((x) => (x.id === l.id ? opened : x)));
    setReading(opened);
  }

  function takeBack(l: Letter) {
    if (l.opened_at) return;
    Alert.alert('Take this letter back?', `${partner.name} hasn't opened it yet. It will disappear for both of you.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Take it back',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('letters').delete().eq('id', l.id);
          load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <BackHeader title="Open-when letters" home="/chat" />
      <ScrollView
        contentContainerStyle={{
          padding: space.lg,
          gap: space.md,
          paddingBottom: space.xxl,
        }}>
        <T variant="small" muted>
          Letters for the right moment. They stay sealed until the one they&apos;re for decides it&apos;s time.
        </T>
        <Button title={`Write a letter for ${partner.name}`} onPress={() => setWriting(true)} />
        <ErrorText>{error}</ErrorText>

        <T variant="strong" style={{ marginTop: space.sm }}>
          For you
        </T>
        {loaded && !forMe.length && <Empty>No letters from {partner.name} yet.</Empty>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          {forMe.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => open(l)}
              accessibilityRole="button"
              accessibilityLabel={`${l.occasion}, from ${partner.name}. ${l.opened_at ? 'Read again' : 'Sealed. Tap to open'}`}
              style={({ pressed }) => ({
                width: '47%',
                flexGrow: 1,
                alignItems: 'center',
                gap: 6,
                padding: space.md,
                borderRadius: radius.lg,
                backgroundColor: l.opened_at ? c.surface : c.accentSoft,
                opacity: pressed ? 0.8 : 1,
              })}>
              <Envelope width={130} sealed={!l.opened_at} />
              <T variant="small" style={{ fontWeight: '700', textAlign: 'center' }}>
                {occasionEmoji(l.occasion)} {l.occasion}
              </T>
              <T variant="fine" style={{ textAlign: 'center' }}>
                {l.opened_at ? `Opened ${whenInline(l.opened_at)}` : `Sealed · ${when(l.created_at)}`}
              </T>
            </Pressable>
          ))}
        </View>

        <T variant="strong" style={{ marginTop: space.sm }}>
          From you
        </T>
        {loaded && !fromMe.length && <Empty>Letters you write for {partner.name} show here, with whether they&apos;ve opened them.</Empty>}
        {fromMe.map((l) => (
          <Pressable
            key={l.id}
            onPress={() => setReading(l)}
            onLongPress={() => takeBack(l)}
            accessibilityHint={l.opened_at ? undefined : 'Long press to take it back'}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              backgroundColor: c.surface,
              borderColor: c.line,
              borderWidth: 1,
              borderRadius: radius.md,
              padding: space.md,
            }}>
            <T style={{ fontSize: 26, lineHeight: 32 }}>{occasionEmoji(l.occasion)}</T>
            <View style={{ flex: 1 }}>
              <T variant="strong">{l.occasion}</T>
              <T variant="fine">
                {l.opened_at ? `${partner.name} opened it ${whenInline(l.opened_at)} 💞` : `Still sealed · written ${whenInline(l.created_at)}`}
              </T>
            </View>
          </Pressable>
        ))}
        {fromMe.some((l) => !l.opened_at) && <T variant="fine">Long press a sealed letter to take it back.</T>}
      </ScrollView>
      <Write
        open={writing}
        partnerName={partner.name}
        onClose={() => setWriting(false)}
        onSent={() => {
          setWriting(false);
          load();
        }}
      />
      <OpenLetter letter={reading} from={reading?.from_user === userId ? profile.name : partner.name} onClose={() => setReading(null)} />
    </SafeAreaView>
  );
}
