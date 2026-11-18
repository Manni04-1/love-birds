import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Garden } from '@/components/garden';
import { Button, Card, Glyph, Row, T } from '@/components/ui';
import { shortDate } from '@/lib/dates';
import { gardenPoints, gardenStage, GROWS, loadGarden, topGrowers, type GardenCounts } from '@/lib/garden';
import { useRoom } from '@/lib/room';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { challengeSummary, loadBucket, loadChallengeTicks, tickChallenge, untickChallenge, type ChallengeTick, type ChallengeWeek } from '@/lib/together';
import { radius, space, tabBarInset, useColors } from '@/lib/theme';
import type { BucketItem } from '@/lib/types';

function Check({ on, label }: { on: boolean; label: string }) {
  const c = useColors();
  return (
    <Row gap={6} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: on ? c.accentSoft : c.surface2 }}>
      <T variant="small" style={{ fontWeight: '700' }} color={on ? c.accent : c.muted}>
        {on ? '✓' : '○'} {label}
      </T>
    </Row>
  );
}

function GardenCard({ counts }: { counts: GardenCounts }) {
  const c = useColors();
  const ctx = useCouple();
  const [how, setHow] = useState(false);
  const points = gardenPoints(counts);
  const stage = gardenStage(points);
  const top = topGrowers(counts);
  if (!ctx) return null;
  const { partner } = ctx;
  return (
    <Card style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
      <Garden stage={stage.index} height={210} />
      <View style={{ padding: space.lg, gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="heading">Your love garden</T>
          <T variant="eyebrow" accent>
            {stage.name}
          </T>
        </Row>
        <View
          style={{ height: 8, borderRadius: radius.pill, backgroundColor: c.surface2, overflow: 'hidden' }}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(stage.progress * 100) }}>
          <View style={{ width: `${Math.round(stage.progress * 100)}%`, height: '100%', backgroundColor: c.accent, borderRadius: radius.pill }} />
        </View>
        <T variant="small" muted>
          {stage.next ? `${stage.toNext} more to grow into ${stage.next.name}.` : 'Fully grown. Keep tending it and it stays this way.'}
        </T>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          <Check on={counts.today_me} label="You today" />
          <Check on={counts.today_partner} label={`${partner.name} today`} />
        </Row>
        {top.length > 0 && (
          <T variant="small" muted>
            Grown most by {top.map((g) => `${g.count} ${g.label}`).join(', ')}.
          </T>
        )}
        <Pressable onPress={() => setHow((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: how }} hitSlop={8}>
          <T variant="small" accent style={{ fontWeight: '700' }}>
            {how ? 'Hide how it grows' : 'How it grows'}
          </T>
        </Pressable>
        {how && (
          <View style={{ gap: 4 }}>
            <T variant="small" muted>
              Everything you do together in Love Birds helps. It never wilts, so take your time.
            </T>
            {GROWS.map((g) => (
              <Row key={g.key} style={{ justifyContent: 'space-between' }}>
                <T variant="small">{g.label[0].toUpperCase() + g.label.slice(1)}</T>
                <T variant="small" muted>
                  +{g.points} each
                </T>
              </Row>
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}

function ChallengeCard({ week, title, onTick, onUntick, busy, daysLeft, partnerName }: {
  week: ChallengeWeek;
  title: string;
  onTick: () => void;
  onUntick: () => void;
  busy: boolean;
  daysLeft?: number;
  partnerName: string;
}) {
  const c = useColors();
  const both = week.mine && week.partner;
  const status = both
    ? 'You both did it. Badge earned 🏅'
    : week.mine
      ? `You've ticked it off. ${partnerName} ticks it off on their phone too.`
      : week.partner
        ? `${partnerName} has ticked it off. Did you do it together?`
        : daysLeft === undefined
          ? ''
          : daysLeft === 0
            ? 'Last day today.'
            : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left this week.`;
  return (
    <Card tone={both ? 'soft' : 'plain'} style={{ gap: space.sm }}>
      <T variant="eyebrow">{title}</T>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: both ? c.surface : c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ fontSize: 28, lineHeight: 34 }}>{week.challenge.emoji}</T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="strong" style={{ fontSize: 18 }}>
            {week.challenge.title}
          </T>
          <T variant="small" muted>
            {week.challenge.details}
          </T>
        </View>
      </Row>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        <Check on={week.mine} label="You" />
        <Check on={week.partner} label={partnerName} />
      </Row>
      {!!status && <T variant="small">{status}</T>}
      {!week.mine ? (
        <Button title={week.partner ? 'Tick it off too' : 'We did it'} onPress={onTick} loading={busy} icon={<Glyph name="check" color={c.onAccent} size={18} />} />
      ) : (
        !both && <Button title="Not yet, untick it" variant="ghost" onPress={onUntick} disabled={busy} />
      )}
    </Card>
  );
}

function Badges({ badges }: { badges: ReturnType<typeof challengeSummary>['badges'] }) {
  const c = useColors();
  if (!badges.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <T variant="eyebrow">
        {badges.length} {badges.length === 1 ? 'badge' : 'badges'}
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
        {badges.map((b) => (
          <View key={b.week} style={{ alignItems: 'center', gap: 4, width: 76 }} accessible accessibilityLabel={`${b.challenge.title}, week of ${shortDate(b.week)}`}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: c.accentSoft, borderWidth: 2, borderColor: c.accent2, alignItems: 'center', justifyContent: 'center' }}>
              <T style={{ fontSize: 28, lineHeight: 34 }}>{b.challenge.emoji}</T>
            </View>
            <T variant="fine" style={{ textAlign: 'center' }} numberOfLines={2}>
              {b.challenge.title}
            </T>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function BucketCard({ items }: { items: BucketItem[] }) {
  const c = useColors();
  const open = items.filter((i) => !i.done_on);
  const done = items.length - open.length;
  return (
    <Card onPress={() => router.push('/bucket-list')} accessibilityLabel={`Bucket list. ${open.length} to do, ${done} done.`} style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="eyebrow">Bucket list</T>
        <Glyph name="next" color={c.muted} size={18} />
      </Row>
      {items.length === 0 ? (
        <>
          <T variant="strong" style={{ fontSize: 18 }}>
            Dream up things to do together
          </T>
          <T variant="small" muted>
            Places to go, things to try, one day or someday. Tick them off together and they become memories.
          </T>
        </>
      ) : (
        <>
          <T variant="strong" style={{ fontSize: 18 }}>
            {done ? `${done} done, ${open.length} to go` : `${open.length} ${open.length === 1 ? 'dream' : 'dreams'} to go`}
          </T>
          {open.slice(0, 3).map((i) => (
            <Row key={i.id} gap={space.sm}>
              <T style={{ fontSize: 18, lineHeight: 24 }}>{i.emoji || '✨'}</T>
              <T variant="small" style={{ flex: 1 }} numberOfLines={1}>
                {i.title}
              </T>
            </Row>
          ))}
          {open.length > 3 && (
            <T variant="small" muted>
              and {open.length - 3} more
            </T>
          )}
        </>
      )}
    </Card>
  );
}

/** The Us tab of Together: your garden, this week's challenge, badges and the bucket list. */
export function UsPanel() {
  const c = useColors();
  const ctx = useCouple();
  const room = useRoom();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const [counts, setCounts] = useState<GardenCounts | null>(null);
  const [ticks, setTicks] = useState<ChallengeTick[]>([]);
  const [bucket, setBucket] = useState<BucketItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!coupleId) return;
    const [g, t, b] = await Promise.all([loadGarden(), loadChallengeTicks(coupleId), loadBucket(coupleId)]);
    setCounts(g);
    setTicks(t);
    setBucket(b);
  }, [coupleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`us:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge_done', filter: `couple_id=eq.${coupleId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bucket_items', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  if (!ctx || !coupleId || !userId) return null;
  const { partner } = ctx;
  const summary = challengeSummary(ticks, coupleId, userId);
  const lastWeekNeedsYou = summary.lastWeekOpen && summary.lastWeek.partner && !summary.lastWeek.mine;

  async function tick(week: ChallengeWeek) {
    if (!coupleId) return;
    setBusy(true);
    setError('');
    const { error: err } = await tickChallenge(coupleId, week);
    if (err) setError(friendlyError(err));
    await load();
    setBusy(false);
  }

  async function untick(week: ChallengeWeek) {
    if (!coupleId || !userId) return;
    setBusy(true);
    setError('');
    const { error: err } = await untickChallenge(coupleId, userId, week.week);
    if (err) setError(friendlyError(err));
    await load();
    setBusy(false);
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: tabBarInset + space.xl, gap: space.lg }}>
      {room.partnerOnline && (
        <Card tone="soft" onPress={() => router.push('/live')} accessibilityLabel={`${partner.name} is here now. Play a live game.`}>
          <Row gap={space.md}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#2BB673' }} />
            <View style={{ flex: 1 }}>
              <T variant="strong">{partner.name} is here now</T>
              <T variant="small" muted>
                Play a quick live game together
              </T>
            </View>
            <T style={{ fontSize: 26, lineHeight: 32 }}>🎮</T>
          </Row>
        </Card>
      )}
      {counts && <GardenCard counts={counts} />}
      <ChallengeCard
        week={summary.thisWeek}
        title="This week's challenge"
        daysLeft={summary.daysLeft}
        partnerName={partner.name}
        busy={busy}
        onTick={() => tick(summary.thisWeek)}
        onUntick={() => untick(summary.thisWeek)}
      />
      {lastWeekNeedsYou && (
        <ChallengeCard
          week={summary.lastWeek}
          title="Last week's challenge"
          partnerName={partner.name}
          busy={busy}
          onTick={() => tick(summary.lastWeek)}
          onUntick={() => untick(summary.lastWeek)}
        />
      )}
      {!!error && (
        <T variant="small" color={c.danger}>
          {error}
        </T>
      )}
      <Badges badges={summary.badges} />
      <BucketCard items={bucket} />
    </ScrollView>
  );
}
