import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, ScrollView, Text, useColorScheme, View } from 'react-native';

import { RoundButton, SwipeDeck } from '@/components/swipe-deck';
import { Button, Chip, Empty, ErrorText, Glyph, Row, T } from '@/components/ui';
import { CATEGORIES, categoryInfo, costLabel, type IdeaCategory } from '@/content/ideas';
import { hashRank } from '@/lib/games';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import type { DateIdea } from '@/lib/types';

type Filter = IdeaCategory | 'all' | 'free';
type MatchRow = { idea_id: string; event_id: string | null; done_on: string | null };

const TINTS: Record<IdeaCategory, [light: string, dark: string]> = {
  home: ['#FFE6D6', '#4A2A1E'],
  out: ['#FADBE4', '#4A1D30'],
  adventure: ['#DDF1E1', '#1F3A27'],
  romantic: ['#FCD3E1', '#561D36'],
  nairobi: ['#FFF0C7', '#45391A'],
  ours: ['#ECDDFF', '#33244D'],
};

/** Opens the new plan form for an idea, linked to its match when there is one. */
export function planIdea(idea: Pick<DateIdea, 'id' | 'title'>, matched: boolean) {
  router.push({ pathname: '/new-plan', params: matched ? { title: idea.title, match: idea.id } : { title: idea.title } });
}

export function IdeaTags({ idea, partnerId, partnerName }: { idea: DateIdea; partnerId: string; partnerName: string }) {
  const cat = categoryInfo(idea.category);
  const cost = costLabel(idea.cost);
  const by = idea.couple_id ? (idea.created_by === partnerId ? `${partnerName}'s idea` : 'Your idea') : null;
  return (
    <Row gap={6} style={{ flexWrap: 'wrap' }}>
      <Tag>{`${cat.emoji} ${cat.label}`}</Tag>
      {cost && <Tag>{cost}</Tag>}
      {by && <Tag strong>{by}</Tag>}
    </Row>
  );
}

function Tag({ children, strong }: { children: string; strong?: boolean }) {
  const c = useColors();
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: strong ? c.accent : c.surface2 }}>
      <T variant="fine" color={strong ? c.onAccent : c.ink} style={{ fontWeight: '700' }}>
        {children}
      </T>
    </View>
  );
}

export function IdeaCard({ idea, partnerId, partnerName, compact }: { idea: DateIdea; partnerId: string; partnerName: string; compact?: boolean }) {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  const tint = TINTS[idea.category]?.[dark ? 1 : 0] ?? c.accentSoft;
  return (
    <View style={{ flex: compact ? undefined : 1 }}>
      <View style={{ flex: compact ? undefined : 1, minHeight: compact ? 120 : 140, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: compact ? 56 : 84 }} accessibilityElementsHidden importantForAccessibility="no">
          {categoryInfo(idea.category).emoji}
        </Text>
      </View>
      <View style={{ padding: space.xl, gap: space.sm }}>
        <IdeaTags idea={idea} partnerId={partnerId} partnerName={partnerName} />
        <T variant="heading">{idea.title}</T>
        {idea.details ? <T muted>{idea.details}</T> : null}
      </View>
    </View>
  );
}

export function DateIdeasPanel() {
  const c = useColors();
  const ctx = useCouple();
  const userId = ctx?.userId;
  const coupleId = ctx?.couple.id;
  const [ideas, setIdeas] = useState<DateIdea[]>([]);
  const [swiped, setSwiped] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [seed] = useState(() => Math.random().toString(36).slice(2));
  const [matched, setMatched] = useState<DateIdea | null>(null);
  const [surprise, setSurprise] = useState<{ idea: DateIdea; matched: boolean } | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [i, s, m] = await Promise.all([
      supabase.from('date_ideas').select('*'),
      supabase.from('idea_swipes').select('idea_id').eq('user_id', userId),
      supabase.from('date_matches').select('idea_id, event_id, done_on'),
    ]);
    const err = i.error ?? s.error ?? m.error;
    setLoaded(true);
    if (err) return setError(friendlyError(err));
    setError('');
    setIdeas((i.data ?? []) as DateIdea[]);
    setSwiped(new Set((s.data ?? []).map((r: { idea_id: string }) => r.idea_id)));
    setMatches((m.data ?? []) as MatchRow[]);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // A match made on your partner's phone shows up here straight away.
  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`matches:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'date_matches', filter: `couple_id=eq.${coupleId}` }, () => {
        supabase
          .from('date_matches')
          .select('idea_id, event_id, done_on')
          .then(({ data }) => data && setMatches(data as MatchRow[]));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId]);

  const partnerId = ctx?.partner.id ?? '';
  const deck = useMemo(
    () =>
      ideas
        .filter((i) => !swiped.has(i.id))
        .filter((i) => (filter === 'all' ? true : filter === 'free' ? i.cost === 0 : i.category === filter))
        .map((i) => ({ i, first: i.couple_id && i.created_by === partnerId ? 1 : 0, rank: hashRank(seed, i.id) }))
        .sort((a, b) => b.first - a.first || a.rank - b.rank)
        .map((x) => x.i),
    [ideas, swiped, filter, seed, partnerId],
  );

  if (!ctx) return null;
  const { partner } = ctx;
  const openMatches = matches.filter((m) => !m.done_on);
  const ideaById = new Map(ideas.map((i) => [i.id, i]));

  async function swipe(idea: DateIdea, liked: boolean) {
    setError('');
    setSwiped((prev) => new Set(prev).add(idea.id));
    const { data, error: err } = await supabase.rpc('swipe_idea', { p_idea: idea.id, p_liked: liked });
    if (err) {
      setError(friendlyError(err));
      setSwiped((prev) => {
        const next = new Set(prev);
        next.delete(idea.id);
        return next;
      });
      return;
    }
    if (data) {
      setMatched(idea);
      setMatches((prev) => (prev.some((m) => m.idea_id === idea.id) ? prev : [...prev, { idea_id: idea.id, event_id: null, done_on: null }]));
    }
  }

  function surpriseMe() {
    const unplanned = matches
      .filter((m) => !m.event_id && !m.done_on)
      .map((m) => ideaById.get(m.idea_id))
      .filter((i): i is DateIdea => !!i);
    const pool = unplanned.length ? unplanned : deck.length ? deck : ideas;
    if (!pool.length) return;
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && surprise && pick.id === surprise.idea.id) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    setSurprise({ idea: pick, matched: unplanned.length > 0 });
  }

  async function seePassedAgain() {
    if (!userId) return;
    setResetting(true);
    const { error: err } = await supabase.from('idea_swipes').delete().eq('user_id', userId).eq('liked', false);
    setResetting(false);
    if (err) return setError(friendlyError(err));
    setFilter('all');
    await load();
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    ...CATEGORIES.filter((cat) => cat.category !== 'ours' || ideas.some((i) => i.category === 'ours')).map((cat) => ({
      key: cat.category as Filter,
      label: `${cat.emoji} ${cat.label}`,
    })),
    { key: 'free', label: 'Free' },
  ];

  return (
    <View style={{ flex: 1, gap: space.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
        {filters.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ScrollView>

      <View style={{ flex: 1, paddingHorizontal: space.lg, gap: space.md }}>
        <ErrorText>{error}</ErrorText>
        {!loaded ? (
          <View style={{ flex: 1 }} />
        ) : deck.length ? (
          <SwipeDeck
            items={deck}
            onSwipe={swipe}
            renderCard={(idea) => <IdeaCard idea={idea} partnerId={partner.id} partnerName={partner.name} />}
            footer={
              <RoundButton label="Surprise me" onPress={surpriseMe} size={52}>
                <Glyph name="shuffle" color={c.accent} size={22} />
              </RoundButton>
            }
          />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
            {filter === 'all' ? (
              <>
                <Empty>
                  {ideas.length
                    ? `You've been through every idea. When ${partner.name} likes the same ones, they show up in your matches.`
                    : 'No ideas yet.'}
                </Empty>
                {ideas.length > 0 && <Button title="See the ones I passed on" variant="outline" onPress={seePassedAgain} loading={resetting} />}
                <Button title="Surprise me" variant="ghost" onPress={surpriseMe} />
              </>
            ) : (
              <>
                <Empty>No more ideas here. Try another filter.</Empty>
                <Button title="Show all ideas" variant="outline" onPress={() => setFilter('all')} />
              </>
            )}
          </View>
        )}

        <Row gap={space.sm}>
          <Button
            style={{ flex: 1, paddingHorizontal: space.md }}
            variant="outline"
            title={openMatches.length ? `Matches · ${openMatches.length}` : 'Matches'}
            onPress={() => router.push('/matches')}
            icon={<Glyph name="heart" color={c.accent} size={18} />}
          />
          <Button
            style={{ flex: 1, paddingHorizontal: space.md }}
            variant="outline"
            title="Add your own"
            onPress={() => router.push('/new-idea')}
            icon={<Glyph name="plus" color={c.accent} size={18} />}
          />
        </Row>
      </View>

      <Modal visible={!!matched} transparent animationType="fade" onRequestClose={() => setMatched(null)}>
        <Overlay>
          <T style={{ fontSize: 56, textAlign: 'center' }}>💘</T>
          <T variant="title" style={{ textAlign: 'center' }}>
            It&apos;s a match!
          </T>
          <T style={{ textAlign: 'center' }}>
            You and {partner.name} both want to do this:
          </T>
          <T variant="heading" accent style={{ textAlign: 'center' }}>
            {matched?.title}
          </T>
          <Button
            title="Plan it"
            onPress={() => {
              const m = matched;
              setMatched(null);
              if (m) planIdea(m, true);
            }}
          />
          <Button title="Keep swiping" variant="ghost" onPress={() => setMatched(null)} />
        </Overlay>
      </Modal>

      <Modal visible={!!surprise} transparent animationType="fade" onRequestClose={() => setSurprise(null)}>
        <Overlay padded={false}>
          {surprise && (
            <>
              <IdeaCard idea={surprise.idea} partnerId={partner.id} partnerName={partner.name} compact />
              <View style={{ paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.sm }}>
                <T variant="small" accent style={{ fontWeight: '700' }}>
                  {surprise.matched ? `You both liked this one ✨` : 'Something new to try ✨'}
                </T>
                <Button
                  title="Plan it"
                  onPress={() => {
                    const s = surprise;
                    setSurprise(null);
                    planIdea(s.idea, s.matched);
                  }}
                />
                <Row gap={space.sm}>
                  <Button style={{ flex: 1 }} title="Another" variant="outline" onPress={surpriseMe} icon={<Glyph name="shuffle" color={c.ink} size={18} />} />
                  <Button style={{ flex: 1 }} title="Close" variant="ghost" onPress={() => setSurprise(null)} />
                </Row>
              </View>
            </>
          )}
        </Overlay>
      </Modal>
    </View>
  );
}

export function Overlay({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(30, 8, 18, 0.55)', justifyContent: 'center', padding: space.xl }}>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.xl, padding: padded ? space.xl : 0, gap: space.md, overflow: 'hidden', maxWidth: 440, width: '100%', alignSelf: 'center' }}>
        {children}
      </View>
    </View>
  );
}
