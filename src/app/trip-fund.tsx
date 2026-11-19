import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { FloatingHearts } from '@/components/floating-hearts';
import { BackHeader } from '@/components/game-ui';
import { Button, Card, Chip, ErrorText, Field, Glyph, ProgressBar, Row, Sheet, T } from '@/components/ui';
import { dayLabel, toISODate } from '@/lib/dates';
import { digits, fundTotals, ksh, loadFunds } from '@/lib/funds';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { loadBucket } from '@/lib/together';
import { radius, space, useColors } from '@/lib/theme';
import type { BucketItem, Fund, FundEntry } from '@/lib/types';

const EMOJIS = ['✈️', '🏝️', '🏔️', '🦒', '🚗', '🏡', '💍', '🎂', '🎁', '🛋️', '📱', '🐶', '🎓', '🌍', '🚢', '🎟️'];
const AMOUNTS = [200, 500, 1000, 2000, 5000];

const when = (iso: string) => dayLabel(toISODate(new Date(iso)));

type Draft = { id: string | null; title: string; emoji: string; target: string; bucket: string | null };

/** Trip funds: save up together for a dream, and watch it fill. */
export default function TripFund() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const [funds, setFunds] = useState<Fund[]>([]);
  const [entries, setEntries] = useState<FundEntry[]>([]);
  const [bucket, setBucket] = useState<BucketItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState<Fund | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [burst, setBurst] = useState(0);

  const load = useCallback(async () => {
    if (!coupleId) return;
    const [f, b] = await Promise.all([loadFunds(coupleId), loadBucket(coupleId)]);
    if (f.error) setError(friendlyError(f.error));
    setFunds(f.funds);
    setEntries(f.entries);
    setBucket(b);
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
      .channel(`funds:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funds', filter: `couple_id=eq.${coupleId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fund_entries', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  if (!ctx || !coupleId || !userId) return null;
  const { partner } = ctx;
  const me = userId;
  const withTotals = funds.map((f) => ({ fund: f, ...fundTotals(entries, f.id, me) }));
  const active = withTotals.filter((x) => x.total < x.fund.target);
  const reached = withTotals.filter((x) => x.total >= x.fund.target);
  const openDreams = bucket.filter((b) => !b.done_on);

  async function saveFund() {
    if (!draft) return;
    setError('');
    const target = digits(draft.target);
    if (!draft.title.trim()) return setError('What are you saving for?');
    if (target < 1) return setError('How much do you need, in shillings?');
    setBusy(true);
    const row = { title: draft.title.trim().slice(0, 80), emoji: draft.emoji, target, bucket_item: draft.bucket };
    const { error: err } = draft.id ? await supabase.from('funds').update(row).eq('id', draft.id) : await supabase.from('funds').insert({ ...row, couple_id: coupleId });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setDraft(null);
    load();
  }

  function removeFund(id: string) {
    Alert.alert('Remove this fund?', 'It goes for both of you, with everything you saved in it. The money itself is wherever you keep it.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('funds').delete().eq('id', id);
          if (err) return setError(friendlyError(err));
          setDraft(null);
          load();
        },
      },
    ]);
  }

  async function addSaving() {
    if (!saving) return;
    const n = digits(amount);
    if (n < 1) return setError('How much did you put aside?');
    setBusy(true);
    setError('');
    const before = fundTotals(entries, saving.id, me).total;
    const { error: err } = await supabase.from('fund_entries').insert({ fund_id: saving.id, couple_id: coupleId, amount: n, note: note.trim().slice(0, 120) || null });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    if (before < saving.target && before + n >= saving.target) setBurst((b) => b + 2);
    else setBurst((b) => b + 1);
    setSaving(null);
    setAmount('');
    setNote('');
    load();
  }

  function removeEntry(e: FundEntry) {
    if (e.user_id !== userId) return;
    Alert.alert(`Remove ${ksh(e.amount)}?`, 'Only if it was a mistake. It comes off the total for both of you.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('fund_entries').delete().eq('id', e.id);
          if (err) setError(friendlyError(err));
          load();
        },
      },
    ]);
  }

  const card = ({ fund, mine, theirs, total }: (typeof withTotals)[number]) => {
    const done = total >= fund.target;
    const dream = bucket.find((b) => b.id === fund.bucket_item);
    const list = entries.filter((e) => e.fund_id === fund.id);
    const open = expanded === fund.id;
    return (
      <Card key={fund.id} tone={done ? 'soft' : 'plain'} style={{ gap: space.sm }}>
        <Row gap={space.md}>
          <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: done ? c.surface : c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <T style={{ fontSize: 28, lineHeight: 34 }}>{fund.emoji || '✈️'}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T variant="strong" style={{ fontSize: 18 }}>
              {fund.title}
            </T>
            {dream && (
              <T variant="fine" numberOfLines={1}>
                For {dream.emoji || '✨'} {dream.title}
              </T>
            )}
          </View>
          <Pressable
            onPress={() => setDraft({ id: fund.id, title: fund.title, emoji: fund.emoji || '✈️', target: String(fund.target), bucket: fund.bucket_item })}
            accessibilityRole="button"
            accessibilityLabel={`Change ${fund.title}`}
            hitSlop={10}>
            <Glyph name="edit" color={c.muted} size={18} />
          </Pressable>
        </Row>
        <ProgressBar value={total / fund.target} height={12} />
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="strong">{ksh(total)}</T>
          <T variant="small" muted>
            of {ksh(fund.target)} · {Math.min(100, Math.floor((total * 100) / fund.target))}%
          </T>
        </Row>
        <T variant="small" muted>
          {done ? 'Fully saved up. Time to book it! 🎉' : `${ksh(fund.target - total)} to go.`} You {ksh(mine)} · {partner.name} {ksh(theirs)}
        </T>
        <Button
          title={done ? 'Add a little extra' : 'Add savings'}
          variant={done ? 'outline' : 'primary'}
          onPress={() => {
            setError('');
            setSaving(fund);
          }}
          icon={<Glyph name="plus" color={done ? c.accent : c.onAccent} size={18} />}
        />
        {list.length > 0 && (
          <Pressable onPress={() => setExpanded(open ? null : fund.id)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6}>
            <T variant="small" accent style={{ fontWeight: '700' }}>
              {open ? 'Hide savings' : `See savings · ${list.length}`}
            </T>
          </Pressable>
        )}
        {open &&
          list.map((e) => (
            <Pressable key={e.id} onLongPress={() => removeEntry(e)} disabled={e.user_id !== userId} accessibilityHint={e.user_id === userId ? 'Hold to remove' : undefined}>
              <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                <View style={{ flex: 1 }}>
                  <T variant="small" style={{ fontWeight: '700' }}>
                    {e.user_id === userId ? 'You' : partner.name} · {ksh(e.amount)}
                  </T>
                  {!!e.note && <T variant="fine">{e.note}</T>}
                </View>
                <T variant="fine">{when(e.created_at)}</T>
              </Row>
            </Pressable>
          ))}
      </Card>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <BackHeader title="Trip fund" home="/together" />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.lg, paddingBottom: space.xxl }}>
        <T variant="small" muted>
          Save up together for something you both dream of. Log what you each put aside and watch it fill. The money stays wherever you keep it, this just keeps count.
        </T>
        <ErrorText>{!draft && !saving ? error : ''}</ErrorText>
        {active.map(card)}
        {loaded && !funds.length && (
          <Card tone="soft" style={{ alignItems: 'center', gap: space.sm }}>
            <T style={{ fontSize: 44, lineHeight: 52 }}>🏝️</T>
            <T variant="heading" style={{ textAlign: 'center' }}>
              Start your first fund
            </T>
            <T variant="small" style={{ textAlign: 'center' }}>
              Diani for your anniversary, a weekend in the Mara, a new sofa. Pick a dream from your bucket list or make one up.
            </T>
          </Card>
        )}
        <Button
          title="Start a new fund"
          variant={funds.length ? 'outline' : 'primary'}
          onPress={() => {
            setError('');
            setDraft({ id: null, title: '', emoji: '✈️', target: '', bucket: null });
          }}
          icon={<Glyph name="plus" color={funds.length ? c.accent : c.onAccent} size={18} />}
        />
        {reached.length > 0 && (
          <>
            <T variant="eyebrow">Saved up · {reached.length} 🎉</T>
            {reached.map(card)}
          </>
        )}
      </ScrollView>

      <Sheet open={!!draft} onClose={() => setDraft(null)}>
        {draft && (
          <>
            <T variant="heading">{draft.id ? 'Change this fund' : 'A new fund'}</T>
            {!draft.id && openDreams.length > 0 && (
              <View style={{ gap: space.sm }}>
                <T variant="small" muted style={{ fontWeight: '700' }}>
                  For a dream on your bucket list?
                </T>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.sm }}>
                  {openDreams.map((b) => (
                    <Chip
                      key={b.id}
                      label={`${b.emoji || '✨'} ${b.title}`}
                      selected={draft.bucket === b.id}
                      onPress={() =>
                        setDraft(draft.bucket === b.id ? { ...draft, bucket: null } : { ...draft, bucket: b.id, title: draft.title || b.title.slice(0, 80), emoji: b.emoji && EMOJIS.includes(b.emoji) ? b.emoji : draft.emoji })
                      }
                    />
                  ))}
                </ScrollView>
              </View>
            )}
            <Field label="Saving for" value={draft.title} onChangeText={(t) => setDraft({ ...draft, title: t })} placeholder="Zanzibar for our anniversary" maxLength={80} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
              {EMOJIS.map((e) => {
                const on = e === draft.emoji;
                return (
                  <Pressable
                    key={e}
                    onPress={() => setDraft({ ...draft, emoji: e })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Use ${e}`}
                    style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }}>
                    <T style={{ fontSize: 20, lineHeight: 26 }}>{e}</T>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Field
              label="Target (KSh)"
              value={draft.target ? Number(digits(draft.target)).toLocaleString('en-GB') : ''}
              onChangeText={(t) => setDraft({ ...draft, target: String(digits(t) || '') })}
              placeholder="80,000"
              keyboardType="number-pad"
              maxLength={12}
            />
            <ErrorText>{error}</ErrorText>
            <Button title={draft.id ? 'Save' : 'Start saving'} onPress={saveFund} loading={busy} />
            {draft.id && <Button title="Remove this fund" variant="ghost" onPress={() => removeFund(draft.id!)} />}
          </>
        )}
      </Sheet>

      <Sheet open={!!saving} onClose={() => setSaving(null)}>
        {saving && (
          <>
            <T variant="heading">
              {saving.emoji || '✈️'} Add to {saving.title}
            </T>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {AMOUNTS.map((a) => (
                <Chip key={a} label={ksh(a)} selected={digits(amount) === a} onPress={() => setAmount(String(a))} />
              ))}
            </Row>
            <Field
              label="Amount (KSh)"
              value={amount ? Number(digits(amount)).toLocaleString('en-GB') : ''}
              onChangeText={(t) => setAmount(String(digits(t) || ''))}
              placeholder="1,000"
              keyboardType="number-pad"
              maxLength={12}
            />
            <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Skipped takeaway this week 💪" maxLength={120} />
            <ErrorText>{error}</ErrorText>
            <Button title={amount ? `Add ${ksh(digits(amount))}` : 'Add'} onPress={addSaving} loading={busy} disabled={!digits(amount)} />
          </>
        )}
      </Sheet>
      <FloatingHearts burst={burst} />
    </SafeAreaView>
  );
}
