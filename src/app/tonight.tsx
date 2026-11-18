import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FloatingHearts } from '@/components/floating-hearts';
import { BackHeader, Panel } from '@/components/game-ui';
import { SwipeDeck } from '@/components/swipe-deck';
import { Button, Card, Chip, Empty, ErrorText, Field, Glyph, Row, T } from '@/components/ui';
import { TONIGHT_KINDS, TONIGHT_OPTIONS, tonightKind, type TonightKind, type TonightOption } from '@/content/tonight';
import { dayNumber } from '@/lib/dates';
import { hashRank } from '@/lib/games';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import type { Decider } from '@/lib/types';

const clock = () => Date.now();

/** "just now", "5 minutes ago", "2 hours ago". */
function ago(iso: string) {
  const mins = Math.max(0, Math.round((clock() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  const h = Math.round(mins / 60);
  return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
}

/** Options for a new round: ten of the built-in ones (a different ten each day), plus what's on your watchlist. */
async function startingOptions(kind: TonightKind, coupleId: string): Promise<{ all: TonightOption[]; picked: Set<string> }> {
  const seed = `${coupleId}:${dayNumber()}`;
  const builtIn = [...TONIGHT_OPTIONS[kind]].sort((a, b) => hashRank(seed, a.key) - hashRank(seed, b.key));
  let fromList: TonightOption[] = [];
  if (kind === 'watch') {
    const { data } = await supabase.from('list_items').select('id, text').eq('couple_id', coupleId).eq('list', 'watch').is('done_at', null).order('created_at').limit(20);
    fromList = ((data ?? []) as { id: string; text: string }[]).map((i) => ({ key: `w-${i.id.replace(/-/g, '').slice(0, 12)}`, emoji: '🎬', label: i.text.slice(0, 60) }));
  }
  const all = [...fromList, ...builtIn];
  return { all, picked: new Set([...fromList.map((o) => o.key), ...builtIn.slice(0, Math.max(4, 10 - fromList.length)).map((o) => o.key)]) };
}

function OptionCard({ option, question }: { option: TonightOption; question: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md, backgroundColor: c.surface }}>
      <T variant="eyebrow">{question}</T>
      <T style={{ fontSize: 96, lineHeight: 112 }}>{option.emoji || '✨'}</T>
      <T variant="title" style={{ textAlign: 'center' }}>
        {option.label}
      </T>
    </View>
  );
}

/** Pick what to decide, and which options go in the deck. */
function Setup({ coupleId, partnerName, onStarted }: { coupleId: string; partnerName: string; onStarted: () => void }) {
  const c = useColors();
  const [kind, setKind] = useState<TonightKind | null>(null);
  const [options, setOptions] = useState<TonightOption[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(k: TonightKind) {
    setKind(k);
    setError('');
    const start = await startingOptions(k, coupleId);
    setOptions(start.all);
    setPicked(start.picked);
  }

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addOwn() {
    const label = own.trim().slice(0, 60);
    if (!label) return;
    const key = `own-${clock().toString(36)}`;
    setOptions((prev) => [{ key, emoji: '✨', label }, ...prev]);
    setPicked((prev) => new Set(prev).add(key));
    setOwn('');
  }

  async function start() {
    if (!kind) return;
    const chosen = options.filter((o) => picked.has(o.key));
    if (chosen.length < 2) return setError('Pick at least two options.');
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('start_decider', { p_kind: kind, p_options: chosen });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    onStarted();
  }

  if (!kind) {
    return (
      <View style={{ gap: space.md }}>
        <T variant="small" muted>
          Pick what you&apos;re deciding. You both swipe through the same options on your own phones, and the first one you both say yes to wins. {partnerName} never
          sees your noes.
        </T>
        {TONIGHT_KINDS.map((k) => (
          <Card key={k.kind} onPress={() => choose(k.kind)} accessibilityLabel={k.question}>
            <Row gap={space.md}>
              <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <T style={{ fontSize: 28, lineHeight: 34 }}>{k.emoji}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="strong" style={{ fontSize: 18 }}>
                  {k.title}
                </T>
                <T variant="small" muted>
                  {k.question}
                </T>
              </View>
              <Glyph name="next" color={c.muted} />
            </Row>
          </Card>
        ))}
      </View>
    );
  }

  const info = tonightKind(kind);
  return (
    <View style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="heading" style={{ flex: 1 }}>
          {info.emoji} {info.question}
        </T>
      </Row>
      <T variant="small" muted>
        Tap to take options out or put them back. {kind === 'watch' ? 'Things on your watchlist are in too. ' : ''}
        {picked.size} in the deck.
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map((o) => (
          <Chip key={o.key} label={`${o.emoji} ${o.label}`} selected={picked.has(o.key)} onPress={() => toggle(o.key)} />
        ))}
      </View>
      <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field label="Add your own" value={own} onChangeText={setOwn} placeholder={kind === 'eat' ? 'That place in Westlands' : 'Something only we do'} maxLength={60} returnKeyType="done" onSubmitEditing={addOwn} />
        </View>
        <Button title="Add" variant="outline" onPress={addOwn} disabled={!own.trim()} />
      </Row>
      <ErrorText>{error}</ErrorText>
      <Button title={`Start swiping · ${picked.size}`} onPress={start} loading={busy} disabled={picked.size < 2} />
      <Button title="Decide something else" variant="ghost" onPress={() => setKind(null)} />
    </View>
  );
}

/** Tonight: you both swipe, and the first option you both like wins. */
export default function Tonight() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const [decider, setDecider] = useState<Decider | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState('');
  const [burst, setBurst] = useState(0);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('get_tonight');
    if (err) setError(friendlyError(err));
    setDecider((data as Decider | null) ?? null);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Your partner's match, or their finishing the deck, shows up straight away.
  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`tonight:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deciders', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  // Hearts when a winner arrives, whoever made the match.
  const winner = decider?.winner ?? null;
  const [celebrated, setCelebrated] = useState<string | null>(null);
  if (winner && decider && celebrated !== decider.id) {
    setCelebrated(decider.id);
    setBurst((b) => b + 1);
  }

  const deck = useMemo(() => {
    if (!decider || !userId) return [];
    const seed = `${decider.id}:${userId}`;
    return decider.options
      .filter((o) => !(o.key in decider.mine))
      .sort((a, b) => hashRank(seed, a.key) - hashRank(seed, b.key))
      .map((o) => ({ ...o, id: o.key }));
  }, [decider, userId]);

  if (!ctx || !coupleId || !userId) return null;
  const { partner } = ctx;
  const info = decider ? tonightKind(decider.kind) : null;
  const won = decider?.winner ? decider.options.find((o) => o.key === decider.winner) : undefined;
  const partnerDone = !!decider?.done_by.includes(partner.id);

  async function swipe(item: TonightOption, liked: boolean) {
    if (!decider) return;
    setError('');
    const id = decider.id;
    setDecider((d) => (d && d.id === id ? { ...d, mine: { ...d.mine, [item.key]: liked } } : d));
    const { data, error: err } = await supabase.rpc('vote_decider', { p_decider: id, p_option: item.key, p_liked: liked });
    if (err) {
      setError(friendlyError(err));
      return load();
    }
    if (data) setDecider((d) => (d && d.id === id ? { ...d, winner: data as string, decided_at: new Date().toISOString() } : d));
    else if (deck.length <= 1) load();
  }

  const showSetup = fresh || !decider;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <BackHeader title="Tonight" home="/together" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {!loaded ? null : showSetup ? (
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.lg }} keyboardShouldPersistTaps="handled">
            <ErrorText>{error}</ErrorText>
            <Setup
              coupleId={coupleId}
              partnerName={partner.name}
              onStarted={() => {
                setFresh(false);
                load();
              }}
            />
            {fresh && decider && <Button title="Back to the current one" variant="ghost" onPress={() => setFresh(false)} />}
          </ScrollView>
        ) : won ? (
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.lg, flexGrow: 1, justifyContent: 'center' }}>
            <Panel tone="soft" style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xxl }}>
              <T variant="eyebrow">It&apos;s a match</T>
              <T style={{ fontSize: 96, lineHeight: 112 }}>{won.emoji || '✨'}</T>
              <T variant="title" style={{ textAlign: 'center' }}>
                {won.label}
              </T>
              <T variant="small" muted style={{ textAlign: 'center' }}>
                You both said yes. That&apos;s tonight sorted 🎉
              </T>
            </Panel>
            <Button title="Decide something else" variant="outline" onPress={() => setFresh(true)} />
          </ScrollView>
        ) : deck.length ? (
          <View style={{ flex: 1, padding: space.lg, paddingTop: space.sm, gap: space.md }}>
            <T variant="small" muted>
              {decider!.created_by === userId ? `You started this ${ago(decider!.created_at)}.` : `${partner.name} started this ${ago(decider!.created_at)}.`} Swipe right for
              yes. The first one you both like wins.
            </T>
            <ErrorText>{error}</ErrorText>
            <SwipeDeck items={deck} onSwipe={swipe} renderCard={(o) => <OptionCard option={o} question={info!.question} />} />
            <T variant="fine" style={{ textAlign: 'center' }}>
              {deck.length} to go{partnerDone ? ` · ${partner.name} has swiped through them all` : ''}
            </T>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.lg }}>
            <ErrorText>{error}</ErrorText>
            {partnerDone ? (
              <>
                <Empty>No match this time. You liked different things. Try again with a few new options?</Empty>
                <Button title="Try again" onPress={() => setFresh(true)} />
              </>
            ) : (
              <>
                <Panel tone="soft" style={{ alignItems: 'center' }}>
                  <T style={{ fontSize: 44, lineHeight: 52 }}>⏳</T>
                  <T variant="heading" style={{ textAlign: 'center' }}>
                    Waiting for {partner.name}
                  </T>
                  <T variant="small" style={{ textAlign: 'center' }}>
                    You&apos;ve swiped through everything. As soon as {partner.name} likes one you liked, you&apos;ll both see it here.
                  </T>
                </Panel>
                <Button title="Start over with something else" variant="ghost" onPress={() => setFresh(true)} />
              </>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      <FloatingHearts burst={burst} />
    </SafeAreaView>
  );
}
