import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Photo } from '@/components/photo';
import { Empty, Glyph, IconButton, Row, T } from '@/components/ui';
import { parseISODate, shortDate } from '@/lib/dates';
import { useCouple } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, tabBarInset, useColors } from '@/lib/theme';
import type { Memory } from '@/lib/types';

const monthOf = (iso: string) => parseISODate(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export default function Memories() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loaded, setLoaded] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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
  const { userId, partner } = ctx;

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

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.page }}>
      <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, justifyContent: 'space-between' }}>
        <T variant="title">Memories</T>
        <IconButton label="Add a memory" accent onPress={() => router.push('/new-memory')}>
          <Glyph name="plus" color={c.onAccent} />
        </IconButton>
      </Row>
      <FlatList
        data={memories}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: tabBarInset + space.xl, gap: space.md }}
        ListEmptyComponent={loaded ? <Empty>No memories yet. Tap + to save your first one together.</Empty> : undefined}
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
                {m.photo_path && <Photo path={m.photo_path} style={{ width: '100%', aspectRatio: 4 / 3 }} label={m.caption} />}
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
    </SafeAreaView>
  );
}
