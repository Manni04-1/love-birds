import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, FlatList, KeyboardAvoidingView, PanResponder, Pressable, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { useReducedMotion } from '@/components/hero';
import { bubbleInk, LoveBubble } from '@/components/love-bubble';
import { PartnerCard } from '@/components/partner-card';
import { Photo } from '@/components/photo';
import { PhotoViewer, type ViewerPhoto } from '@/components/photo-viewer';
import { StickerArt, StickerPicker } from '@/components/sticker';
import { Avatar, Button, DateField, Glyph, IconButton, Row, Sheet, T } from '@/components/ui';
import { useVoicePlayback, VoiceNote, VoiceRecorder } from '@/components/voice';
import { parseSticker } from '@/content/stickers';
import { addDays, clockLabel, dayLabel, toISODate, today } from '@/lib/dates';
import { whileAway } from '@/lib/lock';
import { setChatOpen } from '@/lib/notifications';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { REACTIONS, useRoom } from '@/lib/room';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { alpha, radius, space, tabBarInset, useColors } from '@/lib/theme';
import type { Message, Reaction } from '@/lib/types';
import { deleteRecording, durationLabel, uploadVoiceNote } from '@/lib/voice';

const EDIT_WINDOW = 15 * 60 * 1000;
/** How many of the newest messages the chat loads when it opens, and how many more each time you reach the top. */
const NEWEST = 200;
const EARLIER = 100;

/** When a message counts as sent: its delivery time if it was scheduled. */
const sentAt = (m: Message) => m.deliver_at ?? m.created_at;
const now = () => Date.now();
const waiting = (m: Message) => !!m.deliver_at && new Date(m.deliver_at).getTime() > now();
/** You can change or unsend your message for 15 minutes, or any time before a scheduled one goes. */
const changeable = (m: Message) => !m.unsent_at && (waiting(m) || now() - new Date(sentAt(m)).getTime() < EDIT_WINDOW);
const snippet = (m: Message | undefined) => {
  if (!m) return 'A message';
  if (m.unsent_at) return 'Unsent message';
  if (m.body) return m.body;
  const sticker = parseSticker(m.sticker);
  if (sticker) return `${sticker.emoji} Sticker: ${sticker.text}`;
  return m.audio_path ? `🎤 Voice note${m.audio_ms ? ` · ${durationLabel(m.audio_ms)}` : ''}` : '📷 Photo';
};

function sortMessages(list: Message[]) {
  return [...list].sort((a, b) => sentAt(b).localeCompare(sentAt(a)));
}

/** The time the oldest of these messages was written. */
const oldestWritten = (list: Message[]) => list.reduce((min, m) => (m.created_at < min ? m.created_at : min), list[0]?.created_at ?? '');

/** Fetches the messages that replies in `list` quote but that aren't in `have`, so those quotes can show what they answer. */
async function fetchQuoted(coupleId: string, list: Message[], have: Set<string>): Promise<Message[]> {
  const ids = [...new Set(list.flatMap((m) => (m.reply_to && !have.has(m.reply_to) ? [m.reply_to] : [])))].slice(0, 50);
  if (!ids.length) return [];
  const { data } = await supabase.from('messages').select('*').eq('couple_id', coupleId).in('id', ids);
  return (data ?? []) as Message[];
}

/** A photo message as the full-screen viewer shows it. */
const viewerPhoto = (m: Message): ViewerPhoto => ({
  path: m.image_path!,
  caption: m.body,
  note: `${dayLabel(toISODate(new Date(sentAt(m))))} · ${clockLabel(sentAt(m))}`,
});

/** Drag a message to the right to reply to it. */
function SwipeToReply({ onReply, children }: { onReply: () => void; children: ReactNode }) {
  const c = useColors();
  const [x] = useState(() => new Animated.Value(0));
  const latest = useRef(onReply);
  useEffect(() => {
    latest.current = onReply;
  });
  const responder = useMemo(
    () =>
      // The gesture handlers read `latest` only while a finger is moving, never during render.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => x.setValue(Math.max(0, Math.min(72, g.dx))),
        onPanResponderRelease: (_e, g) => {
          if (g.dx > 56) latest.current();
          Animated.spring(x, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [x],
  );
  const hint = x.interpolate({ inputRange: [0, 56, 72], outputRange: [0, 1, 1] });
  return (
    <View {...responder.panHandlers}>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center', opacity: hint }}>
        <Glyph name="reply" color={c.accent} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: x }] }}>{children}</Animated.View>
    </View>
  );
}

/** Times to send a message later. */
function scheduleOptions(): { label: string; at: Date }[] {
  const current = new Date();
  const at = (dayOffset: number, h: number) => {
    const d = addDays(today(), dayOffset);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const out: { label: string; at: Date }[] = [];
  if (current < at(0, 5)) out.push({ label: 'This morning at 7 AM', at: at(0, 7) });
  if (current < at(0, 20)) out.push({ label: 'Tonight at 9 PM', at: at(0, 21) });
  out.push({ label: 'Tomorrow morning at 7 AM', at: at(1, 7) });
  out.push({ label: 'Tomorrow at lunchtime', at: at(1, 13) });
  out.push({ label: 'Tomorrow night at 9 PM', at: at(1, 21) });
  return out;
}

/** "today at 7:00 AM" or "Fri 21 Nov at 7:00 AM". */
function whenLabel(iso: string) {
  const day = dayLabel(toISODate(new Date(iso)));
  return `${day === 'Today' ? 'today' : day === 'Tomorrow' ? 'tomorrow' : day} at ${clockLabel(iso)}`;
}

function MenuRow({ icon, label, danger, onPress }: { icon: 'reply' | 'copy' | 'edit' | 'trash'; label: string; danger?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
      <Glyph name={icon} color={danger ? c.danger : c.ink} />
      <T variant="strong" color={danger ? c.danger : c.ink}>
        {label}
      </T>
    </Pressable>
  );
}

export default function Chat() {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  const ctx = useCouple();
  const room = useRoom();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Map<string, Reaction[]>>(new Map());
  const [text, setText] = useState('');
  const [cardOpen, setCardOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [menu, setMenu] = useState<Message | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [pickDay, setPickDay] = useState<string | null>(null);
  const [pickTime, setPickTime] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ photos: ViewerPhoto[]; start: number } | null>(null);
  const [stickers, setStickers] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sealed, setSealed] = useState(0);
  const [, setTick] = useState(0);
  // Messages that replies quote but that are older than the ones loaded.
  const [farQuotes, setFarQuotes] = useState<Map<string, Message>>(new Map());
  // Whether there may be earlier messages to load when you scroll to the top, and whether the last try failed.
  const [hasEarlier, setHasEarlier] = useState(true);
  const [earlierFailed, setEarlierFailed] = useState(false);
  const loadingEarlier = useRef(false);
  // The message a tapped quote just scrolled to, glowing for a moment so you can spot it.
  const [flashId, setFlashId] = useState<string | null>(null);
  const [glow] = useState(() => new Animated.Value(0));
  const listRef = useRef<FlatList<Message>>(null);
  const jumpTries = useRef(0);
  const reduced = useReducedMotion();
  const focused = useRef(false);
  const lastTap = useRef<{ id: string; at: number; timer: ReturnType<typeof setTimeout> | null }>({ id: '', at: 0, timer: null });
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const voice = useVoicePlayback();
  const { current: playingId, loading: loadingId, failed: failedId, pause: pauseVoice } = voice;

  const markRead = useCallback(async () => {
    if (!coupleId || !userId) return;
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('couple_id', coupleId).neq('sender_id', userId).is('read_at', null);
  }, [coupleId, userId]);

  const load = useCallback(async () => {
    if (!coupleId) return;
    const [msgs, reacts, letters] = await Promise.all([
      supabase.from('messages').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(NEWEST),
      supabase.from('message_reactions').select('message_id, user_id, emoji, updated_at').eq('couple_id', coupleId).not('emoji', 'is', null),
      supabase.rpc('get_letters'),
    ]);
    if (msgs.error) return;
    const loaded = (msgs.data ?? []) as Message[];
    const fresh = new Set(loaded.map((m) => m.id));
    const cutoff = oldestWritten(loaded);
    // Earlier messages you loaded by scrolling up stay, so coming back to the chat keeps your place.
    // A short batch is the whole chat, so then there is nothing earlier to keep.
    const whole = loaded.length < NEWEST;
    setMessages((prev) => sortMessages([...loaded, ...(whole ? [] : prev.filter((m) => !fresh.has(m.id) && m.created_at < cutoff))]));
    if (whole) setHasEarlier(false);
    const map = new Map<string, Reaction[]>();
    for (const r of (reacts.data ?? []) as Reaction[]) map.set(r.message_id, [...(map.get(r.message_id) ?? []), r]);
    setReactions(map);
    setSealed(((letters.data ?? []) as { from_user: string; opened_at: string | null }[]).filter((l) => l.from_user !== userId && !l.opened_at).length);
    // A reply can quote a message from before the ones loaded. Fetch those so the quote still shows what it answers.
    const quoted = await fetchQuoted(coupleId, loaded, fresh);
    if (quoted.length) setFarQuotes((prev) => new Map([...prev, ...quoted.map((m) => [m.id, m] as const)]));
  }, [coupleId, userId]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setChatOpen(true);
      load().then(markRead);
      // Keeps "Sends at" labels and the edit window honest while you look.
      const t = setInterval(() => setTick((n) => n + 1), 30_000);
      return () => {
        focused.current = false;
        setChatOpen(false);
        clearInterval(t);
        pauseVoice();
      };
    }, [load, markRead, pauseVoice]),
  );

  // Live updates: new messages, hearts, edits, read receipts, scheduled messages arriving, and reactions.
  useEffect(() => {
    if (!coupleId) return;
    const upsert = (m: Message) => setMessages((prev) => sortMessages(prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [m, ...prev]));
    const channel = supabase
      .channel(`messages:${coupleId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        const m = payload.new as Message;
        upsert(m);
        if (focused.current && m.sender_id !== userId) markRead();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        const m = payload.new as Message;
        upsert(m);
        if (focused.current && m.sender_id !== userId && !m.read_at) markRead();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) setMessages((prev) => prev.filter((x) => x.id !== id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        const r = payload.new as Reaction;
        if (!r?.message_id) return;
        setReactions((prev) => {
          const next = new Map(prev);
          const list = (next.get(r.message_id) ?? []).filter((x) => x.user_id !== r.user_id);
          next.set(r.message_id, r.emoji ? [...list, r] : list);
          return next;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, userId, markRead]);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  // Redraws the messages when reactions change, a voice note starts or stops loading, an older quoted
  // message arrives, or a message glows after a tapped quote.
  const listExtra = useMemo(
    () => ({ reactions, playingId, loadingId, failedId, farQuotes, flashId }),
    [reactions, playingId, loadingId, failedId, farQuotes, flashId],
  );
  const photos = useMemo<ViewerPhoto[]>(() => messages.filter((m) => m.image_path && !m.unsent_at).map(viewerPhoto), [messages]);

  if (!ctx) return null;
  const { partner, couple, profile } = ctx;

  async function send(body: string | null, imagePath: string | null, deliverAt?: Date) {
    setError('');
    const { data, error: err } = await supabase
      .from('messages')
      .insert({ couple_id: couple.id, body, image_path: imagePath, reply_to: replyTo?.id ?? null, deliver_at: deliverAt?.toISOString() ?? null })
      .select()
      .single();
    if (err) throw err;
    setReplyTo(null);
    setMessages((prev) => sortMessages(prev.some((x) => x.id === data.id) ? prev : [data as Message, ...prev]));
  }

  async function sendText(deliverAt?: Date) {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    room.stopTyping();
    try {
      if (editing) {
        const { error: err } = await supabase.rpc('edit_message', { p_id: editing.id, p_body: body });
        if (err) throw err;
        const id = editing.id;
        setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, body, edited_at: new Date().toISOString() } : x)));
        setEditing(null);
      } else {
        await send(body, null, deliverAt);
      }
    } catch (e) {
      setText(body);
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  async function sendSticker(sticker: string) {
    setStickers(false);
    setError('');
    const { data, error: err } = await supabase.from('messages').insert({ couple_id: couple.id, sticker, reply_to: replyTo?.id ?? null }).select().single();
    if (err) return setError(friendlyError(err));
    setReplyTo(null);
    setMessages((prev) => sortMessages(prev.some((x) => x.id === data.id) ? prev : [data as Message, ...prev]));
  }

  async function startVoice() {
    setError('');
    const perm = await whileAway(() => requestRecordingPermissionsAsync()).catch(() => null);
    if (!perm?.granted) {
      return setError(
        perm && !perm.canAskAgain
          ? 'The microphone is off for Love Birds. Turn it on in your phone\'s settings to send voice notes.'
          : 'Allow the microphone to record a voice note.',
      );
    }
    voice.pause();
    room.stopTyping();
    setRecording(true);
  }

  async function sendVoice(uri: string, ms: number): Promise<boolean> {
    setError('');
    try {
      const path = await uploadVoiceNote(couple.id, uri);
      const { data, error: err } = await supabase
        .from('messages')
        .insert({ couple_id: couple.id, audio_path: path, audio_ms: Math.round(ms), reply_to: replyTo?.id ?? null })
        .select()
        .single();
      if (err) throw err;
      deleteRecording(uri);
      setReplyTo(null);
      setRecording(false);
      setMessages((prev) => sortMessages(prev.some((x) => x.id === data.id) ? prev : [data as Message, ...prev]));
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    }
  }

  async function sendPhoto() {
    const photo = await pickPhoto();
    if (!photo) return;
    setSending(true);
    try {
      const path = await uploadPhoto(couple.id, photo);
      await send(null, path);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  async function toggleHeart(m: Message) {
    if (m.unsent_at) return;
    if (!m.hearted) room.sendHearts();
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, hearted: !m.hearted } : x)));
    await supabase.from('messages').update({ hearted: !m.hearted }).eq('id', m.id);
  }

  // One tap opens a photo; two quick taps send a heart.
  function tap(m: Message) {
    const at = now();
    const last = lastTap.current;
    if (last.id === m.id && at - last.at < 300) {
      if (last.timer) clearTimeout(last.timer);
      lastTap.current = { id: '', at: 0, timer: null };
      toggleHeart(m);
      return;
    }
    if (last.timer) clearTimeout(last.timer);
    const timer = m.image_path
      ? setTimeout(() => {
          const start = photos.findIndex((p) => p.path === m.image_path);
          if (start >= 0) setViewer({ photos, start });
        }, 300)
      : null;
    lastTap.current = { id: m.id, at, timer };
  }

  async function react(m: Message, emoji: string | null) {
    setMenu(null);
    if (!userId) return;
    const mine = reactions.get(m.id)?.find((r) => r.user_id === userId)?.emoji ?? null;
    const next = mine === emoji ? null : emoji;
    setReactions((prev) => {
      const map = new Map(prev);
      const list = (map.get(m.id) ?? []).filter((r) => r.user_id !== userId);
      map.set(m.id, next ? [...list, { message_id: m.id, user_id: userId, emoji: next, updated_at: new Date().toISOString() }] : list);
      return map;
    });
    if (next) room.sendHearts(next);
    const { error: err } = await supabase.rpc('react_to_message', { p_message: m.id, p_emoji: next });
    if (err) {
      setError(friendlyError(err));
      load();
    }
  }

  async function unsend(m: Message) {
    setMenu(null);
    if (voice.current === m.id) voice.pause();
    const { error: err } = await supabase.rpc('unsend_message', { p_id: m.id });
    if (err) return setError(friendlyError(err));
    if (waiting(m)) setMessages((prev) => prev.filter((x) => x.id !== m.id));
    else setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, unsent_at: new Date().toISOString(), body: null, image_path: null, audio_path: null, hearted: false } : x)));
  }

  function startEdit(m: Message) {
    setMenu(null);
    setReplyTo(null);
    setEditing(m);
    setText(m.body ?? '');
    setTimeout(() => input.current?.focus(), 150);
  }

  function startReply(m: Message) {
    setMenu(null);
    setEditing(null);
    setReplyTo(m);
    setTimeout(() => input.current?.focus(), 150);
  }

  /** Loads the next batch of earlier messages, when you scroll to the top of the chat. */
  async function loadEarlier() {
    if (!coupleId || !hasEarlier || !messages.length || loadingEarlier.current) return;
    loadingEarlier.current = true;
    setEarlierFailed(false);
    const { data, error: err } = await supabase
      .from('messages')
      .select('*')
      .eq('couple_id', coupleId)
      .lt('created_at', oldestWritten(messages))
      .order('created_at', { ascending: false })
      .limit(EARLIER);
    loadingEarlier.current = false;
    if (err) return setEarlierFailed(true);
    const earlier = (data ?? []) as Message[];
    if (earlier.length < EARLIER) setHasEarlier(false);
    if (!earlier.length) return;
    setMessages((prev) => {
      const have = new Set(prev.map((m) => m.id));
      return sortMessages([...prev, ...earlier.filter((m) => !have.has(m.id))]);
    });
    const have = new Set([...messages.map((m) => m.id), ...earlier.map((m) => m.id), ...farQuotes.keys()]);
    const quoted = await fetchQuoted(coupleId, earlier, have);
    if (quoted.length) setFarQuotes((prev) => new Map([...prev, ...quoted.map((m) => [m.id, m] as const)]));
  }

  /** Tapping the quote on a reply shows what it answers: a photo opens, anything else is scrolled to and glows. */
  function openQuoted(q: Message) {
    if (q.image_path) {
      const start = photos.findIndex((p) => p.path === q.image_path);
      setViewer(start >= 0 ? { photos, start } : { photos: [viewerPhoto(q)], start: 0 });
      return;
    }
    const index = messages.findIndex((x) => x.id === q.id);
    if (index < 0) return;
    jumpTries.current = 0;
    listRef.current?.scrollToIndex({ index, animated: !reduced, viewPosition: 0.5 });
    setFlashId(q.id);
    glow.stopAnimation();
    glow.setValue(0);
    Animated.sequence([
      Animated.delay(reduced ? 0 : 350),
      Animated.timing(glow, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(800),
      Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setFlashId(null);
    });
  }

  function scheduleAt(at: Date) {
    if (at.getTime() < now() + 60_000) return setError('Pick a time in the future.');
    setScheduling(false);
    setPickDay(null);
    setPickTime(null);
    sendText(at);
  }

  const lastMineId = messages.find((m) => m.sender_id === userId && !waiting(m))?.id;
  const status = room.partnerTyping ? 'typing…' : room.partnerOnline ? 'Here now' : 'Just the two of you';
  const menuMine = menu?.sender_id === userId;
  const menuEditable = !!menu && menuMine && changeable(menu);
  const myReaction = menu ? (reactions.get(menu.id)?.find((r) => r.user_id === userId)?.emoji ?? null) : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <Pressable
          onPress={() => setCardOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${partner.name}'s profile`}
          style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.75 : 1 })}>
          <View>
            <Avatar name={partner.name} partner size={40} />
            {room.partnerOnline && (
              <View style={{ position: 'absolute', right: 1, bottom: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#2BB673', borderWidth: 2, borderColor: c.page }} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <T variant="strong" style={{ fontSize: 18 }}>
              {partner.name}
            </T>
            <T variant="fine" color={room.partnerTyping || room.partnerOnline ? c.accent : undefined}>
              {status}
            </T>
          </View>
        </Pressable>
        <IconButton label="Search and saved messages" onPress={() => router.push('/chat-search')}>
          <Glyph name="search" color={c.ink} />
        </IconButton>
        <View>
          <IconButton label={sealed ? `Open-when letters, ${sealed} sealed for you` : 'Open-when letters'} onPress={() => router.push('/letters')}>
            <Glyph name="mail" color={c.ink} />
          </IconButton>
          {sealed > 0 && (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', right: 0, top: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <T variant="fine" color={c.onAccent} style={{ fontWeight: '800', lineHeight: 15 }}>
                {sealed}
              </T>
            </View>
          )}
        </View>
      </Row>
      {!profile.bubble && (
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.lg, marginTop: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.accentSoft }}>
          <T style={{ fontSize: 18 }}>💖🌹</T>
          <T variant="small" style={{ flex: 1 }}>
            Pick your chat bubble: fuchsia with hearts, or vines and roses. Tap to choose.
          </T>
        </Pressable>
      )}
      {/*
        On iPhone the tab bar floats over the screen, so the composer leaves room for it, and that room
        can sit behind the keyboard too. On Android the screen already ends above the tab bar, so the
        composer sits right on it (tabBarInset is 0) and the message box rests just above the keyboard.
      */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={-tabBarInset}>
        <FlatList
          ref={listRef}
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          onScrollToIndexFailed={(info) => {
            // Messages have different heights, so one far up may not be measured yet: go near it, then try again.
            if (jumpTries.current++ > 3) return;
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
            setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: !reduced, viewPosition: 0.5 }), 120);
          }}
          contentContainerStyle={{ padding: space.lg, gap: 6 }}
          keyboardShouldPersistTaps="handled"
          extraData={listExtra}
          // The list is upside down, so its end is the top of the chat: earlier messages load as you get near it.
          onEndReached={loadEarlier}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            hasEarlier && messages.length ? (
              <View style={{ alignItems: 'center', paddingVertical: space.md }}>
                {earlierFailed ? (
                  <Pressable onPress={loadEarlier} accessibilityRole="button" style={({ pressed }) => ({ padding: space.sm, opacity: pressed ? 0.6 : 1 })}>
                    <T variant="small" accent>
                      Couldn’t load earlier messages. Tap to try again.
                    </T>
                  </Pressable>
                ) : (
                  <ActivityIndicator color={c.accent} accessibilityLabel="Loading earlier messages" />
                )}
              </View>
            ) : (
              <T variant="fine" style={{ textAlign: 'center', marginBottom: space.md }}>
                Double tap a message to send a heart. Hold it for more. Swipe right to reply.
              </T>
            )
          }
          ListEmptyComponent={
            <T muted style={{ textAlign: 'center', marginTop: space.xl, transform: [{ scaleY: -1 }] }}>
              Say hi to {partner.name}. Only the two of you can read this chat.
            </T>
          }
          renderItem={({ item: m, index }) => {
            const mine = m.sender_id === userId;
            const unsent = !!m.unsent_at;
            const isSticker = !!m.sticker && !unsent;
            const look = unsent || isSticker ? null : ((mine ? profile.bubble : partner.bubble) ?? null);
            const onAccent = mine && !unsent && !isSticker;
            const textColor = look ? bubbleInk(look, dark).text : onAccent ? c.onAccent : c.ink;
            const fineColor = look ? bubbleInk(look, dark).fine : onAccent ? c.onAccent : c.muted;
            const quoted = m.reply_to ? (byId.get(m.reply_to) ?? farQuotes.get(m.reply_to)) : undefined;
            const quotedWho = quoted ? (quoted.sender_id === userId ? 'You' : partner.name) : null;
            const quotedPhoto = quoted && !quoted.unsent_at ? quoted.image_path : null;
            // A quoted photo always opens. Anything else can be scrolled to while it's in the list.
            const canOpenQuote = !!quoted && !quoted.unsent_at && (!!quotedPhoto || byId.has(quoted.id));
            const content = unsent ? (
              <T color={c.muted} style={{ paddingHorizontal: 14, paddingVertical: 10, fontStyle: 'italic' }}>
                {mine ? 'You unsent a message' : `${partner.name} unsent a message`}
              </T>
            ) : (
              <>
                {m.reply_to && (
                  <Pressable
                    onPress={() => quoted && openQuoted(quoted)}
                    onLongPress={() => setMenu(m)}
                    delayLongPress={350}
                    disabled={!canOpenQuote}
                    accessibilityRole={canOpenQuote ? 'button' : undefined}
                    accessibilityLabel={`In reply to ${quotedWho ?? 'a message'}: ${snippet(quoted)}`}
                    accessibilityHint={canOpenQuote ? (quotedPhoto ? 'Opens the photo' : 'Shows that message') : undefined}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      marginHorizontal: 8,
                      marginTop: 8,
                      paddingLeft: 10,
                      paddingRight: quotedPhoto ? 6 : 10,
                      paddingVertical: 6,
                      borderLeftWidth: 3,
                      borderLeftColor: onAccent && !look ? c.onAccent : c.accent,
                      borderRadius: 8,
                      backgroundColor: 'rgba(127,127,127,0.15)',
                      opacity: pressed ? 0.7 : 1,
                    })}>
                    <View style={{ flexGrow: 1, flexShrink: 1 }}>
                      {quotedWho ? (
                        <T variant="fine" color={fineColor} style={{ fontWeight: '700' }}>
                          {quotedWho}
                        </T>
                      ) : null}
                      <T variant="small" color={textColor} numberOfLines={2}>
                        {snippet(quoted)}
                      </T>
                    </View>
                    {quotedPhoto ? <Photo path={quotedPhoto} label="The photo this replies to" style={{ width: 44, height: 44, borderRadius: 6 }} /> : null}
                  </Pressable>
                )}
                {m.image_path && <Photo path={m.image_path} style={{ width: 220, height: 220, borderRadius: radius.md }} />}
                {isSticker && (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
                    <StickerArt sticker={m.sticker!} />
                  </View>
                )}
                {m.audio_path ? <VoiceNote voice={voice} id={m.id} path={m.audio_path} ms={m.audio_ms} ink={textColor} fine={fineColor} /> : null}
                {m.body ? (
                  <T color={textColor} style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                    {m.body}
                  </T>
                ) : null}
              </>
            );
            const older = messages[index + 1];
            const day = toISODate(new Date(sentAt(m)));
            const newDay = !older || toISODate(new Date(sentAt(older))) !== day;
            const list = reactions.get(m.id) ?? [];
            const pending = waiting(m);
            return (
              <View style={{ gap: 2 }}>
                {newDay && (
                  <T variant="eyebrow" muted style={{ textAlign: 'center', marginVertical: space.sm }}>
                    {dayLabel(day)}
                  </T>
                )}
                <View>
                  {m.id === flashId && (
                    <Animated.View
                      pointerEvents="none"
                      style={{ position: 'absolute', left: -space.lg, right: -space.lg, top: -4, bottom: -4, backgroundColor: alpha(c.accent, dark ? 0.26 : 0.18), opacity: glow }}
                    />
                  )}
                  <SwipeToReply onReply={() => !unsent && startReply(m)}>
                    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', alignItems: mine ? 'flex-end' : 'flex-start', opacity: pending ? 0.7 : 1 }}>
                      <Pressable
                        onPress={() => tap(m)}
                        onLongPress={() => !unsent && setMenu(m)}
                        delayLongPress={350}
                        accessibilityRole="button"
                        accessibilityLabel={`${snippet(m)}. Double tap to ${m.hearted ? 'remove the heart' : 'send a heart'}. Hold for more.`}
                        style={
                          look || isSticker
                            ? undefined
                            : {
                                backgroundColor: unsent ? 'transparent' : mine ? c.accent : c.surface,
                                borderColor: unsent ? c.line : mine ? c.accent : c.line,
                                borderStyle: unsent ? 'dashed' : 'solid',
                                borderWidth: 1,
                                borderRadius: radius.lg,
                                borderBottomRightRadius: mine ? 6 : radius.lg,
                                borderBottomLeftRadius: mine ? radius.lg : 6,
                                padding: m.image_path ? 4 : 0,
                                overflow: 'hidden',
                              }
                        }>
                        {look ? (
                          <LoveBubble look={look} mine={mine}>
                            <View style={{ padding: m.image_path ? 4 : 0 }}>{content}</View>
                          </LoveBubble>
                        ) : (
                          content
                        )}
                      </Pressable>
                      {(m.hearted || list.length > 0) && (
                        <Row gap={4} style={{ marginTop: -8, marginHorizontal: 8 }}>
                          {m.hearted && (
                            <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Glyph name="heart" color={c.accent} size={12} />
                            </View>
                          )}
                          {list.map((r) => (
                            <Pressable
                              key={r.user_id}
                              onPress={() => r.user_id === userId && react(m, null)}
                              accessibilityLabel={`${r.user_id === userId ? 'You' : partner.name} reacted ${r.emoji}`}
                              style={{ backgroundColor: r.user_id === userId ? c.accentSoft : c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 }}>
                              <T style={{ fontSize: 13, lineHeight: 17 }}>{r.emoji}</T>
                            </Pressable>
                          ))}
                        </Row>
                      )}
                      <T variant="fine" style={{ marginHorizontal: 6, marginTop: 2 }}>
                        {pending ? `🕒 Sends ${whenLabel(m.deliver_at!)}` : clockLabel(sentAt(m))}
                        {m.edited_at && !unsent ? ' · edited' : ''}
                        {mine && !pending && m.id === lastMineId ? (m.read_at ? ' · Seen' : ' · Sent') : ''}
                      </T>
                    </View>
                  </SwipeToReply>
                </View>
              </View>
            );
          }}
        />
        {room.partnerTyping && (
          <T variant="small" muted style={{ paddingHorizontal: space.lg, paddingBottom: 4 }}>
            {partner.name} is typing…
          </T>
        )}
        {error ? (
          <T variant="small" color={c.danger} style={{ paddingHorizontal: space.lg }}>
            {error}
          </T>
        ) : null}
        {(replyTo || editing) && (
          <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: c.surface2, borderTopWidth: 1, borderTopColor: c.line }}>
            <Glyph name={editing ? 'edit' : 'reply'} color={c.accent} size={18} />
            <View style={{ flex: 1 }}>
              <T variant="fine" accent style={{ fontWeight: '700' }}>
                {editing ? 'Changing your message' : `Replying to ${replyTo?.sender_id === userId ? 'yourself' : partner.name}`}
              </T>
              <T variant="small" numberOfLines={1}>
                {snippet(editing ?? replyTo ?? undefined)}
              </T>
            </View>
            {!editing && replyTo?.image_path ? (
              <Photo path={replyTo.image_path} label="The photo you're replying to" style={{ width: 40, height: 40, borderRadius: 6 }} />
            ) : null}
            <IconButton
              label="Cancel"
              onPress={() => {
                if (editing) setText('');
                setEditing(null);
                setReplyTo(null);
              }}>
              <Glyph name="close" color={c.muted} size={18} />
            </IconButton>
          </Row>
        )}
        {recording ? (
          <VoiceRecorder
            onSend={sendVoice}
            onClose={(note) => {
              setRecording(false);
              if (note) setError(note);
            }}
          />
        ) : (
          <Row gap={space.sm} style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: tabBarInset + space.sm, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
            {!editing && !text.trim() && (
              <IconButton label="Send a sticker" onPress={() => setStickers(true)}>
                <Glyph name="smile" color={c.ink} />
              </IconButton>
            )}
            {!editing && (
              <IconButton label="Send a photo" onPress={sendPhoto}>
                <Glyph name="photo" color={c.ink} />
              </IconButton>
            )}
            <TextInput
              ref={input}
              value={text}
              onChangeText={(t) => {
                setText(t);
                if (t.trim()) room.typing();
              }}
              placeholder={editing ? 'Change your message' : 'Message'}
              placeholderTextColor={c.muted}
              accessibilityLabel="Message"
              multiline
              maxLength={4000}
              style={{ flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1.5, borderColor: c.line, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, backgroundColor: c.page, color: c.ink, fontSize: 16 }}
            />
            {!!text.trim() && !editing && (
              <IconButton label="Send later" onPress={() => setScheduling(true)}>
                <Glyph name="clock" color={c.ink} />
              </IconButton>
            )}
            {!editing && !text.trim() ? (
              <IconButton label="Record a voice note" accent onPress={startVoice}>
                <Glyph name="mic" color={c.onAccent} />
              </IconButton>
            ) : (
              <IconButton label={editing ? 'Save change' : 'Send'} accent onPress={() => sendText()}>
                <Glyph name={editing ? 'check' : 'send'} color={c.onAccent} />
              </IconButton>
            )}
          </Row>
        )}
      </KeyboardAvoidingView>

      <Sheet open={!!menu} onClose={() => setMenu(null)}>
        {menu && (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              {REACTIONS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => react(menu, e)}
                  accessibilityRole="button"
                  accessibilityLabel={`React ${e}`}
                  accessibilityState={{ selected: myReaction === e }}
                  style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: myReaction === e ? c.accentSoft : c.surface }}>
                  <T style={{ fontSize: 24, lineHeight: 30 }}>{e}</T>
                </Pressable>
              ))}
            </Row>
            <View>
              <MenuRow icon="reply" label="Reply" onPress={() => startReply(menu)} />
              {menu.body ? (
                <MenuRow
                  icon="copy"
                  label="Copy"
                  onPress={() => {
                    Clipboard.setStringAsync(menu.body ?? '').catch(() => {});
                    setMenu(null);
                  }}
                />
              ) : null}
              {menuEditable && menu.body ? <MenuRow icon="edit" label="Change message" onPress={() => startEdit(menu)} /> : null}
              {menuEditable ? <MenuRow icon="trash" label={waiting(menu) ? 'Cancel sending' : 'Unsend'} danger onPress={() => unsend(menu)} /> : null}
            </View>
            {menuMine && !menuEditable ? <T variant="fine">You can change or unsend a message for 15 minutes after sending it.</T> : null}
          </>
        )}
      </Sheet>

      <Sheet open={scheduling} onClose={() => setScheduling(false)}>
        <T variant="heading">Send later</T>
        <T variant="small" muted>
          {partner.name} gets it at the time you pick, with a notification. Until then only you can see it.
        </T>
        {scheduleOptions().map((o) => (
          <Button key={o.label} title={o.label} variant="outline" onPress={() => scheduleAt(o.at)} />
        ))}
        <Row style={{ alignItems: 'flex-start' }}>
          <DateField label="Another day" value={pickDay} onChange={setPickDay} minimumDate={today()} />
          <DateField label="Time" value={pickTime} onChange={setPickTime} mode="time" />
        </Row>
        {pickDay && pickTime && (
          <Button
            title={`Send ${dayLabel(pickDay)} at ${pickTime.slice(0, 5)}`}
            onPress={() => {
              const [h, mi] = pickTime.split(':').map(Number);
              const [y, mo, d] = pickDay.split('-').map(Number);
              scheduleAt(new Date(y, mo - 1, d, h, mi, 0, 0));
            }}
          />
        )}
      </Sheet>

      <StickerPicker open={stickers} onClose={() => setStickers(false)} onPick={sendSticker} animal={profile.animal} />
      <PhotoViewer photos={viewer?.photos ?? []} start={viewer ? viewer.start : null} onClose={() => setViewer(null)} />
      <PartnerCard open={cardOpen} onClose={() => setCardOpen(false)} />
    </SafeAreaView>
  );
}
