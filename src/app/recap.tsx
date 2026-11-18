import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FloatingHearts } from '@/components/floating-hearts';
import { BackHeader } from '@/components/game-ui';
import { Photo } from '@/components/photo';
import { Card, ErrorText, Glyph, IconButton, Row, T } from '@/components/ui';
import { dayLabel, parseISODate } from '@/lib/dates';
import { ksh } from '@/lib/funds';
import { defaultRecapMonth, loadRecap, monthKey, parseMonth, shiftMonth, thisMonth, type ChatStats, type Recap } from '@/lib/recap';
import { useCouple } from '@/lib/session';
import { radius, space, useColors } from '@/lib/theme';

const clock = () => new Date();
const n = (v: number | null | undefined) => Number(v) || 0;
const num = (v: number) => v.toLocaleString('en-GB');

type Tile = { emoji: string; value: number; label: string; sub?: string; money?: boolean };

function tiles(r: Recap, partnerName: string): Tile[] {
  const all: Tile[] = [
    { emoji: '📅', value: n(r.chat_days), label: 'days you both chatted' },
    { emoji: '❤️', value: n(r.hearts), label: 'messages hearted' },
    { emoji: '📸', value: n(r.chat_photos), label: 'photos in chat' },
    { emoji: '🦜', value: n(r.stickers), label: 'stickers sent' },
    { emoji: '👉', value: n(r.nudges_me) + n(r.nudges_partner), label: 'nudges', sub: `You ${n(r.nudges_me)} · ${partnerName} ${n(r.nudges_partner)}` },
    { emoji: '💬', value: n(r.answers_both), label: 'days you both answered the question' },
    { emoji: '🌹', value: n(r.checkins_both), label: 'evenings you both checked in' },
    { emoji: '🌅', value: n(r.daily_photos), label: 'photos of the day' },
    { emoji: '🖼️', value: n(r.memories), label: 'memories saved' },
    { emoji: '🥂', value: n(r.dates), label: 'dates you went on' },
    { emoji: '✨', value: n(r.bucket), label: 'bucket list dreams come true' },
    { emoji: '🏅', value: n(r.challenges), label: 'weekly challenges done together' },
    { emoji: '💌', value: n(r.letters), label: 'letters written' },
    { emoji: '🎮', value: n(r.live) + n(r.games), label: 'game rounds played' },
    { emoji: '🍿', value: n(r.tonight), label: 'evenings decided together' },
    { emoji: '🎟️', value: n(r.coupons), label: 'love coupons made happen' },
    { emoji: '📖', value: n(r.story), label: 'moments added to your story' },
    { emoji: '💰', value: n(r.saved), label: 'saved for your dreams', money: true },
    { emoji: '🏠', value: n(r.home_safe), label: 'times you said you got home safe' },
  ];
  return all.filter((t) => t.value > 0);
}

function StatTile({ tile }: { tile: Tile }) {
  const c = useColors();
  return (
    <View
      style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: 2 }}
      accessible
      accessibilityLabel={`${tile.money ? ksh(tile.value) : num(tile.value)} ${tile.label}`}>
      <T style={{ fontSize: 24, lineHeight: 30 }}>{tile.emoji}</T>
      <T variant="title" style={{ fontSize: tile.money ? 22 : 28, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
        {tile.money ? ksh(tile.value) : num(tile.value)}
      </T>
      <T variant="small" muted>
        {tile.label}
      </T>
      {!!tile.sub && <T variant="fine">{tile.sub}</T>}
    </View>
  );
}

function Moods({ who, moods }: { who: string; moods: { emoji: string; n: number }[] }) {
  if (!moods.length) return null;
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <T variant="small" style={{ fontWeight: '700' }}>
        {who}
      </T>
      <Row gap={space.md}>
        {moods.map((m) => (
          <T key={m.emoji} variant="small">
            <T style={{ fontSize: 20, lineHeight: 26 }}>{m.emoji}</T> ×{m.n}
          </T>
        ))}
      </Row>
    </Row>
  );
}

function ChatWords({ chat, partnerName }: { chat: ChatStats; partnerName: string }) {
  const c = useColors();
  if (!chat.top.length && !chat.words) return null;
  return (
    <Card style={{ gap: space.sm }}>
      <T variant="eyebrow">In your words</T>
      {chat.words > 0 && (
        <T variant="strong" style={{ fontSize: 18 }}>
          {num(chat.words)} {chat.words === 1 ? 'word' : 'words'} to each other
        </T>
      )}
      {chat.top.length > 0 && (
        <>
          <T variant="small" muted>
            Your emoji of the month
          </T>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {chat.top.map((e, i) => (
              <View
                key={e.emoji}
                style={{ alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, backgroundColor: i === 0 ? c.accentSoft : c.surface2, minWidth: 54 }}
                accessible
                accessibilityLabel={`${e.emoji}, ${e.n} times`}>
                <T style={{ fontSize: i === 0 ? 30 : 24, lineHeight: i === 0 ? 38 : 30 }}>{e.emoji}</T>
                <T variant="fine">×{num(e.n)}</T>
              </View>
            ))}
          </Row>
        </>
      )}
      {(chat.mine || chat.theirs) && (
        <View style={{ gap: 2 }}>
          {chat.mine && (
            <T variant="small">
              Your favourite: {chat.mine.emoji} ({num(chat.mine.n)} {chat.mine.n === 1 ? 'time' : 'times'})
            </T>
          )}
          {chat.theirs && (
            <T variant="small">
              {partnerName}&apos;s favourite: {chat.theirs.emoji} ({num(chat.theirs.n)} {chat.theirs.n === 1 ? 'time' : 'times'})
            </T>
          )}
        </View>
      )}
    </Card>
  );
}

/** Your month together: what you two got up to, in numbers. */
export default function MonthlyRecap() {
  const c = useColors();
  const ctx = useCouple();
  const params = useLocalSearchParams<{ month?: string }>();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const [month, setMonth] = useState(() => parseMonth(params.month) ?? defaultRecapMonth());
  const [param, setParam] = useState(params.month);
  const [result, setResult] = useState<{ key: string; recap: Recap | null; chat: ChatStats; current: boolean; error: string } | null>(null);
  const [burst, setBurst] = useState(0);

  // Opened again from a notification while already here.
  if (params.month !== param) {
    setParam(params.month);
    const m = parseMonth(params.month);
    if (m) setMonth(m);
  }

  useEffect(() => {
    if (!coupleId || !userId) return;
    let live = true;
    loadRecap(coupleId, userId, month, clock()).then((r) => {
      if (!live) return;
      setResult({ key: monthKey(month), ...r });
      if (r.recap && n(r.recap.messages_me) + n(r.recap.messages_partner) > 0) setBurst((b) => b + 1);
    });
    return () => {
      live = false;
    };
  }, [coupleId, userId, month]);

  if (!ctx || !coupleId || !userId) return null;
  const { couple, partner } = ctx;
  const key = monthKey(month);
  const loading = !result || result.key !== key;
  const latest = thisMonth();
  const isLatest = key >= monthKey(latest);
  const together = couple.together_since ? parseISODate(couple.together_since) : null;
  const earliest = together ? thisMonth(together) : shiftMonth(latest, -12);
  const isEarliest = key <= monthKey(earliest);
  const name = month.toLocaleDateString('en-GB', { month: 'long' });
  const year = month.getFullYear() !== latest.getFullYear() ? ` ${month.getFullYear()}` : '';
  const r = !loading ? result.recap : null;
  const chat = !loading ? result.chat : null;
  const current = !loading && result.current;
  const total = r ? n(r.messages_me) + n(r.messages_partner) : 0;
  const list = r ? tiles(r, partner.name) : [];
  const quiet = !!r && !total && !list.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <BackHeader title="Monthly recap" home="/together" />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.md, paddingBottom: space.xxl }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ opacity: isEarliest ? 0.3 : 1 }} pointerEvents={isEarliest ? 'none' : 'auto'}>
            <IconButton label="The month before" onPress={() => setMonth(shiftMonth(month, -1))}>
              <Glyph name="prev" color={c.ink} />
            </IconButton>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <T variant="eyebrow">{current ? 'So far this month' : 'Your month together'}</T>
            <T variant="title" style={{ textAlign: 'center' }}>
              {name}
              {year}
            </T>
          </View>
          <View style={{ opacity: isLatest ? 0.3 : 1 }} pointerEvents={isLatest ? 'none' : 'auto'}>
            <IconButton label="The month after" onPress={() => setMonth(shiftMonth(month, 1))}>
              <Glyph name="next" color={c.ink} />
            </IconButton>
          </View>
        </Row>

        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: space.xxl }} />
        ) : result.error ? (
          <ErrorText>{result.error}</ErrorText>
        ) : !r ? null : quiet ? (
          <Card tone="soft" style={{ alignItems: 'center', gap: space.sm }}>
            <T style={{ fontSize: 44, lineHeight: 52 }}>🌙</T>
            <T variant="heading" style={{ textAlign: 'center' }}>
              A quiet month
            </T>
            <T variant="small" style={{ textAlign: 'center' }}>
              Nothing to count for {name} yet. {current ? 'There’s still time to make some memories.' : 'Try another month.'}
            </T>
          </Card>
        ) : (
          <>
            <Card tone="accent" style={{ gap: 4 }}>
              <T variant="eyebrow" color={c.onAccent}>
                💬 In chat
              </T>
              <T variant="display" color={c.onAccent} style={{ fontVariant: ['tabular-nums'] }}>
                {num(total)}
              </T>
              <T variant="strong" color={c.onAccent}>
                {total === 1 ? 'message' : 'messages'} between you
              </T>
              <T variant="small" color={c.onAccent}>
                You {num(n(r.messages_me))} · {partner.name} {num(n(r.messages_partner))}
              </T>
              {!!r.busiest_day && n(r.busiest_count) > 1 && (
                <T variant="small" color={c.onAccent} style={{ marginTop: 4 }}>
                  Your chattiest day was {dayLabel(r.busiest_day)}, with {num(n(r.busiest_count))} messages.
                </T>
              )}
            </Card>

            {chat && chat.loveYou > 0 && (
              <Card tone="soft" style={{ alignItems: 'center', gap: 2 }}>
                <T style={{ fontSize: 34, lineHeight: 42 }}>💞</T>
                <T variant="heading" style={{ textAlign: 'center' }}>
                  “I love you” {num(chat.loveYou)} {chat.loveYou === 1 ? 'time' : 'times'}
                </T>
                <T variant="small" muted style={{ textAlign: 'center' }}>
                  Counting every love you, love u and nakupenda in chat.
                </T>
              </Card>
            )}

            {!!r.memory_photo && (
              <Card style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
                <Photo path={r.memory_photo} style={{ width: '100%', height: 220 }} label={r.memory_caption ?? 'Memory of the month'} />
                <View style={{ padding: space.lg, gap: 2 }}>
                  <T variant="eyebrow">Memory of the month</T>
                  {!!r.memory_caption && <T variant="strong">{r.memory_caption}</T>}
                </View>
              </Card>
            )}

            {list.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {list.map((t) => (
                  <StatTile key={t.label} tile={t} />
                ))}
              </View>
            )}

            {chat && <ChatWords chat={chat} partnerName={partner.name} />}

            {(r.moods_me?.length > 0 || r.moods_partner?.length > 0) && (
              <Card style={{ gap: space.sm }}>
                <T variant="eyebrow">Moods you shared most</T>
                <Moods who="You" moods={r.moods_me ?? []} />
                <Moods who={partner.name} moods={r.moods_partner ?? []} />
              </Card>
            )}

            <T variant="small" muted style={{ textAlign: 'center', marginTop: space.sm }}>
              {current ? `${name} isn't over yet. Plenty of time for more 💕` : `That was your ${name}. Here's to the next one 🥂`}
            </T>
          </>
        )}
      </ScrollView>
      <FloatingHearts burst={burst} />
    </SafeAreaView>
  );
}
