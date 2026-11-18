import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, useColorScheme, useWindowDimensions, View } from 'react-native';

import { HeartBurst } from '@/components/daily';
import { Hero, heroInk, useReducedMotion } from '@/components/hero';
import { Avatar, Button, Glyph, Row, T } from '@/components/ui';
import { ANIMALS } from '@/content/animals';
import { heartbeat, type Mood } from '@/lib/daily';
import { addDays, dayLabel, daysBetween, parseISODate, toISODate, today } from '@/lib/dates';
import { loadQuestions } from '@/lib/questions';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { alpha, isThemeName, mix, radius, space, THEMES, useColors, useThemeName } from '@/lib/theme';
import type { Answer } from '@/lib/types';

type Said = { day: string; question: string; body: string };
type Info = { mood: Mood | null; thoughts: number; said: Said[] };

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** Days until someone's next birthday, 0 on the day itself. 29 February falls on the 28th in other years. */
function daysToBirthday(iso: string): number {
  const b = parseISODate(iso);
  const t = today();
  const on = (year: number) => {
    const d = new Date(year, b.getMonth(), b.getDate());
    return d.getMonth() === b.getMonth() ? d : new Date(year, b.getMonth(), 28);
  };
  const next = on(t.getFullYear()) < t ? on(t.getFullYear() + 1) : on(t.getFullYear());
  return daysBetween(t, next);
}

/** Your partner's mood today, how often they've thought of you, and the answers of theirs you can already see. */
async function loadInfo(coupleId: string, partnerId: string): Promise<Info> {
  const day = toISODate(today());
  const [moods, nudges, answers, questions] = await Promise.all([
    supabase.from('moods').select('user_id, day, emoji, word, updated_at').eq('couple_id', coupleId).eq('day', day),
    supabase.from('nudges').select('from_user').eq('couple_id', coupleId).gte('created_at', today().toISOString()),
    supabase.rpc('get_answers', { p_from: toISODate(addDays(today(), -180)), p_to: day }),
    loadQuestions(),
  ]);
  const text = new Map(questions.map((q) => [q.id, q.text]));
  return {
    mood: ((moods.data ?? []) as Mood[]).find((m) => m.user_id === partnerId) ?? null,
    thoughts: ((nudges.data ?? []) as { from_user: string }[]).filter((n) => n.from_user === partnerId).length,
    // Your partner's answers show only once you've answered the same question, so this never gives one away.
    said: ((answers.data ?? []) as Answer[]).flatMap((a) => {
      const question = text.get(a.question_id);
      return a.user_id === partnerId && a.body && question ? [{ day: a.day, question, body: a.body }] : [];
    }),
  };
}

/** A small tile with one fact on it. */
function Fact({ emoji, value, label, tint }: { emoji: string; value: string; label: string; tint: string }) {
  const c = useColors();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 1,
        paddingVertical: space.sm,
        paddingHorizontal: 6,
        borderRadius: radius.md,
        backgroundColor: alpha(tint, 0.14),
        borderWidth: 1,
        borderColor: alpha(tint, 0.4),
      }}>
      <T style={{ fontSize: 18, lineHeight: 24 }}>{emoji}</T>
      <T variant="strong" color={mix(tint, c.ink, 0.35)} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      <T variant="fine" style={{ textAlign: 'center' }} numberOfLines={2}>
        {label}
      </T>
    </View>
  );
}

function Panel({ children }: { children: ReactNode }) {
  const c = useColors();
  return <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm }}>{children}</View>;
}

/**
 * Your partner's card: their own theme's scene, their animal, how their day is going,
 * something they once said, and a few things to do for them. Tap their animal for a surprise.
 */
export function PartnerCard({ open, onClose, onNudge }: { open: boolean; onClose: () => void; onNudge?: () => Promise<void> }) {
  const c = useColors();
  const current = useThemeName();
  const dark = useColorScheme() === 'dark';
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const partnerId = ctx?.partner.id;
  const [pop] = useState(() => new Animated.Value(0));
  const [bounce] = useState(() => new Animated.Value(0));
  const [burst, setBurst] = useState(0);
  const [note, setNote] = useState('');
  const [info, setInfo] = useState<Info | null>(null);
  const [pick, setPick] = useState(0);

  // The card pops up like it's been flipped over.
  useEffect(() => {
    if (!open) return;
    pop.setValue(reduced ? 1 : 0);
    if (!reduced) Animated.spring(pop, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }).start();
  }, [open, pop, reduced]);

  useEffect(() => {
    if (!open || !coupleId || !partnerId) return;
    let active = true;
    loadInfo(coupleId, partnerId).then((i) => {
      if (!active) return;
      setInfo(i);
      setPick(Math.floor(Math.random() * Math.max(1, i.said.length)));
    });
    return () => {
      active = false;
    };
  }, [open, coupleId, partnerId]);

  if (!ctx) return null;
  const { partner, couple } = ctx;
  const theme = isThemeName(partner.theme) ? partner.theme : current;
  const themeInfo = THEMES.find((t) => t.name === theme);
  const animal = ANIMALS.find((a) => a.key === partner.animal);
  const ink = heroInk(theme, dark);
  const glass = ink.ink === '#FFFFFF' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.65)';
  const days = couple.together_since ? Math.max(0, daysBetween(parseISODate(couple.together_since), today())) : null;
  const bday = partner.birthday ? daysToBirthday(partner.birthday) : null;
  const said = info?.said.length ? info.said[pick % info.said.length] : null;
  const realName = partner.real_name && partner.real_name !== partner.name ? partner.real_name : null;

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const hop = bounce.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: [0, -22, 0, 0] });
  const tilt = bounce.interpolate({ inputRange: [0, 0.2, 0.45, 0.7, 0.85, 1], outputRange: ['0deg', '-12deg', '10deg', '-6deg', '3deg', '0deg'] });
  const squash = bounce.interpolate({ inputRange: [0, 0.6, 0.72, 0.85, 1], outputRange: [1, 1, 1.12, 0.96, 1] });

  function close() {
    setNote('');
    onClose();
  }

  function poke() {
    setBurst((b) => b + 1);
    if (reduced) return;
    bounce.setValue(0);
    Animated.timing(bounce, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }

  async function nudge() {
    heartbeat();
    setBurst((b) => b + 1);
    setNote('');
    try {
      if (onNudge) await onNudge();
      else {
        const { error } = await supabase.rpc('send_nudge');
        if (error) throw error;
      }
      setNote(`Sent. ${partner.name}'s phone just buzzed 💓`);
    } catch (e) {
      setNote(friendlyError(e));
    }
  }

  function go(to: () => void) {
    close();
    to();
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg }}>
        <Pressable style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={close} accessibilityLabel="Close" />
        <Animated.View
          accessibilityViewIsModal
          style={{
            width: Math.min(width - space.lg * 2, 420),
            maxHeight: height * 0.88,
            opacity: pop,
            transform: [{ scale }],
            backgroundColor: c.page,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: alpha(c.accent2, 0.45),
            boxShadow: '0px 24px 60px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}>
          <ScrollView bounces={false} contentContainerStyle={{ padding: space.sm, paddingBottom: space.md, gap: 10 }}>
            {/* Their world: the scene from the theme they picked. */}
            <Hero height={120} theme={theme}>
              <Row style={{ justifyContent: 'space-between', padding: space.md }}>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: glass }}>
                  <T variant="fine" color={ink.ink} style={{ fontWeight: '800' }}>
                    {themeInfo ? `${themeInfo.emoji} ${themeInfo.label}` : ''}
                  </T>
                </View>
                <Pressable
                  onPress={close}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={8}
                  style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: glass, opacity: pressed ? 0.7 : 1 })}>
                  <Glyph name="close" color={ink.ink} size={18} />
                </Pressable>
              </Row>
            </Hero>

            <View style={{ alignItems: 'center', marginTop: -58, gap: 0 }}>
              <Pressable onPress={poke} accessibilityRole="button" accessibilityLabel={`Give ${partner.name}'s ${animal?.label.toLowerCase() ?? 'circle'} a poke`}>
                <Animated.View style={{ transform: [{ translateY: hop }, { rotate: tilt }, { scale: squash }] }}>
                  <Avatar name={partner.name} partner size={96} />
                </Animated.View>
                <HeartBurst burst={burst} color={c.accent} />
              </Pressable>
              <T variant="title" style={{ textAlign: 'center' }}>
                {partner.name}
              </T>
              {realName || animal ? (
                <T variant="small" muted style={{ textAlign: 'center' }}>
                  {[realName, animal && `${animal.emoji} ${animal.label}`].filter(Boolean).join(' · ')}
                </T>
              ) : null}
            </View>

            {(days !== null || bday !== null) && (
              <Row gap={space.sm} style={{ alignItems: 'stretch' }}>
                {days !== null && <Fact emoji="💞" value={days.toLocaleString('en-GB')} label="days together" tint={c.accent} />}
                {bday !== null && (
                  <Fact
                    emoji="🎂"
                    value={bday === 0 ? 'Today!' : bday === 1 ? 'Tomorrow' : `${bday} days`}
                    label={bday === 0 ? `${partner.name}'s birthday` : `to ${partner.name}'s birthday`}
                    tint={c.accent2}
                  />
                )}
                <Fact emoji="💭" value={info ? times(info.thoughts) : '…'} label="thought of you today" tint={c.accent3} />
              </Row>
            )}

            <Panel>
              <T variant="small" style={{ fontWeight: '800' }} color={mix(c.accent, c.ink, 0.3)}>
                {`${partner.name}'s mood today`}
              </T>
              {info?.mood ? (
                <Row gap={space.sm}>
                  <T style={{ fontSize: 30, lineHeight: 38 }}>{info.mood.emoji}</T>
                  <T variant="strong" style={{ flex: 1 }}>
                    {info.mood.word ?? 'No words, just this'}
                  </T>
                </Row>
              ) : (
                <T variant="small" muted>
                  {info ? `${partner.name} hasn’t picked one yet today.` : '…'}
                </T>
              )}
            </Panel>

            {said && (
              <Panel>
                <Row gap={space.sm}>
                  <T variant="small" style={{ flex: 1, fontWeight: '800' }} color={mix(c.accent2, c.ink, 0.3)}>
                    {`Something ${partner.name} said`}
                  </T>
                  {(info?.said.length ?? 0) > 1 && (
                    <Pressable
                      onPress={() => setPick((p) => p + 1)}
                      accessibilityRole="button"
                      accessibilityLabel="Show another answer"
                      hitSlop={8}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}>
                      <Glyph name="shuffle" color={c.accent} size={16} />
                      <T variant="fine" accent style={{ fontWeight: '800' }}>
                        Another
                      </T>
                    </Pressable>
                  )}
                </Row>
                <T variant="small" muted style={{ fontStyle: 'italic' }}>
                  {`Asked “${said.question}”`}
                </T>
                <View style={{ borderLeftWidth: 3, borderLeftColor: c.accent2, paddingLeft: space.md }}>
                  <T variant="strong">{said.body}</T>
                </View>
                <T variant="fine">{dayLabel(said.day)}</T>
              </Panel>
            )}

            <Button title="Thinking of you" icon={<Glyph name="heart" color={c.onAccent} size={18} />} onPress={nudge} />
            {note ? (
              <T variant="small" muted style={{ textAlign: 'center', marginTop: -4 }}>
                {note}
              </T>
            ) : null}
            <Row gap={space.sm}>
              <Button style={{ flex: 1, paddingHorizontal: space.md }} title="Letters" variant="outline" icon={<Glyph name="mail" color={c.ink} size={18} />} onPress={() => go(() => router.push('/letters'))} />
              <Button
                style={{ flex: 1, paddingHorizontal: space.md }}
                title="Wishlist"
                variant="outline"
                icon={<T style={{ fontSize: 16 }}>🎁</T>}
                onPress={() => go(() => router.push({ pathname: '/wishlist', params: { who: 'partner' } }))}
              />
            </Row>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
