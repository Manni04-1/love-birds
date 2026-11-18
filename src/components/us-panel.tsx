import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Garden } from '@/components/garden';
import { Button, Card, Glyph, ProgressBar, Row, T } from '@/components/ui';
import { tonightKind } from '@/content/tonight';
import { shortDate } from '@/lib/dates';
import { ksh, loadFunds, topFund } from '@/lib/funds';
import { gardenPoints, gardenStage, GROWS, loadGarden, topGrowers, type GardenCounts } from '@/lib/garden';
import { useRoom } from '@/lib/room';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { challengeSummary, loadBucket, loadChallengeTicks, tickChallenge, untickChallenge, type ChallengeTick, type ChallengeWeek } from '@/lib/together';
import { radius, space, tabBarInset, useColors } from '@/lib/theme';
import type { BucketItem, Decider, Fund, FundEntry } from '@/lib/types';

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
        <ProgressBar value={stage.progress} height={8} label="Garden growth" />
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

/** A decider from Tonight that wants your swipes, or tonight's match. */
function TonightCard({ decider, userId, partnerName }: { decider: Decider; userId: string; partnerName: string }) {
  const c = useColors();
  const kind = tonightKind(decider.kind);
  const winner = decider.winner ? decider.options.find((o) => o.key === decider.winner) : null;
  const theirs = decider.created_by !== userId;
  if (winner) {
    return (
      <Card tone="soft" onPress={() => router.push('/tonight')} accessibilityLabel={`Tonight's sorted: ${winner.label}`}>
        <Row gap={space.md}>
          <T style={{ fontSize: 34, lineHeight: 42 }}>{winner.emoji}</T>
          <View style={{ flex: 1 }}>
            <T variant="eyebrow">Tonight&apos;s sorted 🎉</T>
            <T variant="strong" style={{ fontSize: 18 }}>
              {winner.label}
            </T>
          </View>
          <Glyph name="next" color={c.muted} size={18} />
        </Row>
      </Card>
    );
  }
  if (decider.done_by.includes(userId)) return null;
  const swiped = Object.keys(decider.mine).length;
  return (
    <Card tone={theirs ? 'accent' : 'soft'} onPress={() => router.push('/tonight')} accessibilityLabel={`${kind.question} Swipe to decide.`}>
      <Row gap={space.md}>
        <T style={{ fontSize: 34, lineHeight: 42 }}>{kind.emoji}</T>
        <View style={{ flex: 1 }}>
          <T variant="strong" color={theirs ? c.onAccent : c.ink}>
            {theirs ? `${partnerName} wants to decide ${kind.title.toLowerCase()} tonight` : kind.question}
          </T>
          <T variant="small" color={theirs ? c.onAccent : c.muted}>
            {swiped ? `You've swiped ${swiped} of ${decider.options.length}. Keep going.` : 'Swipe through the options. The first one you both like wins.'}
          </T>
        </View>
        <Glyph name="next" color={theirs ? c.onAccent : c.muted} size={18} />
      </Row>
    </Card>
  );
}

function Tile({ emoji, title, sub, badge, onPress }: { emoji: string; title: string; sub: string; badge?: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${badge ? `${badge}. ` : ''}${sub}`}
      style={({ pressed }) => ({
        flexBasis: '47%',
        flexGrow: 1,
        backgroundColor: c.surface,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: space.md,
        gap: 2,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <T style={{ fontSize: 28, lineHeight: 34 }}>{emoji}</T>
        {!!badge && (
          <View style={{ backgroundColor: c.accent, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
            <T variant="fine" color={c.onAccent} style={{ fontWeight: '700' }}>
              {badge}
            </T>
          </View>
        )}
      </Row>
      <T variant="strong">{title}</T>
      <T variant="fine" numberOfLines={2}>
        {sub}
      </T>
    </Pressable>
  );
}

function FundCard({ fund, total }: { fund: Fund; total: number }) {
  const c = useColors();
  const pct = Math.min(100, Math.floor((total * 100) / fund.target));
  return (
    <Card onPress={() => router.push('/trip-fund')} accessibilityLabel={`${fund.title}. ${ksh(total)} of ${ksh(fund.target)} saved.`} style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="eyebrow">Trip fund</T>
        <Glyph name="next" color={c.muted} size={18} />
      </Row>
      <Row gap={space.md}>
        <T style={{ fontSize: 28, lineHeight: 34 }}>{fund.emoji || '✈️'}</T>
        <T variant="strong" style={{ fontSize: 18, flex: 1 }} numberOfLines={1}>
          {fund.title}
        </T>
        <T variant="strong" accent>
          {pct}%
        </T>
      </Row>
      <ProgressBar value={total / fund.target} />
      <T variant="small" muted>
        {ksh(total)} of {ksh(fund.target)}. {ksh(fund.target - total)} to go.
      </T>
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
  const [tonight, setTonight] = useState<Decider | null>(null);
  const [funds, setFunds] = useState<{ funds: Fund[]; entries: FundEntry[] }>({ funds: [], entries: [] });
  const [couponsReady, setCouponsReady] = useState(0);
  const [listOpen, setListOpen] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!coupleId) return;
    const [g, t, b] = await Promise.all([loadGarden(), loadChallengeTicks(coupleId), loadBucket(coupleId)]);
    setCounts(g);
    setTicks(t);
    setBucket(b);
  }, [coupleId]);

  // The newer things. Any of these can fail until extras.sql has run, and then they just stay empty.
  const loadExtras = useCallback(async () => {
    if (!coupleId || !userId) return;
    const [d, f, cp, li] = await Promise.all([
      supabase.rpc('get_tonight'),
      loadFunds(coupleId),
      supabase.from('coupons').select('id', { count: 'exact', head: true }).eq('couple_id', coupleId).neq('from_user', userId).is('redeemed_at', null),
      supabase.from('list_items').select('id', { count: 'exact', head: true }).eq('couple_id', coupleId).is('done_at', null),
    ]);
    setTonight(d.error ? null : ((d.data as Decider | null) ?? null));
    setFunds(f.error ? { funds: [], entries: [] } : { funds: f.funds, entries: f.entries });
    setCouponsReady(cp.count ?? 0);
    setListOpen(li.count ?? 0);
  }, [coupleId, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadExtras();
    }, [load, loadExtras]),
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

  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`us-extras:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deciders', filter: `couple_id=eq.${coupleId}` }, () => loadExtras())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons', filter: `couple_id=eq.${coupleId}` }, () => loadExtras())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fund_entries', filter: `couple_id=eq.${coupleId}` }, () => loadExtras())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, loadExtras]);

  if (!ctx || !coupleId || !userId) return null;
  const { partner } = ctx;
  const summary = challengeSummary(ticks, coupleId, userId);
  const lastWeekNeedsYou = summary.lastWeekOpen && summary.lastWeek.partner && !summary.lastWeek.mine;
  const fund = topFund(funds.funds, funds.entries, userId);

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
      {tonight && <TonightCard decider={tonight} userId={userId} partnerName={partner.name} />}
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
      <View style={{ gap: space.sm }}>
        <T variant="eyebrow">More for you two</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Tile emoji="🍿" title="Tonight" sub="Can't decide? Swipe till you match" onPress={() => router.push('/tonight')} />
          <Tile emoji="📝" title="Shared lists" sub="Groceries, to-dos and your watchlist" badge={listOpen ? `${listOpen} to do` : undefined} onPress={() => router.push('/lists')} />
          <Tile emoji="🎁" title="Wishlists" sub={`What you'd love, and what ${partner.name} would`} onPress={() => router.push('/wishlist')} />
          <Tile emoji="📖" title="Our story" sub="Your firsts and big moments" onPress={() => router.push('/our-story')} />
          <Tile emoji="🎟️" title="Love coupons" sub="Give a treat. They cash it in when they like" badge={couponsReady ? `${couponsReady} for you` : undefined} onPress={() => router.push('/coupons')} />
          <Tile emoji="✈️" title="Trip fund" sub="Save up together for a dream" onPress={() => router.push('/trip-fund')} />
          <Tile emoji="⏳" title="Time capsule" sub="A letter that stays sealed until the day you pick" onPress={() => router.push('/letters')} />
          <Tile emoji="📊" title="Monthly recap" sub="Your month together, in numbers" onPress={() => router.push('/recap')} />
        </View>
      </View>
      {fund && <FundCard fund={fund.fund} total={fund.total} />}
      <BucketCard items={bucket} />
    </ScrollView>
  );
}
