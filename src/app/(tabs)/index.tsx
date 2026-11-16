import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Photo } from '@/components/photo';
import { Avatar, Button, Card, DateField, Glyph, IconButton, Row, T } from '@/components/ui';
import { dayLabel, daysBetween, greeting, longDate, parseISODate, shortDate, timeLabel, toISODate, today } from '@/lib/dates';
import { useQuestions } from '@/lib/questions';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, tabBarInset, useColors } from '@/lib/theme';
import type { Memory, Plan } from '@/lib/types';

export default function Home() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const { today: q, reload: reloadQuestions } = useQuestions(ctx?.userId, 0);
  const [next, setNext] = useState<Plan | null>(null);
  const [latest, setLatest] = useState<Memory | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [since, setSince] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    if (!coupleId) return;
    const [plans, mems] = await Promise.all([
      supabase.from('events').select('*').eq('couple_id', coupleId).gte('day', toISODate(today())).order('day').order('time', { nullsFirst: true }).limit(1),
      supabase.from('memories').select('*').eq('couple_id', coupleId).order('happened_on', { ascending: false }).order('created_at', { ascending: false }).limit(1),
      reloadQuestions(),
    ]);
    setNext((plans.data?.[0] as Plan | undefined) ?? null);
    setLatest((mems.data?.[0] as Memory | undefined) ?? null);
  }, [coupleId, reloadQuestions]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!ctx) return null;
  const { profile, partner, couple, refresh } = ctx;
  const together = couple.together_since;

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

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.page }}>
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
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="eyebrow">{greeting()}</T>
            <T variant="title" numberOfLines={1}>
              {profile.name} & {partner.name}
            </T>
          </View>
          <IconButton label="Settings" onPress={() => router.push('/settings')}>
            <Glyph name="settings" color={c.ink} />
          </IconButton>
        </Row>

        <View style={{ alignItems: 'center', paddingVertical: space.md, gap: 2 }}>
          <Row gap={4}>
            <Avatar name={profile.name} />
            <Glyph name="heart" color={c.accent} size={26} />
            <Avatar name={partner.name} partner />
          </Row>
          {together ? (
            <>
              <T style={{ fontSize: 52, lineHeight: 58, fontWeight: '800', letterSpacing: -2, color: c.accent, marginTop: space.sm, fontVariant: ['tabular-nums'] }}>
                {Math.max(0, daysBetween(parseISODate(together), today())).toLocaleString('en-GB')}
              </T>
              <T variant="strong">days together</T>
              <T variant="fine">Since {longDate(together)}</T>
            </>
          ) : (
            <Card style={{ alignSelf: 'stretch', marginTop: space.md, gap: space.md }}>
              <T variant="strong">When did you two get together?</T>
              <DateField label="Together since" value={since} onChange={setSince} maximumDate={today()} />
              {saveError ? <T variant="small" color={c.danger}>{saveError}</T> : null}
              <Button title="Save" onPress={saveSince} disabled={!since} />
            </Card>
          )}
        </View>

        <Card tone="accent" onPress={() => router.push('/question')} accessibilityLabel="Open today's question">
          <T variant="eyebrow" color={c.onAccent}>
            Today&apos;s question
          </T>
          <T variant="heading" color={c.onAccent}>
            {q?.question?.text ?? 'Loading…'}
          </T>
          <Row gap={6}>
            <Glyph name={q?.mine ? 'check' : 'lock'} color={c.onAccent} size={14} />
            <T variant="small" color={c.onAccent}>
              {qStatus}
            </T>
          </Row>
        </Card>

        {next ? (
          <Card onPress={() => router.push({ pathname: '/calendar', params: { day: next.day } })} accessibilityLabel={`Next up: ${next.title}`}>
            <Row gap={space.lg}>
              <View style={{ width: 62, height: 62, borderRadius: radius.sm, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <T style={{ fontSize: 24, fontWeight: '800', color: c.accent, lineHeight: 26 }}>{parseISODate(next.day).getDate()}</T>
                <T variant="eyebrow">{parseISODate(next.day).toLocaleDateString('en-GB', { month: 'short' })}</T>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="eyebrow">Next up</T>
                <T variant="strong">{next.title}</T>
                <T variant="small" muted>
                  {dayLabel(next.day)} · {timeLabel(next.time)}
                </T>
              </View>
            </Row>
          </Card>
        ) : (
          <Card onPress={() => router.push('/new-plan')}>
            <T variant="eyebrow">Next up</T>
            <T variant="strong">Nothing planned yet</T>
            <T variant="small" muted>Tap to plan something together.</T>
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
            <T variant="small" muted>A photo, a few words, and a date to remember.</T>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
