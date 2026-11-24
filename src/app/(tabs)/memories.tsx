import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, AppState, FlatList, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { Photo } from '@/components/photo';
import { MemoryBook } from '@/components/memory-book';
import { PhotoViewer, type ViewerPhoto } from '@/components/photo-viewer';
import { Button, Chip, Empty, ErrorText, Field, Glyph, IconButton, Row, Sheet, T } from '@/components/ui';
import { parseISODate, shortDate, toISODate, today } from '@/lib/dates';
import { useMemoryComments, type MemoryComment } from '@/lib/memory-comments';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, tabBarInset, useColors } from '@/lib/theme';
import type { Memory } from '@/lib/types';

const monthOf = (iso: string) => parseISODate(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

type Mode = 'book' | 'timeline' | 'album' | 'places';
const MODES: { key: Mode; label: string }[] = [
  { key: 'book', label: 'Book' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'album', label: 'Photos' },
  { key: 'places', label: 'Places' },
];

type Source = 'memory' | 'daily' | 'chat';
type AlbumPhoto = ViewerPhoto & { day: string; source: Source; key: string };
const SOURCES: { key: Source | 'all'; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'memory', label: 'Memories' },
  { key: 'daily', label: 'Photo of the day' },
  { key: 'chat', label: 'Chat' },
];

/** Set while the memory book is on screen, so if Love Birds closes with it open, Memories starts on Timeline next time. */
const BOOK_OPEN = 'memory-book-open';

/** If the book throws, show Timeline instead of the error. */
class BookBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Segments({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const c = useColors();
  return (
    <Row gap={0} style={{ backgroundColor: c.surface2, borderRadius: radius.pill, padding: 3, marginHorizontal: space.lg, marginBottom: space.sm }}>
      {MODES.map((m) => {
        const on = value === m.key;
        return (
          <Pressable
            key={m.key}
            onPress={() => onChange(m.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill, backgroundColor: on ? c.surface : 'transparent' }}>
            <T variant="small" style={{ fontWeight: '700' }} color={on ? c.accent : c.muted}>
              {m.label}
            </T>
          </Pressable>
        );
      })}
    </Row>
  );
}

export default function Memories() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Decided once the crash check below has run, so a book that crashed isn't opened again straight away.
  const [mode, setMode] = useState<Mode | null>(null);
  const [bookNote, setBookNote] = useState('');
  const notes = useMemoryComments(coupleId);
  const [commenting, setCommenting] = useState<Memory | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [source, setSource] = useState<Source | 'all'>('all');
  const [extra, setExtra] = useState<AlbumPhoto[]>([]);
  const [viewer, setViewer] = useState<{ photos: ViewerPhoto[]; start: number; slideshow?: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!coupleId) return;
    const { data } = await supabase
      .from('memories')
      .select('*, memory_loves(user_id)')
      .eq('couple_id', coupleId)
      .order('happened_on', { ascending: false })
      .order('created_at', { ascending: false });
    setMemories((data ?? []) as Memory[]);
    setLoaded(true);
  }, [coupleId]);

  // Photos of the day and chat photos, for the album.
  const userId0 = ctx?.userId;
  const loadExtra = useCallback(async () => {
    if (!coupleId || !userId0) return;
    const [daily, chat] = await Promise.all([
      supabase.rpc('get_daily_photos', { p_from: '2000-01-01', p_to: toISODate(today()) }),
      supabase.from('messages').select('id, image_path, created_at, sender_id').eq('couple_id', coupleId).not('image_path', 'is', null).order('created_at', { ascending: false }).limit(300),
    ]);
    const out: AlbumPhoto[] = [];
    for (const p of (daily.data ?? []) as { day: string; user_id: string; photo_path: string | null; caption: string | null }[]) {
      if (p.photo_path) out.push({ key: `d-${p.day}-${p.user_id}`, path: p.photo_path, caption: p.caption, day: p.day, source: 'daily', note: `Photo of the day · ${shortDate(p.day)}` });
    }
    for (const m of (chat.data ?? []) as { id: string; image_path: string; created_at: string }[]) {
      const day = toISODate(new Date(m.created_at));
      out.push({ key: `c-${m.id}`, path: m.image_path, caption: null, day, source: 'chat', note: `From your chat · ${shortDate(day)}` });
    }
    setExtra(out);
  }, [coupleId, userId0]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(BOOK_OPEN)
      .then((v) => {
        if (!active) return;
        if (v === '1') {
          setBookNote('Love Birds closed while the memory book was open, so Memories opened on Timeline. Tap Book to try it again.');
          setMode('timeline');
          AsyncStorage.removeItem(BOOK_OPEN).catch(() => {});
        } else setMode('book');
      })
      .catch(() => active && setMode('book'));
    return () => {
      active = false;
    };
  }, []);

  // While the book is on screen and the app is in front, remember that it's open.
  useEffect(() => {
    if (mode !== 'book') return;
    const mark = (on: boolean) => (on ? AsyncStorage.setItem(BOOK_OPEN, '1') : AsyncStorage.removeItem(BOOK_OPEN)).catch(() => {});
    mark(true);
    const sub = AppState.addEventListener('change', (state) => mark(state === 'active'));
    return () => {
      sub.remove();
      mark(false);
    };
  }, [mode]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadExtra();
    }, [load, loadExtra]),
  );

  const memoryPhotos = useMemo<ViewerPhoto[]>(
    () => memories.filter((m) => m.photo_path).map((m) => ({ path: m.photo_path!, caption: m.caption, note: [shortDate(m.happened_on), m.place].filter(Boolean).join(' · ') })),
    [memories],
  );
  const album = useMemo<AlbumPhoto[]>(() => {
    const own: AlbumPhoto[] = memories
      .filter((m) => m.photo_path)
      .map((m) => ({ key: `m-${m.id}`, path: m.photo_path!, caption: m.caption, day: m.happened_on, source: 'memory', note: [shortDate(m.happened_on), m.place].filter(Boolean).join(' · ') }));
    return [...own, ...extra].filter((p) => source === 'all' || p.source === source).sort((a, b) => b.day.localeCompare(a.day));
  }, [memories, extra, source]);
  const onThisDay = useMemo(() => {
    const t = today();
    return memories.filter((m) => {
      const d = parseISODate(m.happened_on);
      return d.getMonth() === t.getMonth() && d.getDate() === t.getDate() && d.getFullYear() < t.getFullYear();
    });
  }, [memories]);
  const places = useMemo(() => {
    const groups = new Map<string, Memory[]>();
    for (const m of memories) {
      const key = m.place?.trim() || 'Somewhere special';
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    return [...groups.entries()].sort((a, b) => (a[0] === 'Somewhere special' ? 1 : b[0] === 'Somewhere special' ? -1 : b[1].length - a[1].length || a[0].localeCompare(b[0])));
  }, [memories]);

  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`memories:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memories', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  if (!ctx) return null;
  const { userId, partner, profile, couple } = ctx;

  async function sendComment() {
    if (!commenting || !draft.trim()) return;
    setSending(true);
    setCommentError('');
    try {
      await notes.add(commenting.id, draft);
      setDraft('');
      setCommenting(null);
    } catch (e) {
      setCommentError(friendlyError(e));
    }
    setSending(false);
  }

  function confirmDeleteComment(cm: MemoryComment) {
    Alert.alert('Delete your comment?', 'It will disappear for both of you.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => notes.remove(cm.id).catch(() => {}) },
    ]);
  }

  const openMemoryPhoto = (m: Memory) => {
    const start = memoryPhotos.findIndex((p) => p.path === m.photo_path);
    if (start >= 0) setViewer({ photos: memoryPhotos, start });
  };

  async function toggleLove(m: Memory) {
    const loved = !!m.memory_loves?.some((l) => l.user_id === userId);
    setMemories((prev) =>
      prev.map((x) =>
        x.id === m.id
          ? { ...x, memory_loves: loved ? (x.memory_loves ?? []).filter((l) => l.user_id !== userId) : [...(x.memory_loves ?? []), { user_id: userId }] }
          : x,
      ),
    );
    if (loved) await supabase.from('memory_loves').delete().eq('memory_id', m.id).eq('user_id', userId);
    else await supabase.from('memory_loves').insert({ memory_id: m.id });
  }

  function confirmDelete(m: Memory) {
    if (m.created_by !== userId) return;
    Alert.alert('Delete this memory?', 'It will disappear for both of you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('memories').delete().eq('id', m.id);
          load();
        },
      },
    ]);
  }

  const timeline = (
    <FlatList
      data={memories}
      keyExtractor={(m) => m.id}
      contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: tabBarInset + space.xl, gap: space.md }}
      ListEmptyComponent={loaded ? <Empty>No memories yet. Tap + to save your first one together.</Empty> : undefined}
      ListHeaderComponent={
        onThisDay.length ? (
          <View style={{ backgroundColor: c.accentSoft, borderRadius: radius.xl, padding: space.lg, gap: space.sm, marginBottom: space.sm }}>
            <T variant="eyebrow">On this day</T>
            {onThisDay.map((m) => {
              const years = today().getFullYear() - parseISODate(m.happened_on).getFullYear();
              return (
                <Pressable key={m.id} onPress={() => (m.photo_path ? openMemoryPhoto(m) : undefined)} accessibilityRole={m.photo_path ? 'button' : undefined}>
                  <Row gap={space.md}>
                    {m.photo_path ? <Photo path={m.photo_path} style={{ width: 64, height: 64, borderRadius: radius.md }} label={m.caption} /> : <T style={{ fontSize: 30, lineHeight: 36 }}>💞</T>}
                    <View style={{ flex: 1, gap: 2 }}>
                      <T variant="small" accent style={{ fontWeight: '700' }}>
                        {years} {years === 1 ? 'year' : 'years'} ago today
                      </T>
                      <T numberOfLines={2}>{m.caption}</T>
                    </View>
                  </Row>
                </Pressable>
              );
            })}
          </View>
        ) : undefined
      }
      renderItem={({ item: m, index }) => {
        const loved = !!m.memory_loves?.some((l) => l.user_id === userId);
        const partnerLoved = !!m.memory_loves?.some((l) => l.user_id !== userId);
        const showMonth = index === 0 || monthOf(memories[index - 1].happened_on) !== monthOf(m.happened_on);
        return (
          <View style={{ gap: space.sm }}>
            {showMonth && (
              <T variant="strong" muted style={{ marginTop: index ? space.sm : 0 }}>
                {monthOf(m.happened_on)}
              </T>
            )}
            <Pressable
              onLongPress={() => confirmDelete(m)}
              style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.xl, overflow: 'hidden' }}>
              {m.photo_path && (
                <Pressable onPress={() => openMemoryPhoto(m)} onLongPress={() => confirmDelete(m)} accessibilityRole="imagebutton" accessibilityLabel={`Open photo: ${m.caption}`}>
                  <Photo path={m.photo_path} style={{ width: '100%', aspectRatio: 4 / 3 }} label={m.caption} />
                </Pressable>
              )}
              <View style={{ padding: space.lg, gap: 6 }}>
                <T variant="strong" style={{ fontWeight: '600' }}>
                  {m.caption}
                </T>
                <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <T variant="fine" style={{ flex: 1 }}>
                    {shortDate(m.happened_on)}
                    {m.place ? ` · ${m.place}` : ''} · {m.created_by === userId ? 'by you' : `by ${partner.name}`}
                  </T>
                  <Pressable
                    onPress={() => toggleLove(m)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: loved }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: loved ? c.accentSoft : c.surface2, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Glyph name={loved ? 'heart' : 'heartOutline'} color={loved ? c.accent : c.muted} size={15} />
                    <T variant="small" color={loved ? c.accent : c.muted} style={{ fontWeight: '700' }}>
                      {loved ? 'Loved' : 'Love'}
                    </T>
                  </Pressable>
                </Row>
                {partnerLoved && <T variant="fine">{partner.name} loved this</T>}
              </View>
            </Pressable>
          </View>
        );
      }}
    />
  );

  // The album: every photo, a month at a time, three to a row.
  const months: { month: string; photos: { photo: AlbumPhoto; index: number }[] }[] = [];
  album.forEach((photo, index) => {
    const month = monthOf(photo.day);
    const last = months[months.length - 1];
    if (last?.month === month) last.photos.push({ photo, index });
    else months.push({ month, photos: [{ photo, index }] });
  });
  const albumView = (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: tabBarInset + space.xl, gap: space.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {SOURCES.map((s) => (
          <Chip key={s.key} label={s.label} selected={source === s.key} onPress={() => setSource(s.key)} />
        ))}
      </ScrollView>
      {loaded && !album.length && <Empty>No photos here yet. Photos from memories, your photo of the day and your chat all collect here.</Empty>}
      {months.map((g) => (
        <View key={g.month} style={{ gap: space.sm }}>
          <T variant="strong" muted>
            {g.month}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
            {g.photos.map(({ photo, index }) => (
              <Pressable
                key={photo.key}
                onPress={() => setViewer({ photos: album, start: index })}
                accessibilityRole="imagebutton"
                accessibilityLabel={photo.caption ? `Open photo: ${photo.caption}` : 'Open photo'}
                style={{ width: '32.8%', aspectRatio: 1 }}>
                <Photo path={photo.path} style={{ flex: 1, borderRadius: 6 }} label={photo.caption ?? undefined} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );

  const placesView = (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: tabBarInset + space.xl, gap: space.md }}>
      {loaded && !memories.length && <Empty>No memories yet. Add a place when you save one and it will gather here.</Empty>}
      {places.map(([place, list]) => {
        const photos: ViewerPhoto[] = list.filter((m) => m.photo_path).map((m) => ({ path: m.photo_path!, caption: m.caption, note: [shortDate(m.happened_on), place].join(' · ') }));
        return (
          <View key={place} style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.xl, padding: space.lg, gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={space.sm} style={{ flex: 1 }}>
                <T style={{ fontSize: 20, lineHeight: 26 }}>📍</T>
                <T variant="strong" style={{ flex: 1 }} numberOfLines={1}>
                  {place}
                </T>
              </Row>
              <T variant="fine">
                {list.length} {list.length === 1 ? 'memory' : 'memories'}
              </T>
            </Row>
            {photos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                {photos.map((p, i) => (
                  <Pressable key={`${p.path}-${i}`} onPress={() => setViewer({ photos, start: i })} accessibilityRole="imagebutton" accessibilityLabel={`Open photo: ${p.caption}`}>
                    <Photo path={p.path} style={{ width: 96, height: 96, borderRadius: radius.md }} label={p.caption ?? undefined} />
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {list.map((m) => (
              <T key={m.id} variant="small" muted numberOfLines={1}>
                {shortDate(m.happened_on)} · {m.caption}
              </T>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, justifyContent: 'space-between' }}>
        <T variant="title">Memories</T>
        <Row gap={space.sm}>
          {memoryPhotos.length > 1 && (
            <IconButton label="Play a slideshow of your memories" onPress={() => setViewer({ photos: memoryPhotos, start: 0, slideshow: true })}>
              <Glyph name="play" color={c.ink} />
            </IconButton>
          )}
          <IconButton label="Add a memory" accent onPress={() => router.push('/new-memory')}>
            <Glyph name="plus" color={c.onAccent} />
          </IconButton>
        </Row>
      </Row>
      <Segments
        value={mode ?? 'book'}
        onChange={(m) => {
          setBookNote('');
          setMode(m);
        }}
      />
      {bookNote ? (
        <T variant="small" muted style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          {bookNote}
        </T>
      ) : null}
      {mode === null ? null : mode === 'book' ? (
        loaded ? (
          <BookBoundary
            onError={(message) => {
              setBookNote(`The memory book ran into a problem, so here's Timeline. (${message})`);
              setMode('timeline');
            }}>
            <MemoryBook
              memories={memories}
              userId={userId}
              myName={profile.name}
              partnerName={partner.name}
              togetherSince={couple.together_since}
              comments={notes.comments}
              commentsReady={notes.ready}
              onOpenPhoto={openMemoryPhoto}
              onToggleLove={toggleLove}
              onLongPressPage={confirmDelete}
              onComment={(m) => {
                setCommentError('');
                setCommenting(m);
              }}
              onDeleteComment={confirmDeleteComment}
              onAdd={() => router.push('/new-memory')}
              bottomInset={tabBarInset + space.sm}
            />
          </BookBoundary>
        ) : null
      ) : mode === 'timeline' ? (
        timeline
      ) : mode === 'album' ? (
        albumView
      ) : (
        placesView
      )}
      <Sheet open={commenting !== null} onClose={() => setCommenting(null)}>
        <T variant="heading">Write a comment</T>
        {commenting ? (
          <T variant="small" muted numberOfLines={2}>
            {`On "${commenting.caption}"`}
          </T>
        ) : null}
        <Field label="Your comment" value={draft} onChangeText={setDraft} maxLength={500} multiline autoFocus placeholder="Remember how we laughed..." />
        <ErrorText>{commentError}</ErrorText>
        <Button title="Add to the page" onPress={sendComment} loading={sending} disabled={!draft.trim()} />
      </Sheet>
      <PhotoViewer photos={viewer?.photos ?? []} start={viewer ? viewer.start : null} slideshow={viewer?.slideshow} onClose={() => setViewer(null)} />
    </SafeAreaView>
  );
}
