import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { FloatingHearts } from '@/components/floating-hearts';
import { BackHeader } from '@/components/game-ui';
import { Button, Card, Empty, ErrorText, Field, Row, T } from '@/components/ui';
import { COUPON_IDEAS } from '@/content/coupons';
import { dayLabel, toISODate } from '@/lib/dates';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import type { Coupon } from '@/lib/types';

type Tab = 'wallet' | 'give';

const when = (iso: string) => {
  const d = dayLabel(toISODate(new Date(iso)));
  return /^(Today|Tomorrow|Yesterday)$/.test(d) ? d.toLowerCase() : d;
};

/** A coupon that looks like a ticket: a stub with the emoji, a perforated line, and the details. */
function Ticket({ coupon, children, faded }: { coupon: Pick<Coupon, 'emoji' | 'title' | 'note'>; children?: ReactNode; faded?: boolean }) {
  const c = useColors();
  const notch = { position: 'absolute' as const, left: 72 - 9, width: 18, height: 18, borderRadius: 9, backgroundColor: c.page };
  return (
    <View style={{ flexDirection: 'row', borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, overflow: 'hidden', opacity: faded ? 0.65 : 1 }}>
      <View style={{ width: 72, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingVertical: space.lg }}>
        <T style={{ fontSize: 32, lineHeight: 38 }}>{coupon.emoji || '🎟️'}</T>
      </View>
      <View style={{ width: 2, justifyContent: 'space-evenly', paddingVertical: space.md }}>
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={{ width: 2, height: 5, borderRadius: 1, backgroundColor: c.line }} />
        ))}
      </View>
      <View style={{ flex: 1, padding: space.md, gap: 4 }}>
        <T variant="eyebrow">Love coupon</T>
        <T variant="strong" style={{ fontSize: 17 }}>
          {coupon.title}
        </T>
        {!!coupon.note && (
          <T variant="small" muted>
            {coupon.note}
          </T>
        )}
        {children}
      </View>
      <View style={[notch, { top: -9 }]} />
      <View style={[notch, { bottom: -9 }]} />
    </View>
  );
}

/** Love coupons: give your partner something they can cash in when they like, and make it happen. */
export default function Coupons() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const [tab, setTab] = useState<Tab>('wallet');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pick, setPick] = useState<{ emoji: string; title: string } | null>(null);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [given, setGiven] = useState('');
  const [burst, setBurst] = useState(0);

  const load = useCallback(async () => {
    if (!coupleId) return;
    const { data, error: err } = await supabase.from('coupons').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false });
    if (err) setError(friendlyError(err));
    setCoupons((data ?? []) as Coupon[]);
    setLoaded(true);
  }, [coupleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`coupons:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  if (!ctx || !coupleId || !userId) return null;
  const { partner } = ctx;
  const forMe = coupons.filter((x) => x.from_user !== userId);
  const fromMe = coupons.filter((x) => x.from_user === userId);
  const ready = forMe.filter((x) => !x.redeemed_at);
  const waiting = forMe.filter((x) => x.redeemed_at && !x.done_at);
  const enjoyed = forMe.filter((x) => x.done_at);
  const toDo = fromMe.filter((x) => x.redeemed_at && !x.done_at);
  const unused = fromMe.filter((x) => !x.redeemed_at);
  const madeHappen = fromMe.filter((x) => x.done_at);

  async function rpc(name: 'redeem_coupon' | 'complete_coupon', coupon: Coupon) {
    setBusy(coupon.id);
    setError('');
    const { error: err } = await supabase.rpc(name, { p_id: coupon.id });
    setBusy(null);
    if (err) return setError(friendlyError(err));
    setBurst((b) => b + 1);
    load();
  }

  async function give() {
    const title = (pick?.title ?? custom).trim();
    if (!title) return setError('Pick a coupon or write your own.');
    setBusy('give');
    setError('');
    const { error: err } = await supabase.from('coupons').insert({ couple_id: coupleId, title: title.slice(0, 80), emoji: pick?.emoji ?? '🎟️', note: note.trim().slice(0, 300) || null });
    setBusy(null);
    if (err) return setError(friendlyError(err));
    setGiven(title);
    setPick(null);
    setCustom('');
    setNote('');
    setBurst((b) => b + 1);
    load();
  }

  function takeBack(coupon: Coupon) {
    Alert.alert('Take this coupon back?', `${partner.name} hasn't used it yet. It disappears from their wallet.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Take it back',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('coupons').delete().eq('id', coupon.id);
          if (err) setError(friendlyError(err));
          load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <BackHeader title="Love coupons" home="/together" />
      <Row gap={0} style={{ marginHorizontal: space.lg, backgroundColor: c.surface2, borderRadius: radius.pill, padding: 3 }}>
        {(
          [
            { key: 'wallet', label: `🎟️ For you${ready.length ? ` · ${ready.length}` : ''}` },
            { key: 'give', label: `💝 From you${toDo.length ? ` · ${toDo.length} to do` : ''}` },
          ] as { key: Tab; label: string }[]
        ).map((t) => {
          const on = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill, backgroundColor: on ? c.surface : 'transparent' }}>
              <T variant="small" style={{ fontWeight: '700' }} color={on ? c.accent : c.muted} numberOfLines={1}>
                {t.label}
              </T>
            </Pressable>
          );
        })}
      </Row>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
          <ErrorText>{error}</ErrorText>
          {tab === 'wallet' ? (
            <>
              {loaded && !forMe.length && <Empty>No coupons from {partner.name} yet. Give them one first, it might be contagious 😉</Empty>}
              {ready.map((x) => (
                <Ticket key={x.id} coupon={x}>
                  <T variant="fine">From {partner.name} · {when(x.created_at)}</T>
                  <Button title="Redeem it" onPress={() => rpc('redeem_coupon', x)} loading={busy === x.id} style={{ minHeight: 42, marginTop: 4 }} />
                </Ticket>
              ))}
              {waiting.map((x) => (
                <Ticket key={x.id} coupon={x}>
                  <T variant="small" accent style={{ fontWeight: '700' }}>
                    Redeemed {when(x.redeemed_at!)}. {partner.name} owes you this one ⏳
                  </T>
                </Ticket>
              ))}
              {enjoyed.length > 0 && (
                <>
                  <T variant="eyebrow" style={{ marginTop: space.sm }}>
                    Enjoyed · {enjoyed.length} 💝
                  </T>
                  {enjoyed.map((x) => (
                    <Ticket key={x.id} coupon={x} faded>
                      <T variant="fine">Made happen {when(x.done_at!)}</T>
                    </Ticket>
                  ))}
                </>
              )}
              {ready.length > 0 && <T variant="fine">Redeem one whenever you like. {partner.name} gets a notification to make it happen.</T>}
            </>
          ) : (
            <>
              {toDo.map((x) => (
                <Ticket key={x.id} coupon={x}>
                  <T variant="small" accent style={{ fontWeight: '700' }}>
                    {partner.name} redeemed this {when(x.redeemed_at!)}. Time to make it happen!
                  </T>
                  <Button title="Done ✓" onPress={() => rpc('complete_coupon', x)} loading={busy === x.id} style={{ minHeight: 42, marginTop: 4 }} />
                </Ticket>
              ))}

              <Card style={{ gap: space.md }}>
                <T variant="heading">Give {partner.name} a coupon</T>
                {!!given && <T variant="small" accent style={{ fontWeight: '700' }}>Sent “{given}” 🎟️ It&apos;s in {partner.name}&apos;s wallet now.</T>}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {COUPON_IDEAS.map((i) => {
                    const on = pick?.title === i.title;
                    return (
                      <Pressable
                        key={i.title}
                        onPress={() => {
                          setGiven('');
                          setPick(on ? null : i);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: radius.pill,
                          borderWidth: 1.5,
                          borderColor: on ? c.accent : c.line,
                          backgroundColor: on ? c.accentSoft : c.surface,
                        }}>
                        <T variant="small" style={{ fontWeight: '700' }}>
                          {i.emoji} {i.title}
                        </T>
                      </Pressable>
                    );
                  })}
                </View>
                {!pick && (
                  <Field
                    label="Or write your own"
                    value={custom}
                    onChangeText={(t) => {
                      setGiven('');
                      setCustom(t);
                    }}
                    placeholder="One foot rub, redeemable any time"
                    maxLength={80}
                  />
                )}
                <Field label="A note (optional)" value={note} onChangeText={setNote} placeholder="Valid forever. No questions asked." maxLength={300} />
                {(pick || custom.trim()) && <Ticket coupon={{ emoji: pick?.emoji ?? '🎟️', title: (pick?.title ?? custom).trim(), note: note.trim() || null }} />}
                <Button title={`Give it to ${partner.name} 🎟️`} onPress={give} loading={busy === 'give'} disabled={!pick && !custom.trim()} />
              </Card>

              {unused.length > 0 && (
                <>
                  <T variant="eyebrow" style={{ marginTop: space.sm }}>
                    Not used yet · {unused.length}
                  </T>
                  {unused.map((x) => (
                    <Pressable key={x.id} onLongPress={() => takeBack(x)} accessibilityHint="Hold to take it back">
                      <Ticket coupon={x}>
                        <T variant="fine">Given {when(x.created_at)}. Waiting for {partner.name} to redeem it.</T>
                      </Ticket>
                    </Pressable>
                  ))}
                  <T variant="fine">Hold a coupon to take it back.</T>
                </>
              )}
              {madeHappen.length > 0 && (
                <>
                  <T variant="eyebrow" style={{ marginTop: space.sm }}>
                    Made happen · {madeHappen.length} 💝
                  </T>
                  {madeHappen.map((x) => (
                    <Ticket key={x.id} coupon={x} faded>
                      <T variant="fine">Done {when(x.done_at!)}</T>
                    </Ticket>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <FloatingHearts burst={burst} />
    </SafeAreaView>
  );
}
