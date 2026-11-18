import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Pill } from '@/components/game-ui';
import { Button, Card, Empty, ErrorText, Field, Glyph, Row, Sheet, T } from '@/components/ui';
import { addDays, daysBetween, parseISODate, shortDate, toISODate, today } from '@/lib/dates';
import { useCouple } from '@/lib/session';
import { specialDays } from '@/lib/special-days';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import type { Wish } from '@/lib/types';

type Who = 'mine' | 'partner';

const EMOJIS = ['🎁', '👗', '👟', '💄', '📚', '🎧', '📷', '⌚', '💍', '🌸', '🍫', '🎮', '🏋️', '✈️', '🧸', '🍷'];

function EmojiRow({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const c = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.sm }}>
      {EMOJIS.map((e) => {
        const on = e === value;
        return (
          <Pressable
            key={e}
            onPress={() => onChange(e)}
            accessibilityRole="button"
            accessibilityLabel={`Use ${e}`}
            accessibilityState={{ selected: on }}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accentSoft : c.surface, borderWidth: 1.5, borderColor: on ? c.accent : c.line }}>
            <T style={{ fontSize: 22, lineHeight: 28 }}>{e}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const isLink = (s: string | null | undefined) => !!s && /^https?:\/\/\S+$/i.test(s.trim());
const hostOf = (s: string) => s.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./, '');

function WishRow({ wish, claimed, onPress }: { wish: Wish; claimed?: boolean; onPress: () => void }) {
  const c = useColors();
  const got = !!wish.received_on;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${wish.title}${got ? ', got it' : claimed ? ', you are getting this' : ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: claimed && !got ? c.accentSoft : c.surface,
        borderWidth: 1,
        borderColor: claimed && !got ? 'transparent' : c.line,
        opacity: pressed ? 0.8 : got ? 0.7 : 1,
      })}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <T style={{ fontSize: 22, lineHeight: 28 }}>{wish.emoji || '🎁'}</T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="strong" style={got ? { textDecorationLine: 'line-through' } : undefined}>
          {wish.title}
        </T>
        {!!wish.note && (
          <T variant="small" muted numberOfLines={2}>
            {wish.note}
          </T>
        )}
        {isLink(wish.link) && (
          <T variant="fine" accent numberOfLines={1}>
            🔗 {hostOf(wish.link!)}
          </T>
        )}
        {got ? (
          <T variant="fine" style={{ fontWeight: '700' }}>
            ✓ Got it {shortDate(wish.received_on!)}
          </T>
        ) : claimed ? (
          <T variant="fine" accent style={{ fontWeight: '700' }}>
            🤫 You&apos;re getting this
          </T>
        ) : null}
      </View>
      <Glyph name="next" color={c.muted} size={18} />
    </Pressable>
  );
}

/** Your wishlists. You can secretly mark something you'll get your partner, and they never see it. */
export default function Wishlist() {
  const c = useColors();
  const ctx = useCouple();
  const params = useLocalSearchParams<{ who?: string }>();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const [who, setWho] = useState<Who>(params.who === 'partner' ? 'partner' : 'mine');
  const [linked, setLinked] = useState(params.who);
  if (params.who !== linked) {
    setLinked(params.who);
    if (params.who === 'partner' || params.who === 'mine') setWho(params.who);
  }
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [claims, setClaims] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [emoji, setEmoji] = useState('🎁');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Wish | null>(null);

  const load = useCallback(async () => {
    if (!coupleId) return;
    const [w, cl] = await Promise.all([
      supabase.from('wishes').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }),
      supabase.from('wish_claims').select('wish_id'),
    ]);
    if (w.error) setError(friendlyError(w.error));
    setWishes((w.data ?? []) as Wish[]);
    setClaims(new Set(((cl.data ?? []) as { wish_id: string }[]).map((x) => x.wish_id)));
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
      .channel(`wishes:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishes', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  if (!ctx || !coupleId || !userId) return null;
  const { partner, profile, couple } = ctx;
  const list = wishes.filter((w) => (who === 'mine' ? w.user_id === userId : w.user_id !== userId));
  const wanting = list.filter((w) => !w.received_on);
  const got = list.filter((w) => w.received_on);
  const birthday = specialDays(today(), addDays(today(), 90), {
    togetherSince: couple.together_since,
    myBirthday: profile.birthday,
    partnerBirthday: partner.birthday,
    partnerName: partner.name,
  }).find((d) => d.kind === 'birthday' && d.title !== 'Your birthday');
  const birthdayIn = birthday ? daysBetween(today(), parseISODate(birthday.day)) : null;

  async function add() {
    setError('');
    const t = title.trim();
    if (!t) return setError('What would you love?');
    const l = link.trim();
    if (l && !isLink(l)) return setError('A link starts with https://');
    setBusy(true);
    const { error: err } = await supabase.from('wishes').insert({ couple_id: coupleId, title: t.slice(0, 120), emoji, note: note.trim().slice(0, 300) || null, link: l || null });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setTitle('');
    setLink('');
    setNote('');
    setEmoji('🎁');
    setMore(false);
    load();
  }

  async function act(fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    setError('');
    const { error: err } = await fn();
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setOpen(null);
    load();
  }

  const mineOpen = open && open.user_id === userId;
  const claimedOpen = open ? claims.has(open.id) : false;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <BackHeader title="Wishlists" home="/together" />
      <Row gap={0} style={{ marginHorizontal: space.lg, backgroundColor: c.surface2, borderRadius: radius.pill, padding: 3 }}>
        {(
          [
            { key: 'mine', label: '🎁 Mine' },
            { key: 'partner', label: `💝 ${partner.name}'s` },
          ] as { key: Who; label: string }[]
        ).map((t) => {
          const on = who === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setWho(t.key)}
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
          {who === 'mine' ? (
            <Card style={{ gap: space.md }}>
              <Field label="Add a wish" value={title} onChangeText={setTitle} placeholder="Those white sneakers, a spa day…" maxLength={120} />
              {more ? (
                <>
                  <EmojiRow value={emoji} onChange={setEmoji} />
                  <Field label="Link (optional)" value={link} onChangeText={setLink} placeholder="https://" autoCapitalize="none" keyboardType="url" maxLength={500} />
                  <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Size 6, the blue one" maxLength={300} />
                </>
              ) : (
                <Pressable onPress={() => setMore(true)} accessibilityRole="button" hitSlop={8}>
                  <T variant="small" accent style={{ fontWeight: '700' }}>
                    + Add a link, a note or an emoji
                  </T>
                </Pressable>
              )}
              <ErrorText>{error}</ErrorText>
              <Button title="Add to my wishlist" onPress={add} loading={busy && !open} disabled={!title.trim()} />
              <T variant="fine">{partner.name} can see your wishlist and secretly mark what they&apos;ll get you. You&apos;ll never know which, until it&apos;s yours.</T>
            </Card>
          ) : (
            <Card tone="soft" style={{ gap: 4 }}>
              <T variant="strong">🤫 Shh, it&apos;s a secret</T>
              <T variant="small">
                Tap a wish to say you&apos;ll get it. {partner.name} never sees what you&apos;ve picked.
                {birthday && birthdayIn !== null ? ` 🎂 Their birthday is ${birthdayIn === 0 ? 'today!' : birthdayIn === 1 ? 'tomorrow!' : `in ${birthdayIn} days.`}` : ''}
              </T>
            </Card>
          )}

          {who === 'partner' && <ErrorText>{error}</ErrorText>}

          {wanting.map((w) => (
            <WishRow key={w.id} wish={w} claimed={who === 'partner' && claims.has(w.id)} onPress={() => setOpen(w)} />
          ))}
          {loaded && !wanting.length && (
            <Empty>
              {who === 'mine'
                ? 'Nothing on your wishlist yet. Add the little and big things you’d love.'
                : `${partner.name} hasn't added any wishes yet. Their list shows here when they do.`}
            </Empty>
          )}
          {got.length > 0 && (
            <>
              <T variant="eyebrow" style={{ marginTop: space.sm }}>
                Got it · {got.length} 🎉
              </T>
              {got.map((w) => (
                <WishRow key={w.id} wish={w} onPress={() => setOpen(w)} />
              ))}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet open={!!open} onClose={() => setOpen(null)}>
        {open && (
          <>
            <Row gap={space.md}>
              <T style={{ fontSize: 30, lineHeight: 36 }}>{open.emoji || '🎁'}</T>
              <View style={{ flex: 1 }}>
                <T variant="heading">{open.title}</T>
                {!!open.note && <T variant="small" muted>{open.note}</T>}
              </View>
            </Row>
            {isLink(open.link) && (
              <Button title={`Open ${hostOf(open.link!)}`} variant="outline" onPress={() => Linking.openURL(open.link!.trim()).catch(() => {})} icon={<Glyph name="link" color={c.ink} size={18} />} />
            )}
            {mineOpen ? (
              <>
                {open.received_on ? (
                  <Button title="I don't have it after all" variant="outline" loading={busy} onPress={() => act(() => supabase.from('wishes').update({ received_on: null }).eq('id', open.id))} />
                ) : (
                  <Button title="I got it! 🎉" loading={busy} onPress={() => act(() => supabase.from('wishes').update({ received_on: toISODate(today()) }).eq('id', open.id))} />
                )}
                <Button title="Remove from my wishlist" variant="ghost" disabled={busy} onPress={() => act(() => supabase.from('wishes').delete().eq('id', open.id))} />
              </>
            ) : open.received_on ? (
              <Pill>✓ {partner.name} got it</Pill>
            ) : claimedOpen ? (
              <>
                <T variant="small">🤫 You&apos;re getting this. {partner.name} can&apos;t see that.</T>
                <Button title="Not getting it after all" variant="outline" loading={busy} onPress={() => act(() => supabase.from('wish_claims').delete().eq('wish_id', open.id))} />
              </>
            ) : (
              <>
                <Button title="I'll get this 🤫" loading={busy} onPress={() => act(() => supabase.from('wish_claims').insert({ wish_id: open.id, couple_id: coupleId }))} />
                <T variant="fine">Only you will see this. It helps you remember, and {partner.name} gets a surprise.</T>
              </>
            )}
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}
