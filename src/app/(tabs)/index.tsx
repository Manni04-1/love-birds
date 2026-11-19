import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { Critters } from '@/components/critters';
import { GestureCard, MoodPicker, MoodRow, NudgeButton, NudgeToast, TilePhoto, TodayTile } from '@/components/daily';
import { HeartShape, Hero, heroInk, usePulse, useReducedMotion } from '@/components/hero';
import { HomeSafeCard } from '@/components/home-safe';
import { PartnerCard } from '@/components/partner-card';
import { Photo } from '@/components/photo';
import { PlanIconView } from '@/components/plan-icon';
import { Avatar, Button, Card, DateField, Glyph, Row, T } from '@/components/ui';
import { gestureFor } from '@/content/gestures';
import { saveMood, useCheckins, useDailyPhotos, useGestureDone, useMoods, useNudges } from '@/lib/daily';
import { dayLabel, dayNumber, daysBetween, greeting, longDate, parseISODate, shortDate, timeLabel, toISODate, today } from '@/lib/dates';
import { iconFor } from '@/lib/plan-icons';
import { dayOf, isRepeat, loadUpcoming, rangeLabel, repeatLabel, type Occurrence } from '@/lib/plans';
import { useQuestions } from '@/lib/questions';
import { monthKey, shiftMonth } from '@/lib/recap';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, tabBarInset, useColors, useThemeName } from '@/lib/theme';
import type { Memory } from '@/lib/types';

/** A heart that beats between your two initials. */
function Heartbeat({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const beat = usePulse(1100, 0, reduced);
  const scale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  return (
    <Animated.View style={{ transform: [{ scale }], marginHorizontal: -6, zIndex: 1 }}>
      <HeartShape size={34} color={color} />
    </Animated.View>
  );
}

/** "642 days together", plus a note on anniversaries and every hundredth day. */
function milestone(since: string, days: number): string {
  const start = parseISODate(since);
  const t = today();
  const years = t.getFullYear() - start.getFullYear();
  if (years > 0 && t.getMonth() === start.getMonth() && t.getDate() === start.getDate()) {
    return `🎉 Happy anniversary! ${years} ${years === 1 ? 'year' : 'years'} today`;
  }
  if (days > 0 && days % 100 === 0) return `🎉 ${days.toLocaleString('en-GB')} days today!`;
  const next = Math.ceil((days + 1) / 100) * 100;
  return `${next - days} ${next - days === 1 ? 'day' : 'days'} until day ${next.toLocaleString('en-GB')}`;
}

/** During the first week of a month, last month's recap. */
function recapMonth(): Date | null {
  const t = today();
  return t.getDate() <= 7 ? shiftMonth(t, -1) : null;
}

function countdown(o: Occurrence): string {
  const n = daysBetween(today(), parseISODate(o.start));
  if (n < 0) return 'On now';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `In ${n} days`;
}

/** "Tomorrow · 8:00 PM", or for a trip "Sat 21 Nov to Mon 23 Nov", or "Day 2 of 3 · …" once it's begun. */
function whenLabel(o: Occurrence): string {
  if (o.end === o.start) return `${dayLabel(o.start)} · ${timeLabel(o.plan.time)}`;
  const now = toISODate(today());
  if (o.start < now) return `${dayOf(o, now)} · ${rangeLabel(o)}`;
  return o.plan.time ? `${rangeLabel(o)} · ${timeLabel(o.plan.time)}` : rangeLabel(o);
}

export default function Home() {
  const c = useColors();
  const theme = useThemeName();
  const dark = useColorScheme() === 'dark';
  const ink = heroInk(theme, dark);
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const { today: q, reload: reloadQuestions } = useQuestions(userId, 0);
  const checkins = useCheckins(userId);
  const photos = useDailyPhotos(userId);
  const { moods, reload: reloadMoods } = useMoods(coupleId);
  const [ping, setPing] = useState(0);
  const nudges = useNudges(coupleId, userId, () => setPing((p) => p + 1));
  const gesture = useGestureDone();
  const [moodOpen, setMoodOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [next, setNext] = useState<Occurrence | null>(null);
  const [latest, setLatest] = useState<Memory | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [since, setSince] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const reloadCheckins = checkins.reload;
  const reloadPhotos = photos.reload;
  const reloadNudges = nudges.reload;

  const load = useCallback(async () => {
    if (!coupleId) return;
    const [plans, mems] = await Promise.all([
      loadUpcoming(coupleId, toISODate(today()), 1),
      supabase.from('memories').select('*').eq('couple_id', coupleId).order('happened_on', { ascending: false }).order('created_at', { ascending: false }).limit(1),
      reloadQuestions(),
      reloadCheckins(),
      reloadPhotos(),
      reloadMoods(),
      reloadNudges(),
    ]);
    setNext(plans[0] ?? null);
    setLatest((mems.data?.[0] as Memory | undefined) ?? null);
  }, [coupleId, reloadQuestions, reloadCheckins, reloadPhotos, reloadMoods, reloadNudges]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!ctx) return null;
  const { profile, partner, couple, refresh } = ctx;
  const together = couple.together_since;
  const days = together ? Math.max(0, daysBetween(parseISODate(together), today())) : 0;
  const myMood = moods.find((m) => m.user_id === profile.id) ?? null;
  const theirMood = moods.find((m) => m.user_id !== profile.id) ?? null;
  const ci = checkins.today;
  const ph = photos.today;

  async function saveSince() {
    if (!since) return;
    setSaveError('');
    const { error } = await supabase.from('couples').update({ together_since: since }).eq('id', couple.id);
    if (error) return setSaveError(friendlyError(error));
    await refresh();
  }

  const qStatus = !q
    ? ''
    : q.mine
      ? q.partner?.body
        ? `You both answered. See what ${partner.name} said.`
        : `You answered. Waiting for ${partner.name}.`
      : q.partner
        ? `${partner.name} answered. Your turn.`
        : 'Be the first to answer today.';

  const checkinStatus = !ci?.mine
    ? ci?.partner
      ? `${partner.name} shared theirs. Your turn.`
      : 'The best bit, the hard bit, and what\'s next.'
    : ci.partner?.rose
      ? `See ${partner.name}'s day`
      : `Waiting for ${partner.name}`;

  const photoStatus = !ph?.mine
    ? ph?.partner
      ? `${partner.name} added one. Add yours to see it.`
      : 'Snap a moment from your day.'
    : ph.partner?.photo_path
      ? `See ${partner.name}'s photo`
      : `Waiting for ${partner.name}`;

  const done = [!!q?.mine, !!ci?.mine, !!ph?.mine, gesture.done].filter(Boolean).length;
  // Your animals snuggle up once you've both done something today.
  const meToday = done > 0 || !!myMood || nudges.mine > 0;
  const themToday = !!q?.partner || !!ci?.partner || !!ph?.partner || !!theirMood || nudges.theirs > 0;
  const recap = recapMonth();
  const heart = ink.ink === '#FFFFFF' ? '#FFFFFF' : c.accent;
  const shadow = { textShadowColor: ink.shadow, textShadowRadius: 10, textShadowOffset: { width: 0, height: 1 } };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <NudgeToast name={partner.name} ping={ping} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: tabBarInset + space.xl, gap: space.md }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([refresh(), load()]);
              setRefreshing(false);
            }}
          />
        }>
        <Hero height={together ? 336 : 296}>
          <View style={{ flex: 1, padding: space.lg, justifyContent: 'space-between' }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <T variant="eyebrow" color={ink.soft} style={shadow}>
                  {greeting()}
                </T>
                <T variant="title" color={ink.ink} numberOfLines={1} style={shadow}>
                  {profile.name} & {partner.name}
                </T>
              </View>
              <Pressable
                onPress={() => router.push('/settings')}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                hitSlop={6}
                style={({ pressed }) => ({
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: dark || ink.ink === '#FFFFFF' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.6)',
                  opacity: pressed ? 0.7 : 1,
                })}>
                <Glyph name="settings" color={ink.ink} />
              </Pressable>
            </Row>
            <View style={{ alignItems: 'center' }}>
              <Row gap={0}>
                <Avatar name={profile.name} size={52} />
                <Heartbeat color={heart} />
                <Pressable onPress={() => setCardOpen(true)} accessibilityRole="button" accessibilityLabel={`Open ${partner.name}'s profile`} hitSlop={6}>
                  <Avatar name={partner.name} partner size={52} />
                </Pressable>
              </Row>
              {together ? (
                <>
                  <T variant="display" color={ink.ink} style={[{ fontSize: 56, lineHeight: 62, marginTop: 4, fontVariant: ['tabular-nums'] }, shadow]}>
                    {days.toLocaleString('en-GB')}
                  </T>
                  <T variant="strong" color={ink.ink} style={[{ marginTop: -4 }, shadow]}>
                    days together
                  </T>
                  <T variant="small" color={ink.soft} style={[{ marginTop: 2 }, shadow]}>
                    {milestone(together, days)}
                  </T>
                </>
              ) : (
                <T variant="strong" color={ink.ink} style={[{ marginTop: space.sm }, shadow]}>
                  Your love story starts here
                </T>
              )}
            </View>
            <Critters mine={profile.animal} theirs={partner.animal} close={meToday && themToday} ping={ping} heart={heart} />
          </View>
        </Hero>

        {recap && (
          <Card
            tone="soft"
            onPress={() => router.push({ pathname: '/recap', params: { month: monthKey(recap) } })}
            accessibilityLabel={`Your ${recap.toLocaleDateString('en-GB', { month: 'long' })} together. See your monthly recap.`}>
            <Row gap={space.md}>
              <T style={{ fontSize: 30, lineHeight: 36 }}>📊</T>
              <View style={{ flex: 1 }}>
                <T variant="strong">Your {recap.toLocaleDateString('en-GB', { month: 'long' })} together</T>
                <T variant="small" muted>
                  Your monthly recap is ready. See what you two got up to.
                </T>
              </View>
              <Glyph name="next" color={c.muted} size={18} />
            </Row>
          </Card>
        )}

        {!together && (
          <Card style={{ gap: space.md }}>
            <T variant="strong">When did you two get together?</T>
            <DateField label="Together since" value={since} onChange={setSince} maximumDate={today()} />
            {saveError ? (
              <T variant="small" color={c.danger}>
                {saveError}
              </T>
            ) : null}
            <Button title="Save" onPress={saveSince} disabled={!since} />
          </Card>
        )}

        <NudgeButton partnerName={partner.name} theirs={nudges.theirs} mine={nudges.mine} onSend={nudges.send} />
        <MoodRow mine={myMood} partner={theirMood} partnerName={partner.name} onPick={() => setMoodOpen(true)} />
        <HomeSafeCard coupleId={couple.id} userId={profile.id} partnerName={partner.name} />

        <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
          <T variant="heading">Today</T>
          <T variant="small" muted style={{ fontWeight: '700' }}>
            {done === 4 ? 'All done 💯' : `${done} of 4 done`}
          </T>
        </Row>

        <Card tone="accent" onPress={() => router.push('/question')} accessibilityLabel="Open today's question">
          <T variant="eyebrow" color={c.onAccent}>
            💬 Today&apos;s question
          </T>
          <T variant="heading" color={c.onAccent}>
            {q?.question?.text ?? 'Loading…'}
          </T>
          <Row gap={6}>
            <Glyph name={q?.mine ? 'check' : 'lock'} color={c.onAccent} size={14} />
            <T variant="small" color={c.onAccent} style={{ flex: 1 }}>
              {qStatus}
            </T>
          </Row>
        </Card>

        <Row gap={space.sm} style={{ alignItems: 'stretch' }}>
          <TodayTile emoji="🌹" title="Rose, thorn, bud" status={checkinStatus} todo={!ci?.mine} onPress={() => router.push('/checkin')} />
          <TodayTile emoji="📸" title="Photo of the day" status={photoStatus} todo={!ph?.mine} onPress={() => router.push('/photo-of-the-day')}>
            <TilePhoto path={ph?.mine ? ph.partner?.photo_path : null} />
          </TodayTile>
        </Row>

        <GestureCard text={gestureFor(dayNumber(), profile.id, partner.id)} done={gesture.done} onToggle={gesture.toggle} />

        <T variant="heading" style={{ marginTop: space.md }}>
          Coming up
        </T>
        {next ? (
          <Card
            onPress={() => router.push({ pathname: '/calendar', params: { day: next.start < toISODate(today()) ? toISODate(today()) : next.start } })}
            accessibilityLabel={`Next up: ${next.plan.title}, ${countdown(next)}`}>
            <Row gap={space.lg}>
              <View style={{ width: 62, height: 62, borderRadius: radius.sm, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <T variant="title" style={{ fontSize: 24, color: c.accent, lineHeight: 28 }}>
                  {parseISODate(next.start).getDate()}
                </T>
                <T variant="eyebrow">{parseISODate(next.start).toLocaleDateString('en-GB', { month: 'short' })}</T>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="eyebrow">{countdown(next)}</T>
                <Row gap={6} style={{ alignItems: 'flex-start' }}>
                  <PlanIconView icon={iconFor(next.plan)} size={21} />
                  <T variant="strong" style={{ flex: 1 }}>
                    {next.plan.title}
                  </T>
                </Row>
                <T variant="small" muted>
                  {whenLabel(next)}
                </T>
                {isRepeat(next.plan.repeats) && (
                  <T variant="small" muted>
                    🔁 {repeatLabel(next.plan)}
                  </T>
                )}
              </View>
            </Row>
          </Card>
        ) : (
          <Card onPress={() => router.push('/new-plan')}>
            <T variant="eyebrow">Next up</T>
            <T variant="strong">Nothing planned yet</T>
            <T variant="small" muted>
              Tap to plan something, or swipe some date ideas in Together.
            </T>
          </Card>
        )}

        {latest ? (
          <Card onPress={() => router.push('/memories')} accessibilityLabel="Open memories">
            <Row gap={space.lg}>
              <Photo path={latest.photo_path} style={{ width: 62, height: 62, borderRadius: radius.sm }} />
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="eyebrow">Latest memory</T>
                <T variant="strong" numberOfLines={2}>
                  {latest.caption}
                </T>
                <T variant="small" muted numberOfLines={1}>
                  {shortDate(latest.happened_on)}
                  {latest.place ? ` · ${latest.place}` : ''}
                </T>
              </View>
            </Row>
          </Card>
        ) : (
          <Card onPress={() => router.push('/new-memory')}>
            <T variant="eyebrow">Memories</T>
            <T variant="strong">Save your first memory</T>
            <T variant="small" muted>
              A photo, a few words, and a date to remember.
            </T>
          </Card>
        )}

        {together ? (
          <T variant="fine" style={{ textAlign: 'center', marginTop: space.sm }}>
            Together since {longDate(together)} 💕
          </T>
        ) : null}
      </ScrollView>
      <MoodPicker
        open={moodOpen}
        current={myMood}
        onClose={() => setMoodOpen(false)}
        onSave={async (emoji, word) => {
          await saveMood(couple.id, profile.id, emoji, word);
          await reloadMoods();
        }}
      />
      <PartnerCard open={cardOpen} onClose={() => setCardOpen(false)} onNudge={nudges.send} />
    </SafeAreaView>
  );
}
