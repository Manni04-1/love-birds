import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Hero, heroInk } from '@/components/hero';
import { Photo } from '@/components/photo';
import { PhotoViewer, type ViewerPhoto } from '@/components/photo-viewer';
import { Avatar, Button, Empty, ErrorText, Glyph, IconButton, Row, Sheet, T } from '@/components/ui';
import { addDays, dayLabel, daysBetween, monthLabel, parseISODate, timeLabel, toISODate, today } from '@/lib/dates';
import { hashRank } from '@/lib/games';
import { hasMoments, ideaFor, loadFreeDays, loadMoments, setFree, type DayMoments, type FreeDay, type IdeaPick } from '@/lib/our-days';
import { dayOf, isRepeat, loadPlans, loadUpcoming, plansByDay, rangeLabel, repeatLabel, type Occurrence } from '@/lib/plans';
import { loadQuestions } from '@/lib/questions';
import { useCouple } from '@/lib/session';
import { specialDays, type SpecialDay } from '@/lib/special-days';
import { useMilestones } from '@/lib/story';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, tabBarInset, useColors, useThemeName } from '@/lib/theme';
import type { Plan, Question } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Next = { day: string; title: string; emoji: string; kind: 'plan' | 'special'; end?: string };

/** A big countdown to whatever's next: a plan, an anniversary, a birthday or a milestone. */
function Countdown({ next, onPress }: { next: Next | null; onPress: () => void }) {
  const theme = useThemeName();
  const dark = useColorScheme() === 'dark';
  const ink = heroInk(theme, dark);
  const n = next ? daysBetween(today(), parseISODate(next.day)) : 0;
  // A trip that has already started and hasn't ended yet.
  const ongoing = !!next?.end && n < 0;
  const shadow = { textShadowColor: ink.shadow, textShadowRadius: 8 };
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={next ? `${next.title}, ${n === 0 ? 'today' : `in ${n} days`}` : 'Add a plan'}>
      <Hero height={132}>
        <Row style={{ flex: 1, padding: space.lg, justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="eyebrow" color={ink.soft} style={shadow}>
              {next ? (next.kind === 'plan' ? 'Next plan' : 'Coming up') : 'Nothing planned yet'}
            </T>
            <T variant="heading" color={ink.ink} style={shadow} numberOfLines={2}>
              {next ? `${next.emoji} ${next.title}` : 'Tap to plan something together'}
            </T>
            {next ? (
              <T variant="small" color={ink.soft} style={shadow}>
                {next.end ? rangeLabel({ start: next.day, end: next.end }) : dayLabel(next.day)}
              </T>
            ) : null}
          </View>
          {next ? (
            <View style={{ alignItems: 'center', minWidth: 76 }}>
              {n <= 0 ? (
                <T variant="title" color={ink.ink} style={shadow}>
                  {ongoing ? 'On now' : 'Today!'}
                </T>
              ) : (
                <>
                  <T variant="display" color={ink.ink} style={[shadow, { fontSize: 46, lineHeight: 52 }]}>
                    {n}
                  </T>
                  <T variant="small" color={ink.soft} style={[shadow, { fontWeight: '700' }]}>
                    {n === 1 ? 'day to go' : 'days to go'}
                  </T>
                </>
              )}
            </View>
          ) : null}
        </Row>
      </Hero>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <T variant="small" muted style={{ fontWeight: '700' }}>
        {title}
      </T>
      {children}
    </View>
  );
}

/** Everything you shared on a day, like a page from a diary you keep together. */
function OurDay({ day, m, partnerName, question, onOpenPhoto }: { day: string; m: DayMoments | undefined; partnerName: string; question: Question | null; onOpenPhoto: (photos: ViewerPhoto[], i: number) => void }) {
  const c = useColors();
  if (!m || !hasMoments(m)) {
    return <Empty>{day === toISODate(today()) ? 'Nothing shared yet today. Moods, check-ins, photos and answers will gather here.' : 'Nothing shared this day.'}</Empty>;
  }
  const photos: ViewerPhoto[] = [];
  if (m.photos.mine?.photo_path) photos.push({ path: m.photos.mine.photo_path, caption: m.photos.mine.caption, note: 'Your photo of the day' });
  if (m.photos.partner?.photo_path) photos.push({ path: m.photos.partner.photo_path, caption: m.photos.partner.caption, note: `${partnerName}'s photo of the day` });
  for (const mem of m.memories) if (mem.photo_path) photos.push({ path: mem.photo_path, caption: mem.caption, note: mem.place });
  const lines = (ci: DayMoments['checkins']['mine']) =>
    ci ? [ci.rose && `🌹 ${ci.rose}`, ci.thorn && `🌵 ${ci.thorn}`, ci.bud && `🌱 ${ci.bud}`].filter(Boolean).join('\n') : '';

  return (
    <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.xl, padding: space.lg, gap: space.md }}>
      {(m.moods.mine || m.moods.partner) && (
        <Section title="Moods">
          <Row gap={space.lg} style={{ flexWrap: 'wrap' }}>
            {m.moods.mine && (
              <Row gap={6}>
                <Avatar name="You" size={28} />
                <T>
                  {m.moods.mine.emoji} {m.moods.mine.word ?? ''}
                </T>
              </Row>
            )}
            {m.moods.partner && (
              <Row gap={6}>
                <Avatar name={partnerName} partner size={28} />
                <T>
                  {m.moods.partner.emoji} {m.moods.partner.word ?? ''}
                </T>
              </Row>
            )}
          </Row>
        </Section>
      )}
      {(m.checkins.mine || m.checkins.partner) && (
        <Section title="Rose, thorn and bud">
          {m.checkins.mine && <T>{lines(m.checkins.mine)}</T>}
          {m.checkins.partner &&
            (m.checkins.partner.rose ? (
              <View style={{ gap: 2 }}>
                <T variant="fine">{partnerName}</T>
                <T>{lines(m.checkins.partner)}</T>
              </View>
            ) : (
              <T variant="small" muted>
                {partnerName} shared theirs. It shows once you&apos;ve shared yours.
              </T>
            ))}
        </Section>
      )}
      {photos.length > 0 && (
        <Section title="Photos">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {photos.map((p, i) => (
              <Pressable key={`${p.path}-${i}`} onPress={() => onOpenPhoto(photos, i)} accessibilityRole="imagebutton" accessibilityLabel={`Open ${p.note ?? 'photo'}`}>
                <Photo path={p.path} style={{ width: 104, height: 104, borderRadius: radius.md }} label={p.caption ?? undefined} />
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      )}
      {m.photos.partner && !m.photos.partner.photo_path && (
        <T variant="small" muted>
          {partnerName} added a photo. It shows once you&apos;ve added yours.
        </T>
      )}
      {(m.answers.mine || m.answers.partner) && (
        <Section title={question ? `Daily question: ${question.text}` : 'Daily question'}>
          {m.answers.mine?.body && <T>You: {m.answers.mine.body}</T>}
          {m.answers.partner &&
            (m.answers.partner.body ? (
              <T>
                {partnerName}: {m.answers.partner.body}
              </T>
            ) : (
              <T variant="small" muted>
                {partnerName} answered. You&apos;ll see it once you&apos;ve answered too.
              </T>
            ))}
        </Section>
      )}
      {m.memories.length > 0 && (
        <Section title="Memories">
          {m.memories.map((mem) => (
            <T key={mem.id}>
              💞 {mem.caption}
              {mem.place ? ` · ${mem.place}` : ''}
            </T>
          ))}
        </Section>
      )}
    </View>
  );
}

/** "Skip just tomorrow", "Skip just on Fri 27 Nov", or for a plan over several days "Skip just this time". */
function skipTitle(o: Occurrence): string {
  if (o.end > o.start) return 'Skip just this time';
  const when = dayLabel(o.start);
  return ['Today', 'Tomorrow', 'Yesterday'].includes(when) ? `Skip just ${when.toLowerCase()}` : `Skip just on ${when}`;
}

export default function Calendar() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const params = useLocalSearchParams<{ day?: string }>();
  const [selected, setSelected] = useState(toISODate(today()));
  const [month, setMonth] = useState(() => new Date(today().getFullYear(), today().getMonth(), 1));
  const [plans, setPlans] = useState<Plan[]>([]);
  const [upcoming, setUpcoming] = useState<Occurrence[]>([]);
  // The plan you tapped, with what to do with it.
  const [open, setOpen] = useState<{ o: Occurrence; day: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [planError, setPlanError] = useState('');
  const [moments, setMoments] = useState<Map<string, DayMoments>>(new Map());
  const [free, setFreeDays] = useState<FreeDay[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idea, setIdea] = useState<{ day: string; pick: IdeaPick | null } | null>(null);
  const [viewer, setViewer] = useState<{ photos: ViewerPhoto[]; start: number } | null>(null);
  const [freeError, setFreeError] = useState('');

  // Opening the calendar from Home or a notification jumps to that day.
  const [jumpedTo, setJumpedTo] = useState<string | undefined>(undefined);
  if (params.day && params.day !== jumpedTo) {
    setJumpedTo(params.day);
    setSelected(params.day);
    const d = parseISODate(params.day);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  const first = toISODate(month);
  const last = toISODate(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const load = useCallback(async () => {
    if (!coupleId || !userId) return;
    const [inMonth, next, m, f, q] = await Promise.all([
      loadPlans(coupleId, first, last),
      loadUpcoming(coupleId, toISODate(today()), 5),
      loadMoments(coupleId, userId, first, last),
      loadFreeDays(coupleId, first, last),
      loadQuestions(),
    ]);
    setPlans(inMonth ?? []);
    setUpcoming(next);
    setMoments(m);
    setFreeDays(f);
    setQuestions(q);
  }, [coupleId, userId, first, last]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Show plans and free evenings your partner adds while you're looking.
  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`events:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `couple_id=eq.${coupleId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'free_days' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  const together = ctx?.couple.together_since;
  const myBirthday = ctx?.profile.birthday;
  const partnerBirthday = ctx?.partner.birthday;
  const partnerName = ctx?.partner.name ?? '';
  const { milestones: story } = useMilestones(coupleId, 'calendar');
  const specials = useMemo(
    () => specialDays(parseISODate(first), parseISODate(last), { togetherSince: together, myBirthday, partnerBirthday, partnerName, story }),
    [first, last, together, myBirthday, partnerBirthday, partnerName, story],
  );
  const soonSpecial = useMemo(
    () =>
      specialDays(today(), addDays(today(), 120), { togetherSince: together, myBirthday, partnerBirthday, partnerName, story }).find((s) => s.kind !== 'holiday') ?? null,
    [together, myBirthday, partnerBirthday, partnerName, story],
  );

  const byDay = useMemo(() => plansByDay(plans, first, last), [plans, first, last]);
  const specialByDay = useMemo(() => {
    const m = new Map<string, SpecialDay[]>();
    for (const s of specials) m.set(s.day, [...(m.get(s.day) ?? []), s]);
    return m;
  }, [specials]);
  const freeByDay = useMemo(() => {
    const m = new Map<string, { me: boolean; them: boolean }>();
    for (const f of free) {
      const e = m.get(f.day) ?? { me: false, them: false };
      if (f.user_id === userId) e.me = true;
      else e.them = true;
      m.set(f.day, e);
    }
    return m;
  }, [free, userId]);

  // A date idea for a selected evening you're both free.
  const bothFreeSelected = !!freeByDay.get(selected)?.me && !!freeByDay.get(selected)?.them;
  useEffect(() => {
    if (!coupleId || !bothFreeSelected) return;
    let active = true;
    ideaFor(coupleId, selected, hashRank).then((pick) => active && setIdea({ day: selected, pick }));
    return () => {
      active = false;
    };
  }, [coupleId, selected, bothFreeSelected]);

  if (!ctx) return null;
  const { partner, couple } = ctx;

  const lead = (month.getDay() + 6) % 7;
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => toISODate(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  while (cells.length % 7) cells.push(null);
  const todayIso = toISODate(today());
  const selectedPlans = byDay.get(selected) ?? [];
  const selectedSpecial = specialByDay.get(selected) ?? [];
  const selectedFree = freeByDay.get(selected) ?? { me: false, them: false };
  const selectedQuestion = (() => {
    const qid = moments.get(selected)?.answers.mine?.question_id ?? moments.get(selected)?.answers.partner?.question_id;
    return questions.find((q) => q.id === qid) ?? null;
  })();

  const soonest = upcoming[0];
  const nextPlan: Next | null = soonest
    ? { day: soonest.start, title: soonest.plan.title, emoji: soonest.end > soonest.start ? '🧳' : '📅', kind: 'plan', end: soonest.end > soonest.start ? soonest.end : undefined }
    : null;
  const nextSpecial: Next | null = soonSpecial ? { day: soonSpecial.day, title: soonSpecial.title, emoji: soonSpecial.emoji, kind: 'special' } : null;
  const next = nextPlan && nextSpecial ? (nextSpecial.day < nextPlan.day && !nextPlan.end ? nextSpecial : nextPlan) : (nextPlan ?? nextSpecial);

  function jump(day: string) {
    setSelected(day);
    const d = parseISODate(day);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  async function toggleFree(on: boolean) {
    if (!userId) return;
    setFreeError('');
    setFreeDays((prev) => (on ? [...prev, { user_id: userId, day: selected }] : prev.filter((f) => !(f.user_id === userId && f.day === selected))));
    try {
      await setFree(couple.id, userId, selected, on);
    } catch (e) {
      setFreeError(friendlyError(e));
      load();
    }
  }

  function openPlan(o: Occurrence, day: string) {
    setPlanError('');
    setConfirmDelete(false);
    setOpen({ o, day });
  }

  async function skipOnce(o: Occurrence) {
    setBusy(true);
    setPlanError('');
    const { error } = await supabase
      .from('events')
      .update({ skip_days: [...(o.plan.skip_days ?? []), o.start] })
      .eq('id', o.plan.id);
    setBusy(false);
    if (error) return setPlanError(friendlyError(error));
    setOpen(null);
    load();
  }

  async function deletePlan(p: Plan) {
    setBusy(true);
    setPlanError('');
    const { error } = await supabase.from('events').delete().eq('id', p.id);
    setBusy(false);
    if (error) return setPlanError(friendlyError(error));
    setOpen(null);
    load();
  }

  const planRow = (o: Occurrence, day: string | null) => {
    const p = o.plan;
    const several = o.end > o.start;
    const ongoing = !day && o.start < todayIso;
    // On a later day of a trip, the start time doesn't apply.
    const time = day && day !== o.start ? 'All day' : timeLabel(p.time);
    return (
      <Pressable
        key={`${p.id}-${o.start}`}
        onPress={() => openPlan(o, day ?? (ongoing ? todayIso : o.start))}
        onLongPress={() => openPlan(o, day ?? (ongoing ? todayIso : o.start))}
        accessibilityRole="button"
        accessibilityHint="Opens it to change, skip or delete"
        style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.md, padding: space.md, opacity: pressed ? 0.85 : 1 })}>
        <View style={{ width: 78 }}>
          {!day && (
            <T variant="small" accent style={{ fontWeight: '700' }}>
              {ongoing ? 'On now' : dayLabel(o.start)}
            </T>
          )}
          <T variant="small" accent style={{ fontWeight: '700' }}>
            {time}
          </T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="strong">{p.title}</T>
          {several && (
            <T variant="small" accent style={{ fontWeight: '700' }}>
              {day ? `${dayOf(o, day)} · ${rangeLabel(o)}` : rangeLabel(o)}
            </T>
          )}
          {isRepeat(p.repeats) && (
            <T variant="small" muted>
              🔁 {repeatLabel(p)}
            </T>
          )}
          {p.note ? <T variant="small" muted>{p.note}</T> : null}
          <T variant="fine">{p.created_by === userId ? 'Added by you' : `Added by ${partner.name}`}</T>
        </View>
      </Pressable>
    );
  };

  const future = selected >= todayIso;
  const pick = idea?.day === selected ? idea.pick : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.page }}>
      <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, justifyContent: 'space-between' }}>
        <T variant="title">Calendar</T>
        <IconButton label="Add a plan" accent onPress={() => router.push({ pathname: '/new-plan', params: { day: selected } })}>
          <Glyph name="plus" color={c.onAccent} />
        </IconButton>
      </Row>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: tabBarInset + space.xl, gap: space.md }}>
        <Countdown next={next} onPress={() => (next ? jump(next.day) : router.push({ pathname: '/new-plan', params: { day: selected } }))} />

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
              const onDay = byDay.get(iso) ?? [];
              const has = onDay.length > 0;
              const single = onDay.some((o) => o.end === o.start);
              const trips = onDay.filter((o) => o.end > o.start);
              const tripStart = trips.some((o) => o.start === iso);
              const tripEnd = trips.some((o) => o.end === iso);
              const shared = hasMoments(moments.get(iso));
              const special = specialByDay.get(iso)?.[0];
              const f = freeByDay.get(iso);
              const bothFree = !!f?.me && !!f?.them;
              const label = [
                parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
                special?.title,
                has && 'has plans',
                shared && 'shared moments',
                bothFree && 'you are both free',
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <Pressable
                  key={iso}
                  onPress={() => setSelected(iso)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={label}
                  style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                  {trips.length > 0 && (
                    // A bar that runs across every day of a trip.
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 5,
                        left: tripStart ? 9 : 0,
                        right: tripEnd ? 9 : 0,
                        height: 5,
                        backgroundColor: c.accent,
                        opacity: isSel ? 0 : 0.85,
                        borderTopLeftRadius: tripStart ? 3 : 0,
                        borderBottomLeftRadius: tripStart ? 3 : 0,
                        borderTopRightRadius: tripEnd ? 3 : 0,
                        borderBottomRightRadius: tripEnd ? 3 : 0,
                      }}
                    />
                  )}
                  <View
                    style={{
                      flex: 1,
                      borderRadius: radius.sm,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      backgroundColor: isSel ? c.accent : bothFree ? c.accentSoft : 'transparent',
                      borderWidth: isToday && !isSel ? 2 : 0,
                      borderColor: c.accent,
                    }}>
                    {special && (
                      <T style={{ position: 'absolute', top: 1, right: 2, fontSize: 10, lineHeight: 13 }} accessibilityElementsHidden importantForAccessibility="no">
                        {special.emoji}
                      </T>
                    )}
                    <T style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }} color={isSel ? c.onAccent : c.ink}>
                      {parseISODate(iso).getDate()}
                    </T>
                    <Row gap={3}>
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: single || (isSel && has) ? (isSel ? c.onAccent : c.accent) : 'transparent' }} />
                      {shared && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isSel ? c.onAccent : c.accent2 }} />}
                    </Row>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Row gap={space.md} style={{ flexWrap: 'wrap', justifyContent: 'center', marginTop: space.sm }}>
            <Row gap={4}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent }} />
              <T variant="fine">Plans</T>
            </Row>
            <Row gap={4}>
              <View style={{ width: 14, height: 5, borderRadius: 3, backgroundColor: c.accent }} />
              <T variant="fine">Several days</T>
            </Row>
            <Row gap={4}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent2 }} />
              <T variant="fine">Your day together</T>
            </Row>
            <Row gap={4}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: c.accentSoft }} />
              <T variant="fine">Both free</T>
            </Row>
          </Row>
        </View>

        <T variant="strong" style={{ marginTop: space.sm, fontSize: 18 }}>
          {dayLabel(selected)}
        </T>

        {selectedSpecial.map((s) => (
          <Pressable
            key={`${s.kind}-${s.title}`}
            disabled={!s.link}
            onPress={() => s.link && router.push(s.link as never)}
            accessibilityRole={s.link ? 'button' : undefined}
            style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: c.accentSoft, borderRadius: radius.md, padding: space.md, opacity: pressed ? 0.8 : 1 })}>
            <T style={{ fontSize: 26, lineHeight: 32 }}>{s.emoji}</T>
            <View style={{ flex: 1 }}>
              <T variant="strong">{s.title}</T>
              {s.note ? <T variant="small" muted>{s.note}</T> : null}
              {s.linkLabel ? (
                <T variant="small" accent style={{ fontWeight: '700' }}>
                  {s.linkLabel}
                </T>
              ) : null}
            </View>
            {s.link ? <Glyph name="next" color={c.muted} size={18} /> : null}
          </Pressable>
        ))}

        {future && (
          <View style={{ backgroundColor: c.surface, borderColor: bothFreeSelected ? c.accent : c.line, borderWidth: bothFreeSelected ? 2 : 1, borderRadius: radius.md, padding: space.md, gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="strong">{bothFreeSelected ? 'You’re both free this evening 🎉' : 'Free this evening?'}</T>
                <T variant="small" muted>
                  {selectedFree.them ? `${partner.name} is free.` : `${partner.name} hasn’t said yet.`}
                  {selectedFree.me ? ' You are too.' : ''}
                </T>
              </View>
              <Button title={selectedFree.me ? 'I’m free ✓' : 'I’m free'} variant={selectedFree.me ? 'primary' : 'outline'} onPress={() => toggleFree(!selectedFree.me)} />
            </Row>
            {bothFreeSelected && pick && (
              <View style={{ gap: space.sm, borderTopWidth: 1, borderTopColor: c.line, paddingTop: space.sm }}>
                <T variant="small" accent style={{ fontWeight: '700' }}>
                  {pick.matched ? 'You both liked this idea' : 'How about this?'}
                </T>
                <T variant="strong">{pick.title}</T>
                {pick.details ? <T variant="small" muted>{pick.details}</T> : null}
                <Button
                  title="Plan it for this evening"
                  onPress={() => router.push({ pathname: '/new-plan', params: { day: selected, title: pick.title, ...(pick.matched ? { match: pick.id } : {}) } })}
                />
              </View>
            )}
            {freeError ? <T variant="small" color={c.danger}>{freeError}</T> : null}
          </View>
        )}

        {selectedPlans.length ? selectedPlans.map((o) => planRow(o, selected)) : future ? <Empty>Nothing planned. Tap + to add something for you both.</Empty> : null}

        {!future || selected === todayIso ? (
          <>
            <T variant="strong" style={{ marginTop: space.sm }}>
              Your day together
            </T>
            <OurDay day={selected} m={moments.get(selected)} partnerName={partner.name} question={selectedQuestion} onOpenPhoto={(photos, start) => setViewer({ photos, start })} />
          </>
        ) : null}

        <T variant="strong" style={{ marginTop: space.sm }}>
          Coming up
        </T>
        {upcoming.length ? upcoming.map((o) => planRow(o, null)) : <Empty>No plans ahead yet.</Empty>}
        <T variant="fine">Tap a plan to change it, skip it once, or delete it.</T>
      </ScrollView>
      <Sheet open={!!open} onClose={() => setOpen(null)}>
        {open && !confirmDelete && (
          <>
            <View style={{ gap: 4 }}>
              <T variant="heading">{open.o.plan.title}</T>
              <T variant="small" accent style={{ fontWeight: '700' }}>
                {open.o.end > open.o.start ? `${rangeLabel(open.o)} · ${dayOf(open.o, open.day)}` : dayLabel(open.o.start)}
                {/* On a later day of a trip, the start time doesn't apply. */}
                {open.o.plan.time && open.day === open.o.start ? ` · ${timeLabel(open.o.plan.time)}` : ''}
              </T>
              {isRepeat(open.o.plan.repeats) && <T variant="small" muted>🔁 {repeatLabel(open.o.plan)}</T>}
              {open.o.plan.note ? <T variant="small">{open.o.plan.note}</T> : null}
            </View>
            <ErrorText>{planError}</ErrorText>
            <Button
              title="Change"
              variant="outline"
              icon={<Glyph name="edit" color={c.ink} size={18} />}
              onPress={() => {
                const id = open.o.plan.id;
                setOpen(null);
                router.push({ pathname: '/new-plan', params: { id } });
              }}
            />
            {isRepeat(open.o.plan.repeats) && (
              <Button title={skipTitle(open.o)} variant="outline" loading={busy} onPress={() => skipOnce(open.o)} />
            )}
            <Button title={isRepeat(open.o.plan.repeats) ? 'Delete every time' : 'Delete'} variant="ghost" onPress={() => setConfirmDelete(true)} />
          </>
        )}
        {open && confirmDelete && (
          <>
            <T variant="heading">Delete “{open.o.plan.title}”?</T>
            <T variant="small" muted>
              {isRepeat(open.o.plan.repeats) ? 'Every time it comes round goes, for both of you.' : 'It disappears for both of you.'}
            </T>
            <ErrorText>{planError}</ErrorText>
            <Row>
              <Button style={{ flex: 1 }} title="Keep it" variant="outline" onPress={() => setConfirmDelete(false)} />
              <Button style={{ flex: 1 }} title="Delete" variant="danger" loading={busy} onPress={() => deletePlan(open.o.plan)} />
            </Row>
          </>
        )}
      </Sheet>
      <PhotoViewer photos={viewer?.photos ?? []} start={viewer ? viewer.start : null} onClose={() => setViewer(null)} />
    </SafeAreaView>
  );
}
