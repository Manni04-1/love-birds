import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/game-ui';
import { Button, ErrorText, Glyph, IconButton, Row, T } from '@/components/ui';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import type { ListItem, ListName } from '@/lib/types';

const LISTS: { key: ListName; emoji: string; label: string; placeholder: string; empty: string }[] = [
  { key: 'groceries', emoji: '🛒', label: 'Shopping', placeholder: 'Milk, bread, flowers for me…', empty: 'Nothing to buy. Add what you need and whoever is at the shops ticks it off.' },
  { key: 'todo', emoji: '✅', label: 'To-dos', placeholder: 'Pay the rent, book the cake…', empty: 'Nothing to do. Enjoy it while it lasts.' },
  { key: 'watch', emoji: '🍿', label: 'Watchlist', placeholder: 'A film or series to watch together', empty: 'Add films and series you want to watch together. They show up in Tonight when you decide what to watch.' },
];

const isList = (v: unknown): v is ListName => LISTS.some((l) => l.key === v);

function ItemRow({ item, onToggle, onRemove, who }: { item: ListItem; onToggle: () => void; onRemove: () => void; who: string }) {
  const c = useColors();
  const done = !!item.done_at;
  return (
    <Pressable
      onPress={onToggle}
      onLongPress={onRemove}
      delayLongPress={400}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={item.text}
      accessibilityHint="Hold to remove"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: 12,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.line,
        opacity: pressed ? 0.75 : done ? 0.65 : 1,
      })}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: done ? c.accent : c.line,
          backgroundColor: done ? c.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {done && <Glyph name="check" color={c.onAccent} size={16} />}
      </View>
      <View style={{ flex: 1 }}>
        <T style={done ? { textDecorationLine: 'line-through' } : undefined} color={done ? c.muted : c.ink}>
          {item.text}
        </T>
        <T variant="fine">{who}</T>
      </View>
    </Pressable>
  );
}

/** Shared lists: shopping, to-dos and a watchlist. You both see and tick them off, live. */
export default function Lists() {
  const c = useColors();
  const ctx = useCouple();
  const params = useLocalSearchParams<{ list?: string }>();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const [list, setList] = useState<ListName>(isList(params.list) ? params.list : 'groceries');
  const [linked, setLinked] = useState(params.list);
  if (params.list !== linked) {
    setLinked(params.list);
    if (isList(params.list)) setList(params.list);
  }
  const [items, setItems] = useState<ListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  const load = useCallback(async () => {
    if (!coupleId) return;
    const { data, error: err } = await supabase.from('list_items').select('*').eq('couple_id', coupleId).order('created_at', { ascending: true }).limit(1000);
    if (err) setError(friendlyError(err));
    setItems((data ?? []) as ListItem[]);
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
      .channel(`lists:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  if (!ctx || !coupleId || !userId) return null;
  const { partner } = ctx;
  const info = LISTS.find((l) => l.key === list)!;
  const here = items.filter((i) => i.list === list);
  const todo = here.filter((i) => !i.done_at);
  const done = here.filter((i) => i.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!));
  const counts = Object.fromEntries(LISTS.map((l) => [l.key, items.filter((i) => i.list === l.key && !i.done_at).length])) as Record<ListName, number>;
  const name = (id: string | null) => (id === userId ? 'You' : partner.name);

  async function add() {
    const t = text.trim().slice(0, 200);
    if (!t) return;
    setError('');
    setText('');
    const { data, error: err } = await supabase.from('list_items').insert({ couple_id: coupleId, list, text: t }).select().single();
    if (err) {
      setText(t);
      return setError(friendlyError(err));
    }
    setItems((prev) => (prev.some((i) => i.id === data.id) ? prev : [...prev, data as ListItem]));
    setTimeout(() => input.current?.focus(), 50);
  }

  async function toggle(item: ListItem) {
    const changes = item.done_at ? { done_at: null, done_by: null } : { done_at: new Date().toISOString(), done_by: userId ?? null };
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...changes } : i)));
    const { error: err } = await supabase.from('list_items').update(changes).eq('id', item.id);
    if (err) {
      setError(friendlyError(err));
      load();
    }
  }

  function remove(item: ListItem) {
    Alert.alert(`Remove “${item.text}”?`, 'It goes from both your lists.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setItems((prev) => prev.filter((i) => i.id !== item.id));
          const { error: err } = await supabase.from('list_items').delete().eq('id', item.id);
          if (err) {
            setError(friendlyError(err));
            load();
          }
        },
      },
    ]);
  }

  async function clearDone() {
    const ids = done.map((i) => i.id);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    const { error: err } = await supabase.from('list_items').delete().in('id', ids);
    if (err) {
      setError(friendlyError(err));
      load();
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <BackHeader title="Our lists" home="/together" />
      <Row gap={0} style={{ marginHorizontal: space.lg, backgroundColor: c.surface2, borderRadius: radius.pill, padding: 3 }}>
        {LISTS.map((l) => {
          const on = l.key === list;
          return (
            <Pressable
              key={l.key}
              onPress={() => setList(l.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill, backgroundColor: on ? c.surface : 'transparent' }}>
              <T variant="small" style={{ fontWeight: '700' }} color={on ? c.accent : c.muted} numberOfLines={1}>
                {l.emoji} {l.label}
                {counts[l.key] ? ` · ${counts[l.key]}` : ''}
              </T>
            </Pressable>
          );
        })}
      </Row>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
          {todo.map((i) => (
            <ItemRow key={i.id} item={i} who={`Added by ${name(i.created_by).replace('You', 'you')}`} onToggle={() => toggle(i)} onRemove={() => remove(i)} />
          ))}
          {loaded && !todo.length && (
            <T variant="small" muted style={{ paddingVertical: space.sm }}>
              {info.empty}
            </T>
          )}
          {done.length > 0 && (
            <>
              <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
                <T variant="eyebrow">Done · {done.length}</T>
                <Button title="Clear done" variant="ghost" onPress={clearDone} />
              </Row>
              {done.slice(0, 30).map((i) => (
                <ItemRow key={i.id} item={i} who={`Ticked off by ${name(i.done_by).replace('You', 'you')}`} onToggle={() => toggle(i)} onRemove={() => remove(i)} />
              ))}
            </>
          )}
          {list === 'watch' && todo.length >= 2 && (
            <Button title="Can't pick? Decide in Tonight" variant="outline" onPress={() => router.push('/tonight')} />
          )}
          <T variant="fine" style={{ textAlign: 'center', marginTop: space.sm }}>
            Tap to tick off. Hold to remove. {partner.name} sees changes straight away.
          </T>
        </ScrollView>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: 4, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
          <ErrorText>{error}</ErrorText>
          <Row gap={space.sm}>
            <TextInput
              ref={input}
              value={text}
              onChangeText={setText}
              placeholder={info.placeholder}
              placeholderTextColor={c.muted}
              accessibilityLabel={`Add to ${info.label}`}
              maxLength={200}
              returnKeyType="done"
              blurOnSubmit={false}
              onSubmitEditing={add}
              style={{ flex: 1, minHeight: 46, borderWidth: 1.5, borderColor: c.line, borderRadius: 23, paddingHorizontal: 16, backgroundColor: c.page, color: c.ink, fontSize: 16 }}
            />
            <IconButton label="Add" accent onPress={add}>
              <Glyph name="plus" color={c.onAccent} />
            </IconButton>
          </Row>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
