import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { bubbleInk, LoveBubble } from '@/components/love-bubble';
import { Photo } from '@/components/photo';
import { Avatar, Glyph, IconButton, Row, T } from '@/components/ui';
import { clockLabel, dayLabel, toISODate } from '@/lib/dates';
import { setChatOpen } from '@/lib/notifications';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, tabBarInset, useColors } from '@/lib/theme';
import type { Message } from '@/lib/types';

export default function Chat() {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const focused = useRef(false);

  const markRead = useCallback(async () => {
    if (!coupleId || !userId) return;
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('couple_id', coupleId).neq('sender_id', userId).is('read_at', null);
  }, [coupleId, userId]);

  const load = useCallback(async () => {
    if (!coupleId) return;
    const { data } = await supabase.from('messages').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(200);
    setMessages((data ?? []) as Message[]);
  }, [coupleId]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setChatOpen(true);
      load().then(markRead);
      return () => {
        focused.current = false;
        setChatOpen(false);
      };
    }, [load, markRead]),
  );

  // Live updates: new messages, hearts and read receipts.
  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`messages:${coupleId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
        if (focused.current && m.sender_id !== userId) markRead();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, userId, markRead]);

  if (!ctx) return null;
  const { partner, couple, profile } = ctx;

  async function send(body: string | null, imagePath: string | null) {
    setError('');
    const { data, error: err } = await supabase
      .from('messages')
      .insert({ couple_id: couple.id, body, image_path: imagePath })
      .select()
      .single();
    if (err) throw err;
    setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [data as Message, ...prev]));
  }

  async function sendText() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      await send(body, null);
    } catch (e) {
      setText(body);
      setError(friendlyError(e));
    } finally {
      setSending(false);
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
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, hearted: !m.hearted } : x)));
    await supabase.from('messages').update({ hearted: !m.hearted }).eq('id', m.id);
  }

  const lastMineId = messages.find((m) => m.sender_id === userId)?.id;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.page }}>
      <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <Avatar name={partner.name} partner size={40} />
        <View>
          <T variant="strong" style={{ fontSize: 18 }}>
            {partner.name}
          </T>
          <T variant="fine">Just the two of you</T>
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
        The keyboard covers the tab bar, so the composer's tab bar padding can sit behind it too.
        That way the message box rests just above the keyboard rather than a tab bar's height above it.
      */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={-tabBarInset}>
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.lg, gap: 6 }}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            <T variant="fine" style={{ textAlign: 'center', marginBottom: space.md }}>
              Tap a message to send a heart
            </T>
          }
          ListEmptyComponent={
            <T muted style={{ textAlign: 'center', marginTop: space.xl, transform: [{ scaleY: -1 }] }}>
              Say hi to {partner.name}. Only the two of you can read this chat.
            </T>
          }
          renderItem={({ item: m, index }) => {
            const mine = m.sender_id === userId;
            const look = (mine ? profile.bubble : partner.bubble) ?? null;
            const textColor = look ? bubbleInk(look, dark).text : mine ? c.onAccent : c.ink;
            const content = (
              <>
                {m.image_path && <Photo path={m.image_path} style={{ width: 220, height: 220, borderRadius: radius.md }} />}
                {m.body ? (
                  <T color={textColor} style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                    {m.body}
                  </T>
                ) : null}
              </>
            );
            const older = messages[index + 1];
            const newDay = !older || toISODate(new Date(older.created_at)) !== toISODate(new Date(m.created_at));
            return (
              <View style={{ gap: 2 }}>
                {newDay && (
                  <T variant="eyebrow" muted style={{ textAlign: 'center', marginVertical: space.sm }}>
                    {dayLabel(toISODate(new Date(m.created_at)))}
                  </T>
                )}
                <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  <Pressable
                    onPress={() => toggleHeart(m)}
                    accessibilityRole="button"
                    accessibilityLabel={`${m.body ?? 'Photo'}. ${m.hearted ? 'Remove heart' : 'Send a heart'}`}
                    style={
                      look
                        ? undefined
                        : {
                            backgroundColor: mine ? c.accent : c.surface,
                            borderColor: mine ? c.accent : c.line,
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
                  {m.hearted && (
                    <View style={{ marginTop: -8, marginHorizontal: 8, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Glyph name="heart" color={c.accent} size={12} />
                    </View>
                  )}
                  <T variant="fine" style={{ marginHorizontal: 6, marginTop: 2 }}>
                    {clockLabel(m.created_at)}
                    {mine && m.id === lastMineId ? (m.read_at ? ' · Seen' : ' · Sent') : ''}
                  </T>
                </View>
              </View>
            );
          }}
        />
        {error ? (
          <T variant="small" color={c.danger} style={{ paddingHorizontal: space.lg }}>
            {error}
          </T>
        ) : null}
        <Row gap={space.sm} style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: tabBarInset + space.sm, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
          <IconButton label="Send a photo" onPress={sendPhoto}>
            <Glyph name="photo" color={c.ink} />
          </IconButton>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={c.muted}
            accessibilityLabel="Message"
            multiline
            maxLength={4000}
            style={{ flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1.5, borderColor: c.line, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, backgroundColor: c.page, color: c.ink, fontSize: 16 }}
          />
          <IconButton label="Send" accent onPress={sendText}>
            <Glyph name="send" color={c.onAccent} />
          </IconButton>
        </Row>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
