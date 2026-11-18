import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/game-ui';
import { Photo } from '@/components/photo';
import { PhotoViewer, type ViewerPhoto } from '@/components/photo-viewer';
import { StickerArt } from '@/components/sticker';
import { Empty, Glyph, Row, T } from '@/components/ui';
import { clockLabel, dayLabel, shortDate, toISODate } from '@/lib/dates';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import type { Message } from '@/lib/types';

type Tab = 'search' | 'saved';

const clock = () => Date.now();
const sentAt = (m: Message) => m.deliver_at ?? m.created_at;
const COLUMNS = 'id, sender_id, body, image_path, sticker, audio_path, hearted, created_at, deliver_at, unsent_at';

/** "Today at 9:40 PM" or "3 Nov 2026 at 9:40 PM". */
function when(m: Message) {
  const iso = sentAt(m);
  const day = toISODate(new Date(iso));
  const label = dayLabel(day);
  return `${/^(Today|Yesterday)$/.test(label) ? label : shortDate(day)} at ${clockLabel(iso)}`;
}

/** The message with the words you searched for picked out. */
function Highlighted({ text, term }: { text: string; term: string }) {
  const c = useColors();
  if (!term) return <T>{text}</T>;
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const parts: { s: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(needle, i);
    if (at < 0) {
      parts.push({ s: text.slice(i), hit: false });
      break;
    }
    if (at > i) parts.push({ s: text.slice(i, at), hit: false });
    parts.push({ s: text.slice(at, at + needle.length), hit: true });
    i = at + needle.length;
  }
  return (
    <T>
      {parts.map((p, k) =>
        p.hit ? (
          <T key={k} style={{ backgroundColor: c.accentSoft, fontWeight: '700' }} color={c.accent}>
            {p.s}
          </T>
        ) : (
          p.s
        ),
      )}
    </T>
  );
}

/** Search your chat, and see every message either of you hearted. */
export default function ChatSearch() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const [tab, setTab] = useState<Tab>('search');
  const [term, setTerm] = useState('');
  const [searched, setSearched] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [saved, setSaved] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [viewer, setViewer] = useState<{ photos: ViewerPhoto[]; start: number } | null>(null);

  const loadSaved = useCallback(async () => {
    if (!coupleId) return;
    const { data, error: err } = await supabase
      .from('messages')
      .select(COLUMNS)
      .eq('couple_id', coupleId)
      .eq('hearted', true)
      .is('unsent_at', null)
      .order('created_at', { ascending: false })
      .limit(300);
    if (err) setError(friendlyError(err));
    setSaved(((data ?? []) as Message[]).filter((m) => !m.deliver_at || new Date(m.deliver_at).getTime() <= clock()));
  }, [coupleId]);

  useFocusEffect(
    useCallback(() => {
      loadSaved();
    }, [loadSaved]),
  );

  // Searches a moment after you stop typing.
  useEffect(() => {
    const q = term.trim();
    if (!coupleId || q.length < 2) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      const { data, error: err } = await supabase
        .from('messages')
        .select(COLUMNS)
        .eq('couple_id', coupleId)
        .is('unsent_at', null)
        .ilike('body', pattern)
        .order('created_at', { ascending: false })
        .limit(150);
      setLoading(false);
      if (err) return setError(friendlyError(err));
      setError('');
      setSearched(q);
      setResults(((data ?? []) as Message[]).filter((m) => !m.deliver_at || new Date(m.deliver_at).getTime() <= clock()));
    }, 300);
    return () => clearTimeout(timer);
  }, [term, coupleId]);

  if (!ctx || !userId) return null;
  const { partner } = ctx;
  const list = tab === 'search' ? (term.trim().length >= 2 ? results : []) : saved;
  const photos: ViewerPhoto[] = list.filter((m) => m.image_path).map((m) => ({ path: m.image_path!, caption: m.body, note: when(m) }));

  function copy(m: Message) {
    if (!m.body) return;
    Clipboard.setStringAsync(m.body).catch(() => {});
    setCopied(m.id);
    setTimeout(() => setCopied((id) => (id === m.id ? '' : id)), 1500);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <BackHeader title="Search and saved" home="/chat" />
      <View style={{ paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.sm }}>
        <Row gap={0} style={{ backgroundColor: c.surface2, borderRadius: radius.pill, padding: 3 }}>
          {(
            [
              { key: 'search', label: '🔎 Search' },
              { key: 'saved', label: `❤️ Saved${saved.length ? ` · ${saved.length}` : ''}` },
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
                <T variant="small" style={{ fontWeight: '700' }} color={on ? c.accent : c.muted}>
                  {t.label}
                </T>
              </Pressable>
            );
          })}
        </Row>
        {tab === 'search' && (
          <Row gap={space.sm} style={{ borderWidth: 1.5, borderColor: c.line, borderRadius: 23, paddingHorizontal: 14, backgroundColor: c.surface }}>
            <Glyph name="search" color={c.muted} size={18} />
            <TextInput
              value={term}
              onChangeText={setTerm}
              autoFocus
              placeholder={`Search your chat with ${partner.name}`}
              placeholderTextColor={c.muted}
              accessibilityLabel="Search messages"
              returnKeyType="search"
              style={{ flex: 1, minHeight: 46, color: c.ink, fontSize: 16 }}
            />
          </Row>
        )}
      </View>
      <FlatList
        data={list}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.sm, paddingBottom: space.xxl }}
        ListHeaderComponent={
          error ? (
            <T variant="small" color={c.danger}>
              {error}
            </T>
          ) : tab === 'saved' && saved.length ? (
            <T variant="fine">Messages either of you hearted, newest first. Double tap a message in the chat to save it here.</T>
          ) : undefined
        }
        ListEmptyComponent={
          tab === 'search' ? (
            term.trim().length < 2 ? (
              <Empty>Type a word or two to find a message. A date, a place, a name, “love”…</Empty>
            ) : loading || searched !== term.trim() ? undefined : (
              <Empty>Nothing found for “{term.trim()}”.</Empty>
            )
          ) : (
            <Empty>No saved messages yet. Double tap any message in the chat to give it a heart, and it shows up here.</Empty>
          )
        }
        renderItem={({ item: m }) => {
          const mine = m.sender_id === userId;
          return (
            <Pressable
              onPress={() => {
                if (m.image_path) {
                  const start = photos.findIndex((p) => p.path === m.image_path);
                  if (start >= 0) setViewer({ photos, start });
                } else copy(m);
              }}
              onLongPress={() => copy(m)}
              accessibilityRole="button"
              accessibilityHint={m.image_path ? 'Opens the photo' : 'Copies the message'}
              style={({ pressed }) => ({
                backgroundColor: c.surface,
                borderColor: c.line,
                borderWidth: 1,
                borderRadius: radius.md,
                padding: space.md,
                gap: 6,
                opacity: pressed ? 0.8 : 1,
              })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="fine" style={{ fontWeight: '700' }} color={mine ? c.accent : c.ink}>
                  {mine ? 'You' : partner.name}
                  {m.hearted ? ' ❤️' : ''}
                </T>
                <T variant="fine">{copied === m.id ? 'Copied ✓' : when(m)}</T>
              </Row>
              {m.image_path && <Photo path={m.image_path} style={{ width: '100%', height: 180, borderRadius: radius.sm }} />}
              {m.sticker && <StickerArt sticker={m.sticker} size={72} />}
              {m.audio_path && !m.body ? <T muted>🎤 Voice note</T> : null}
              {m.body ? <Highlighted text={m.body} term={tab === 'search' ? searched : ''} /> : null}
            </Pressable>
          );
        }}
      />
      <PhotoViewer photos={viewer?.photos ?? []} start={viewer ? viewer.start : null} onClose={() => setViewer(null)} />
    </SafeAreaView>
  );
}
