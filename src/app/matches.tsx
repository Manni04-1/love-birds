import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IdeaTags, planIdea } from '@/components/date-ideas';
import { Button, Empty, ErrorText, Glyph, IconButton, Row, T } from '@/components/ui';
import { categoryInfo } from '@/content/ideas';
import { dayLabel, shortDate, timeLabel, toISODate, today } from '@/lib/dates';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import type { DateMatch } from '@/lib/types';

export default function Matches() {
  const c = useColors();
  const ctx = useCouple();
  const [matches, setMatches] = useState<DateMatch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('date_matches')
      .select('*, date_ideas(*), events(id, day, time)')
      .order('matched_at', { ascending: false });
    setLoaded(true);
    if (err) return setError(friendlyError(err));
    setError('');
    setMatches(((data ?? []) as DateMatch[]).filter((m) => m.date_ideas));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!ctx) return null;
  const { partner } = ctx;

  const toPlan = matches.filter((m) => !m.done_on && !m.events);
  const planned = matches
    .filter((m) => !m.done_on && m.events)
    .sort((a, b) => (a.events!.day < b.events!.day ? -1 : 1));
  const done = matches.filter((m) => m.done_on).sort((a, b) => (a.done_on! < b.done_on! ? 1 : -1));

  function didIt(m: DateMatch) {
    const idea = m.date_ideas!;
    const todayIso = toISODate(today());
    const day = m.events && m.events.day <= todayIso ? m.events.day : todayIso;
    router.push({ pathname: '/new-memory', params: { caption: idea.title, day, match: m.idea_id } });
  }

  function remove(m: DateMatch) {
    Alert.alert('Remove this match?', `"${m.date_ideas!.title}" leaves your matches for both of you. Any plan or memory stays.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('date_matches').delete().eq('idea_id', m.idea_id);
          if (err) return setError(friendlyError(err));
          load();
        },
      },
    ]);
  }

  const renderMatch = (m: DateMatch) => {
    const idea = m.date_ideas!;
    return (
      <Pressable
        key={m.idea_id}
        onLongPress={() => remove(m)}
        accessibilityHint="Long press to remove"
        style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.sm }}>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <T style={{ fontSize: 30, lineHeight: 36 }}>{categoryInfo(idea.category).emoji}</T>
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="strong" style={{ fontSize: 17 }}>
              {idea.title}
            </T>
            {idea.details ? (
              <T variant="small" muted>
                {idea.details}
              </T>
            ) : null}
          </View>
        </Row>
        <IdeaTags idea={idea} partnerId={partner.id} partnerName={partner.name} />
        {m.done_on ? (
          <Row gap={6}>
            <Glyph name="check" color={c.accent} size={16} />
            <T variant="small" accent style={{ fontWeight: '700' }}>
              Done on {shortDate(m.done_on)}
              {m.memory_id ? ', saved in Memories' : ''}
            </T>
          </Row>
        ) : m.events ? (
          <>
            <Pressable onPress={() => router.push({ pathname: '/calendar', params: { day: m.events!.day } })} accessibilityRole="link">
              <T variant="small" accent style={{ fontWeight: '700' }}>
                📅 {dayLabel(m.events.day)} · {timeLabel(m.events.time)}
              </T>
            </Pressable>
            <Button title="We did it 🎉" variant="outline" onPress={() => didIt(m)} />
          </>
        ) : (
          <Row gap={space.sm}>
            <Button style={{ flex: 1 }} title="Plan it" onPress={() => planIdea(idea, true)} />
            <Button style={{ flex: 1 }} title="We did it" variant="outline" onPress={() => didIt(m)} />
          </Row>
        )}
      </Pressable>
    );
  };

  const section = (label: string, list: DateMatch[]) =>
    list.length ? (
      <View style={{ gap: space.sm }}>
        <T variant="eyebrow" style={{ marginLeft: 4 }}>
          {label}
        </T>
        {list.map(renderMatch)}
      </View>
    ) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/together', params: { tab: 'ideas' } }))}>
          <Glyph name="back" color={c.ink} />
        </IconButton>
        <T variant="strong" style={{ fontSize: 18 }}>
          Your matches
        </T>
      </Row>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }>
        <ErrorText>{error}</ErrorText>
        {loaded && !matches.length && !error ? (
          <View style={{ gap: space.md }}>
            <Empty>
              No matches yet. Swipe right on the ideas you like. When {partner.name} likes the same one, it shows up here.
            </Empty>
            <Button title="Go to date ideas" variant="outline" onPress={() => router.replace({ pathname: '/together', params: { tab: 'ideas' } })} />
          </View>
        ) : null}
        {section('Ready to plan', toPlan)}
        {section('Planned', planned)}
        {section('Done', done)}
      </ScrollView>
    </SafeAreaView>
  );
}
