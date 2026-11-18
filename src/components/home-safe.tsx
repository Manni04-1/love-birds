import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Row, T } from '@/components/ui';
import { clockLabel } from '@/lib/dates';
import { friendlyError, supabase } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';
import type { HomeSafe } from '@/lib/types';

const clock = () => Date.now();
const WINDOW = 12 * 60 * 60 * 1000;

/** Where things stand: did someone ask, and has anyone said they're home? */
export function homeSafeStatus(rows: HomeSafe[], userId: string, now: number) {
  const recent = rows.filter((r) => now - new Date(r.created_at).getTime() < WINDOW).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const after = (row: HomeSafe | undefined, pred: (r: HomeSafe) => boolean) => (row ? recent.find((r) => pred(r) && r.created_at > row.created_at) : undefined);
  const theirAsk = recent.find((r) => r.kind === 'ask' && r.from_user !== userId);
  const myAsk = recent.find((r) => r.kind === 'ask' && r.from_user === userId);
  const mySafe = recent.find((r) => r.kind === 'safe' && r.from_user === userId);
  const theirSafe = recent.find((r) => r.kind === 'safe' && r.from_user !== userId);
  return {
    /** Your partner asked and you haven't answered yet. */
    askedYou: !!theirAsk && !after(theirAsk, (r) => r.kind === 'safe' && r.from_user === userId),
    theirAsk,
    myAsk,
    /** Your partner said they're home after you asked. */
    answered: myAsk ? after(myAsk, (r) => r.kind === 'safe' && r.from_user !== userId) : undefined,
    mySafe,
    theirSafe,
  };
}

/** "Let me know when you're home" and "I'm home safe", one tap each. */
export function HomeSafeCard({ coupleId, userId, partnerName }: { coupleId: string; userId: string; partnerName: string }) {
  const c = useColors();
  const [rows, setRows] = useState<HomeSafe[]>([]);
  const [busy, setBusy] = useState<'ask' | 'safe' | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('home_safe').select('id, from_user, kind, created_at').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(20);
    setRows((data ?? []) as HomeSafe[]);
  }, [coupleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const channel = supabase
      .channel(`home-safe:${coupleId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'home_safe', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  async function send(kind: 'ask' | 'safe') {
    setBusy(kind);
    setError('');
    const { error: err } = await supabase.rpc('send_home_safe', { p_kind: kind });
    setBusy(null);
    if (err) return setError(friendlyError(err));
    setNote(kind === 'ask' ? `Asked. ${partnerName} gets a notification.` : `Sent. ${partnerName} knows you're home 💕`);
    load();
  }

  const s = homeSafeStatus(rows, userId, clock());
  const status = s.answered
    ? `${partnerName} got home safe at ${clockLabel(s.answered.created_at)} 💕`
    : s.myAsk
      ? `You asked at ${clockLabel(s.myAsk.created_at)}. Waiting to hear from ${partnerName}…`
      : s.theirSafe
        ? `${partnerName} got home safe at ${clockLabel(s.theirSafe.created_at)} 💕`
        : s.mySafe
          ? `You told ${partnerName} you got home at ${clockLabel(s.mySafe.created_at)}.`
          : `Ask ${partnerName} to let you know they got home, or tell them you did.`;

  if (s.askedYou) {
    return (
      <Card tone="accent" style={{ gap: space.md }}>
        <Row gap={space.md}>
          <T style={{ fontSize: 34, lineHeight: 40 }}>🏠</T>
          <View style={{ flex: 1 }}>
            <T variant="strong" color={c.onAccent}>
              {partnerName} wants to know you got home safe
            </T>
            <T variant="small" color={c.onAccent}>
              Asked at {clockLabel(s.theirAsk!.created_at)}
            </T>
          </View>
        </Row>
        <Button title="I'm home safe 🏠" variant="dark" onPress={() => send('safe')} loading={busy === 'safe'} />
        {!!error && (
          <T variant="small" color={c.onAccent}>
            {error}
          </T>
        )}
      </Card>
    );
  }

  return (
    <Card style={{ gap: space.md }}>
      <Row gap={space.md}>
        <T style={{ fontSize: 28, lineHeight: 34 }}>🏠</T>
        <View style={{ flex: 1 }}>
          <T variant="strong">Home safe</T>
          <T variant="small" muted>
            {note || status}
          </T>
        </View>
      </Row>
      <Row gap={space.sm}>
        <Button
          title={s.myAsk && !s.answered ? 'Ask again' : 'Ask them'}
          variant="outline"
          style={{ flex: 1, minHeight: 44, paddingHorizontal: space.sm }}
          onPress={() => send('ask')}
          loading={busy === 'ask'}
        />
        <Button title="I'm home 🏠" style={{ flex: 1, minHeight: 44, paddingHorizontal: space.sm }} onPress={() => send('safe')} loading={busy === 'safe'} />
      </Row>
      {!!error && (
        <T variant="small" color={c.danger}>
          {error}
        </T>
      )}
    </Card>
  );
}
