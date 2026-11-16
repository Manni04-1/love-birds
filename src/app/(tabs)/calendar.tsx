import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Empty, Glyph, IconButton, Row, T } from '@/components/ui';
import { dayLabel, monthLabel, parseISODate, timeLabel, toISODate, today } from '@/lib/dates';
import { useCouple } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, tabBarInset, useColors } from '@/lib/theme';
import type { Plan } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Calendar() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const params = useLocalSearchParams<{ day?: string }>();
  const [selected, setSelected] = useState(toISODate(today()));
  const [month, setMonth] = useState(() => new Date(today().getFullYear(), today().getMonth(), 1));
  const [plans, setPlans] = useState<Plan[]>([]);
  const [upcoming, setUpcoming] = useState<Plan[]>([]);

  // Opening the calendar from Home jumps to that plan's day.
  const [jumpedTo, setJumpedTo] = useState<string | undefined>(undefined);
  if (params.day && params.day !== jumpedTo) {
    setJumpedTo(params.day);
    setSelected(params.day);
    const d = parseISODate(params.day);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  const load = useCallback(async () => {
    if (!coupleId) return;
    const first = toISODate(month);
    const last = toISODate(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    const [inMonth, next] = await Promise.all([
      supabase.from('events').select('*').eq('couple_id', coupleId).gte('day', first).lte('day', last).order('day').order('time', { nullsFirst: true }),
      supabase.from('events').select('*').eq('couple_id', coupleId).gte('day', toISODate(today())).order('day').order('time', { nullsFirst: true }).limit(5),
    ]);
    setPlans((inMonth.data ?? []) as Plan[]);
    setUpcoming((next.data ?? []) as Plan[]);
  }, [coupleId, month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Show plans your partner adds while you're looking.
  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`events:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  const daysWithPlans = useMemo(() => new Set(plans.map((p) => p.day)), [plans]);

  if (!ctx) return null;
  const { userId, partner } = ctx;

  const lead = (month.getDay() + 6) % 7;
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => toISODate(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  while (cells.length % 7) cells.push(null);
  const todayIso = toISODate(today());
  const selectedPlans = plans.filter((p) => p.day === selected);

  function confirmDelete(p: Plan) {
    Alert.alert('Delete this plan?', `"${p.title}" will disappear for both of you.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('events').delete().eq('id', p.id);
          load();
        },
      },
    ]);
  }

  const planRow = (p: Plan, showDay: boolean) => (
    <Pressable
      key={p.id}
      onLongPress={() => confirmDelete(p)}
      accessibilityHint="Long press to delete"
      style={{ flexDirection: 'row', gap: space.md, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.md, padding: space.md }}>
      <View style={{ width: 78 }}>
        {showDay && <T variant="small" accent style={{ fontWeight: '700' }}>{dayLabel(p.day)}</T>}
        <T variant="small" accent style={{ fontWeight: '700' }}>
          {timeLabel(p.time)}
        </T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="strong">{p.title}</T>
        {p.note ? <T variant="small" muted>{p.note}</T> : null}
        <T variant="fine">{p.created_by === userId ? 'Added by you' : `Added by ${partner.name}`}</T>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.page }}>
      <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, justifyContent: 'space-between' }}>
        <T variant="title">Calendar</T>
        <IconButton label="Add a plan" accent onPress={() => router.push({ pathname: '/new-plan', params: { day: selected } })}>
          <Glyph name="plus" color={c.onAccent} />
        </IconButton>
      </Row>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: tabBarInset + space.xl, gap: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton label="Previous month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <Glyph name="prev" color={c.ink} />
          </IconButton>
          <T variant="strong" style={{ fontSize: 18 }}>
            {monthLabel(month)}
          </T>
          <IconButton label="Next month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <Glyph name="next" color={c.ink} />
          </IconButton>
        </Row>

        <View>
          <View style={{ flexDirection: 'row' }}>
            {WEEKDAYS.map((w) => (
              <T key={w} variant="eyebrow" muted style={{ flex: 1, textAlign: 'center', paddingVertical: 4 }}>
                {w}
              </T>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((iso, i) => {
              if (!iso) return <View key={`blank-${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
              const isSel = iso === selected;
              const isToday = iso === todayIso;
              const has = daysWithPlans.has(iso);
              return (
                <Pressable
                  key={iso}
                  onPress={() => setSelected(iso)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${has ? ', has plans' : ''}`}
                  style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                  <View
                    style={{
                      flex: 1,
                      borderRadius: radius.sm,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      backgroundColor: isSel ? c.accent : 'transparent',
                      borderWidth: isToday && !isSel ? 2 : 0,
                      borderColor: c.accent,
                    }}>
                    <T style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }} color={isSel ? c.onAccent : c.ink}>
                      {parseISODate(iso).getDate()}
                    </T>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: has ? (isSel ? c.onAccent : c.accent) : 'transparent' }} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <T variant="strong" style={{ marginTop: space.sm }}>
          {dayLabel(selected)}
        </T>
        {selectedPlans.length ? selectedPlans.map((p) => planRow(p, false)) : <Empty>Nothing planned. Tap + to add something for you both.</Empty>}

        <T variant="strong" style={{ marginTop: space.sm }}>
          Coming up
        </T>
        {upcoming.length ? upcoming.map((p) => planRow(p, true)) : <Empty>No plans ahead yet.</Empty>}
        <T variant="fine">Long press a plan to delete it.</T>
      </ScrollView>
    </SafeAreaView>
  );
}
