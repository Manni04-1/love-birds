import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FloatingHearts } from '@/components/floating-hearts';
import { BackHeader, Option, Panel, Pill } from '@/components/game-ui';
import { Avatar, Button, Row, T } from '@/components/ui';
import { initialLive, isHost, liveReducer, pickQuestion, questionByKey, revealed, type Choice } from '@/lib/live';
import { useCouple } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';

type Invite = 'idle' | 'sending' | 'sent' | 'recent' | 'error';

/** Your rounds so far, newest first. */
async function fetchRounds(coupleId: string) {
  const { data } = await supabase.from('live_rounds').select('question_key, matched').eq('couple_id', coupleId).order('played_at', { ascending: false }).limit(1000);
  return (data ?? []) as { question_key: string; matched: boolean }[];
}

function Player({ name, partner, here }: { name: string; partner?: boolean; here: boolean }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 4, flex: 1 }}>
      <View>
        <Avatar name={name} partner={partner} size={64} />
        <View style={{ position: 'absolute', right: 2, bottom: 2, width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: c.page, backgroundColor: here ? '#2BB673' : c.muted }} />
      </View>
      <T variant="strong" numberOfLines={1}>
        {name}
      </T>
      <T variant="fine">{here ? 'Here' : partner ? 'Not here yet' : 'Connecting…'}</T>
    </View>
  );
}

export default function Live() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const partnerId = ctx?.partner.id;
  const host = !!userId && !!partnerId && isHost(userId, partnerId);
  const [state, dispatch] = useReducer(liveReducer, initialLive);
  const [partnerHere, setPartnerHere] = useState(false);
  const [connected, setConnected] = useState(false);
  const [invite, setInvite] = useState<Invite>('idle');
  const [allTime, setAllTime] = useState<{ played: number; matched: number } | null>(null);
  const [burst, setBurst] = useState(0);
  const channel = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef(state);
  const round = useRef<{ id: string; key: string } | null>(null);
  const recent = useRef<string[]>([]);
  const saved = useRef(new Set<string>());
  const celebrated = useRef(new Set<string>());

  useEffect(() => {
    stateRef.current = state;
  });

  const send = useCallback(
    (event: 'hello' | 'round' | 'pick' | 'next', payload: Record<string, unknown> = {}) => {
      channel.current?.send({ type: 'broadcast', event, payload: { ...payload, from: userId } });
    },
    [userId],
  );

  const loadHistory = useCallback(() => {
    if (!coupleId) return;
    fetchRounds(coupleId).then((rows) => {
      setAllTime({ played: rows.length, matched: rows.filter((r) => r.matched).length });
      const keys = rows.slice(0, 40).map((r) => r.question_key);
      recent.current = [...recent.current, ...keys.filter((k) => !recent.current.includes(k))];
    });
  }, [coupleId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /** Host only: ask the next question. */
  const startRound = useCallback(() => {
    const q = pickQuestion(recent.current, Math.random());
    recent.current = [q.key, ...recent.current.filter((k) => k !== q.key)];
    const id = `${Date.now().toString(36)}-${q.key}`;
    round.current = { id, key: q.key };
    dispatch({ type: 'round', id, key: q.key });
    send('round', { id, key: q.key });
  }, [send]);

  // The latest handlers, for the channel listeners set up once below.
  const handlers = useRef({ startRound, send, host });
  useEffect(() => {
    handlers.current = { startRound, send, host };
  });

  useEffect(() => {
    if (!coupleId || !userId) return;
    const ch = supabase.channel(`live:${coupleId}`, { config: { presence: { key: userId }, broadcast: { self: false } } });
    channel.current = ch;
    ch.on('presence', { event: 'sync' }, () => {
      setPartnerHere(Object.keys(ch.presenceState()).some((k) => k !== userId));
    })
      .on('broadcast', { event: 'hello' }, ({ payload }) => {
        if (payload?.from === userId) return;
        // Your partner just arrived: bring them up to date.
        const h = handlers.current;
        const s = stateRef.current;
        if (h.host && round.current) h.send('round', round.current);
        if (s.id && s.mine !== null) h.send('pick', { id: s.id, choice: s.mine });
      })
      .on('broadcast', { event: 'round' }, ({ payload }) => {
        if (payload?.from === userId || typeof payload?.id !== 'string' || !questionByKey(payload.key)) return;
        round.current = { id: payload.id, key: payload.key };
        dispatch({ type: 'round', id: payload.id, key: payload.key });
      })
      .on('broadcast', { event: 'pick' }, ({ payload }) => {
        if (payload?.from === userId || (payload?.choice !== 0 && payload?.choice !== 1)) return;
        dispatch({ type: 'pick', who: 'them', id: String(payload.id), choice: payload.choice });
      })
      .on('broadcast', { event: 'next' }, ({ payload }) => {
        if (payload?.from === userId) return;
        if (handlers.current.host && revealed(stateRef.current)) handlers.current.startRound();
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        setConnected(true);
        if (AppState.currentState === 'active') ch.track({ at: Date.now() });
        ch.send({ type: 'broadcast', event: 'hello', payload: { from: userId } });
      });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        ch.track({ at: Date.now() });
        ch.send({ type: 'broadcast', event: 'hello', payload: { from: userId } });
      } else ch.untrack();
    });
    return () => {
      sub.remove();
      channel.current = null;
      supabase.removeChannel(ch);
    };
  }, [coupleId, userId]);

  // The host asks the first question as soon as you're both here.
  useEffect(() => {
    if (host && connected && partnerHere && !round.current) startRound();
  }, [host, connected, partnerHere, startRound]);

  // Once you've both picked: hearts if you matched, and the host saves the round.
  const done = revealed(state);
  useEffect(() => {
    if (!done || !state.id || !state.key) return;
    const same = state.mine === state.theirs;
    if (same && !celebrated.current.has(state.id)) {
      celebrated.current.add(state.id);
      setBurst((b) => b + 1);
    }
    if (host && coupleId && !saved.current.has(state.id)) {
      saved.current.add(state.id);
      supabase
        .from('live_rounds')
        .insert({ couple_id: coupleId, question_key: state.key, matched: same })
        .then(() => loadHistory());
    } else if (!host) {
      // Give the host a moment to save it first.
      setTimeout(loadHistory, 1500);
    }
  }, [done, state.id, state.key, state.mine, state.theirs, host, coupleId, loadHistory]);

  if (!ctx) return null;
  const { profile, partner } = ctx;
  const q = questionByKey(state.key);

  function pick(choice: Choice) {
    const s = stateRef.current;
    if (!s.id || s.mine !== null) return;
    dispatch({ type: 'pick', who: 'me', id: s.id, choice });
    send('pick', { id: s.id, choice });
  }

  function next() {
    if (host) startRound();
    else send('next');
  }

  async function sendInvite() {
    setInvite('sending');
    const { data, error } = await supabase.rpc('invite_to_live');
    setInvite(error ? 'error' : data ? 'sent' : 'recent');
  }

  const inviteNote: Record<Invite, string> = {
    idle: '',
    sending: '',
    sent: `Invite sent. ${partner.name} gets a notification.`,
    recent: `You invited ${partner.name} a moment ago. Give them a minute.`,
    error: 'That invite didn’t go through. Check your connection and try again.',
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <BackHeader title="Play live" />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.lg }}>
        <Row>
          <Player name={profile.name} here={connected} />
          <T style={{ fontSize: 26, lineHeight: 32 }}>{done && state.mine === state.theirs ? '💞' : '🎮'}</T>
          <Player name={partner.name} partner here={partnerHere} />
        </Row>

        {!partnerHere ? (
          <Panel tone="soft">
            <T variant="heading">Waiting for {partner.name}</T>
            <T variant="small">
              You both get the same this-or-that question at the same moment. Pick fast, then see if you picked alike. It starts as soon as {partner.name} opens
              this screen.
            </T>
            <Button title={invite === 'sent' ? 'Invite sent' : `Invite ${partner.name}`} onPress={sendInvite} loading={invite === 'sending'} disabled={invite === 'sent'} />
            {!!inviteNote[invite] && <T variant="small">{inviteNote[invite]}</T>}
          </Panel>
        ) : !q ? (
          <Panel>
            <Row>
              <ActivityIndicator color={c.accent} />
              <T variant="small" muted>
                Getting the first question…
              </T>
            </Row>
          </Panel>
        ) : (
          <Panel>
            <T variant="eyebrow">Round {state.played + (done ? 0 : 1)} · This or that?</T>
            {[q.a, q.b].map((label, i) => {
              const mine = state.mine === i;
              const theirs = done && state.theirs === i;
              return (
                <Option
                  key={i}
                  label={label}
                  selected={mine}
                  disabled={state.mine !== null}
                  onPress={() => pick(i as Choice)}
                  trailing={
                    <Row gap={4}>
                      {mine && <Pill accent>You</Pill>}
                      {theirs && <Pill>{partner.name}</Pill>}
                    </Row>
                  }
                />
              );
            })}
            {!done ? (
              <T variant="small" muted>
                {state.mine === null
                  ? state.theirs !== null
                    ? `${partner.name} has picked. Your turn!`
                    : 'Go with your gut.'
                  : `Waiting for ${partner.name}…`}
              </T>
            ) : (
              <>
                <T variant="heading" style={{ textAlign: 'center' }}>
                  {state.mine === state.theirs ? 'Same! 💞' : 'Different picks 😄'}
                </T>
                <Button title="Next question" onPress={next} />
              </>
            )}
          </Panel>
        )}

        {(state.played > 0 || (allTime && allTime.played > 0)) && (
          <View style={{ gap: 4, alignItems: 'center' }}>
            {state.played > 0 && (
              <T variant="strong">
                This game: {state.matched} of {state.played} alike
              </T>
            )}
            {!!allTime?.played && (
              <T variant="small" muted>
                All time: {allTime.matched} of {allTime.played} alike ({Math.round((allTime.matched / allTime.played) * 100)}%)
              </T>
            )}
          </View>
        )}
      </ScrollView>
      <FloatingHearts burst={burst} />
    </SafeAreaView>
  );
}
