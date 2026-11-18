import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/game-ui';
import { Button, Card, ErrorText, Field, Glyph, Row, Sheet, T } from '@/components/ui';
import { BUCKET_IDEAS } from '@/content/bucket';
import { shortDate, toISODate, today } from '@/lib/dates';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { loadBucket } from '@/lib/together';
import { radius, space, useColors } from '@/lib/theme';
import type { BucketItem } from '@/lib/types';

const EMOJIS = ['✨', '✈️', '🏝️', '🏔️', '🦒', '🎈', '🐠', '🏕️', '🍷', '🍰', '💃', '🎤', '📸', '🚂', '🌍', '❤️'];

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
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? c.accentSoft : c.surface,
              borderWidth: 1.5,
              borderColor: on ? c.accent : c.line,
            }}>
            <T style={{ fontSize: 22, lineHeight: 28 }}>{e}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ItemRow({ item, onPress }: { item: BucketItem; onPress: () => void }) {
  const c = useColors();
  const done = !!item.done_on;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${done ? `, done ${shortDate(item.done_on!)}` : ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: done ? c.accentSoft : c.surface,
        borderWidth: 1,
        borderColor: done ? 'transparent' : c.line,
        opacity: pressed ? 0.8 : 1,
      })}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: done ? c.surface : c.surface2,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <T style={{ fontSize: 22, lineHeight: 28 }}>{item.emoji || '✨'}</T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="strong">{item.title}</T>
        {done && (
          <T variant="small" accent style={{ fontWeight: '700' }}>
            ✓ Done {shortDate(item.done_on!)}
            {item.memory_id ? ' · in Memories' : ''}
          </T>
        )}
      </View>
      <Glyph name="next" color={c.muted} size={18} />
    </Pressable>
  );
}

export default function BucketList() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const [items, setItems] = useState<BucketItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [allIdeas, setAllIdeas] = useState(false);
  const [open, setOpen] = useState<BucketItem | null>(null);
  const [mode, setMode] = useState<'menu' | 'edit' | 'remove' | 'celebrate'>('menu');
  const [editTitle, setEditTitle] = useState('');
  const [editEmoji, setEditEmoji] = useState('✨');

  const load = useCallback(async () => {
    if (!coupleId) return;
    setItems(await loadBucket(coupleId));
    setLoaded(true);
  }, [coupleId]);

  // Reloads when you come back from adding a memory, too.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`bucket:${coupleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bucket_items',
          filter: `couple_id=eq.${coupleId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  if (!ctx || !coupleId) return null;
  const { partner } = ctx;
  const todo = items.filter((i) => !i.done_on);
  const done = items.filter((i) => i.done_on).sort((a, b) => b.done_on!.localeCompare(a.done_on!));
  const have = new Set(items.map((i) => i.title.trim().toLowerCase()));
  const ideas = BUCKET_IDEAS.filter((i) => !have.has(i.title.toLowerCase()));

  async function add(t: string, e: string) {
    setError('');
    if (!t.trim()) return setError('Give your dream a name.');
    setBusy(true);
    const { error: err } = await supabase.from('bucket_items').insert({ couple_id: coupleId, title: t.trim().slice(0, 120), emoji: e });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setTitle('');
    setEmoji('✨');
    load();
  }

  async function update(item: BucketItem, changes: Partial<Pick<BucketItem, 'title' | 'emoji' | 'done_on'>>) {
    setBusy(true);
    const { error: err } = await supabase.from('bucket_items').update(changes).eq('id', item.id);
    setBusy(false);
    if (err) {
      setError(friendlyError(err));
      return false;
    }
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, ...changes } : i)));
    return true;
  }

  async function remove(item: BucketItem) {
    setBusy(true);
    const { error: err } = await supabase.from('bucket_items').delete().eq('id', item.id);
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setItems((list) => list.filter((i) => i.id !== item.id));
    close();
  }

  // Ideas sit up top while the list is short, then move below it.
  const ideasLast = items.length >= 3;
  const ideasBlock = ideas.length > 0 && (
    <View style={{ gap: space.sm }}>
      <T variant="eyebrow">Ideas to start with</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {(allIdeas ? ideas : ideas.slice(0, 6)).map((i) => (
          <Pressable
            key={i.title}
            onPress={() => add(i.title, i.emoji)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${i.title}`}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: radius.pill,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.line,
              opacity: pressed ? 0.7 : 1,
            })}>
            <T variant="small" style={{ fontWeight: '700' }}>
              + {i.emoji} {i.title}
            </T>
          </Pressable>
        ))}
      </View>
      {ideas.length > 6 && (
        <Pressable onPress={() => setAllIdeas((v) => !v)} accessibilityRole="button" hitSlop={8}>
          <T variant="small" accent style={{ fontWeight: '700' }}>
            {allIdeas ? 'Fewer ideas' : `${ideas.length - 6} more ideas`}
          </T>
        </Pressable>
      )}
    </View>
  );

  function show(item: BucketItem) {
    setOpen(item);
    setMode('menu');
    setEditTitle(item.title);
    setEditEmoji(item.emoji || '✨');
  }

  function close() {
    setOpen(null);
    setMode('menu');
  }

  function addMemory(item: BucketItem) {
    close();
    router.push({
      pathname: '/new-memory',
      params: {
        caption: item.title,
        day: item.done_on ?? toISODate(today()),
        bucket: item.id,
      },
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <BackHeader title="Bucket list" home="/together" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={{
            padding: space.lg,
            paddingTop: space.sm,
            gap: space.lg,
          }}
          keyboardShouldPersistTaps="handled">
          <Card style={{ gap: space.md }}>
            <Field
              label="Add a dream"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Watch the wildebeest crossing"
              maxLength={120}
              returnKeyType="done"
              onSubmitEditing={() => add(title, emoji)}
            />
            <EmojiRow value={emoji} onChange={setEmoji} />
            <ErrorText>{error}</ErrorText>
            <Button
              title="Add to our list"
              onPress={() => add(title, emoji)}
              loading={busy && !open}
              disabled={!title.trim()}
              icon={<Glyph name="plus" color={c.onAccent} size={18} />}
            />
          </Card>

          {!ideasLast && ideasBlock}

          <View style={{ gap: space.sm }}>
            <T variant="eyebrow">{todo.length ? `To do · ${todo.length}` : 'To do'}</T>
            {todo.map((i) => (
              <ItemRow key={i.id} item={i} onPress={() => show(i)} />
            ))}
            {loaded && !todo.length && (
              <T variant="small" muted>
                {done.length ? 'Everything ticked off. Time to dream up some more.' : `Add the first thing you and ${partner.name} want to do one day.`}
              </T>
            )}
          </View>

          {done.length > 0 && (
            <View style={{ gap: space.sm }}>
              <T variant="eyebrow">Done together · {done.length} 🎉</T>
              {done.map((i) => (
                <ItemRow key={i.id} item={i} onPress={() => show(i)} />
              ))}
            </View>
          )}
          {ideasLast && ideasBlock}
          <T variant="fine" style={{ textAlign: 'center' }}>
            You both see and change this list. Tap a dream to tick it off.
          </T>
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet open={!!open} onClose={close}>
        {open && mode === 'menu' && (
          <>
            <Row gap={space.md}>
              <T style={{ fontSize: 30, lineHeight: 36 }}>{open.emoji || '✨'}</T>
              <T variant="heading" style={{ flex: 1 }}>
                {open.title}
              </T>
            </Row>
            {!open.done_on ? (
              <Button
                title="We did it! 🎉"
                loading={busy}
                onPress={async () => {
                  const day = toISODate(today());
                  if (await update(open, { done_on: day })) {
                    setOpen({ ...open, done_on: day });
                    setMode('celebrate');
                  }
                }}
              />
            ) : (
              <>
                {!open.memory_id && (
                  <Button title="Add a memory of it" onPress={() => addMemory(open)} icon={<Glyph name="photo" color={c.onAccent} size={18} />} />
                )}
                {!!open.memory_id && (
                  <Button
                    title="See it in Memories"
                    variant="outline"
                    onPress={() => {
                      close();
                      router.push('/memories');
                    }}
                  />
                )}
                <Button
                  title="Not done yet"
                  variant="outline"
                  disabled={busy}
                  onPress={async () => {
                    if (await update(open, { done_on: null })) close();
                  }}
                />
              </>
            )}
            <Row>
              <Button style={{ flex: 1 }} title="Change it" variant="outline" onPress={() => setMode('edit')} />
              <Button style={{ flex: 1 }} title="Remove" variant="outline" onPress={() => setMode('remove')} />
            </Row>
          </>
        )}
        {open && mode === 'celebrate' && (
          <>
            <T style={{ fontSize: 44, lineHeight: 52, textAlign: 'center' }}>🎉</T>
            <T variant="heading" style={{ textAlign: 'center' }}>
              Ticked off: {open.title}
            </T>
            <T variant="small" muted style={{ textAlign: 'center' }}>
              Add a photo and a few words so you never forget it. {partner.name} gets a notification either way.
            </T>
            <Button title="Add a memory" onPress={() => addMemory(open)} icon={<Glyph name="photo" color={c.onAccent} size={18} />} />
            <Button title="Later" variant="ghost" onPress={close} />
          </>
        )}
        {open && mode === 'edit' && (
          <>
            <Field label="Dream" value={editTitle} onChangeText={setEditTitle} maxLength={120} autoFocus />
            <EmojiRow value={editEmoji} onChange={setEditEmoji} />
            <Row>
              <Button style={{ flex: 1 }} title="Cancel" variant="outline" onPress={() => setMode('menu')} />
              <Button
                style={{ flex: 1 }}
                title="Save"
                loading={busy}
                disabled={!editTitle.trim()}
                onPress={async () => {
                  if (
                    await update(open, {
                      title: editTitle.trim(),
                      emoji: editEmoji,
                    })
                  )
                    close();
                }}
              />
            </Row>
          </>
        )}
        {open && mode === 'remove' && (
          <>
            <T variant="heading">Remove “{open.title}”?</T>
            <T variant="small" muted>
              It goes from both your lists. {open.memory_id ? 'Its memory stays in Memories.' : ''}
            </T>
            <Row>
              <Button style={{ flex: 1 }} title="Keep it" variant="outline" onPress={() => setMode('menu')} />
              <Button style={{ flex: 1 }} title="Remove" variant="danger" loading={busy} onPress={() => remove(open)} />
            </Row>
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}
