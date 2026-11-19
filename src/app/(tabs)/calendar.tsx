import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { Hero, heroInk } from '@/components/hero';
import { Photo } from '@/components/photo';
import { PhotoViewer, type ViewerPhoto } from '@/components/photo-viewer';
import { PlanIconView } from '@/components/plan-icon';
import { Avatar, Button, Empty, ErrorText, Glyph, IconButton, Row, Sheet, T } from '@/components/ui';
import { addDays, dayLabel, daysBetween, monthLabel, parseISODate, timeLabel, toISODate, today } from '@/lib/dates';
import { hashRank } from '@/lib/games';
import { iconFor, type PlanIcon } from '@/lib/plan-icons';
import { hasMoments, ideaFor, loadFreeDays, loadMoments, setFree, type DayMoments, type FreeDay, type IdeaPick } from '@/lib/our-days';
import { dayOf, isRepeat, loadPlans, loadUpcoming, plansByDay, rangeLabel, repeatLabel, type Occurrence } from '@/lib/plans';
import { loadQuestions } from '@/lib/questions';
import { useCouple } from '@/lib/session';
import { specialDays, type SpecialDay } from '@/lib/special-days';
import { useMilestones } from '@/lib/story';
import { friendlyError, supabase } from '@/lib/supabase';
import { alpha, mix, radius, space, tabBarInset, useColors, useThemeName, type Colors } from '@/lib/theme';
import type { Plan, Question } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Next = { day: string; title: string; emoji: string; kind: 'plan' | 'special'; end?: string; icon?: PlanIcon };

/** A soft shadow under a card, deeper on a dark page. */
function lift(c: Colors, dark: boolean, y = 6): string {
  return `0px ${y}px ${y * 3}px ${dark ? 'rgba(0,0,0,0.45)' : alpha(c.ink, 0.1)}`;
}

/** "Wed", "18" and "Nov" for a date, to print on a calendar page or a ticket. */
function dateParts(d: Date) {
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    day: d.getDate(),
    month: d.toLocaleDateString('en-GB', { month: 'short' }),
  };
}

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
            {next?.icon?.glyph ? (
              // A drawn icon can't sit in the words, so it goes beside them.
              <Row gap={6} style={{ alignItems: 'flex-start' }}>
                <View style={{ paddingTop: 3 }}>
                  <PlanIconView icon={next.icon} size={22} color={ink.ink} />
                </View>
                <T variant="heading" color={ink.ink} style={[shadow, { flex: 1 }]} numberOfLines={2}>
                  {next.title}
                </T>
              </Row>
            ) : (
              <T variant="heading" color={ink.ink} style={shadow} numberOfLines={2}>
                {next ? `${next.emoji} ${next.title}` : 'Tap to plan something together'}
              </T>
            )}
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

/** A little round badge with an emoji in it, in one of the theme's colours. */
function Badge({ emoji, tint, size = 30 }: { emoji: string; tint: string; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: alpha(tint, 0.2),
        borderWidth: 1,
        borderColor: alpha(tint, 0.55),
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <T style={{ fontSize: size * 0.5, lineHeight: size * 0.68 }}>{emoji}</T>
    </View>
  );
}

/** A heading for each part of the page: a badge, the title, and a rule that runs to the edge. */
function Heading({ emoji, title, tint }: { emoji: string; title: string; tint: string }) {
  return (
    <Row gap={space.sm} style={{ marginTop: space.md }}>
      <Badge emoji={emoji} tint={tint} />
      <T variant="heading" style={{ fontSize: 21, lineHeight: 27 }} accessibilityRole="header">
        {title}
      </T>
      <View style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: alpha(tint, 0.3) }} />
    </Row>
  );
}

/** One part of a day's diary page, with its own little badge. */
function Part({ emoji, title, tint, children }: { emoji: string; title: string; tint: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: space.sm }}>
      <Row gap={space.sm}>
        <Badge emoji={emoji} tint={tint} size={26} />
        <T variant="small" color={mix(tint, c.ink, 0.3)} style={{ flex: 1, fontWeight: '800' }}>
          {title}
        </T>
      </Row>
      {children}
    </View>
  );
}

/** Words someone wrote, set off with a coloured bar like a quote. */
function Quote({ who, tint, children }: { who: string; tint: string; children: ReactNode }) {
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: tint, paddingLeft: space.md, gap: 1 }}>
      <T variant="fine">{who}</T>
      {children}
    </View>
  );
}

/** Everything you shared on a day, like a page from a diary you keep together. */
function OurDay({ day, m, partnerName, question, onOpenPhoto }: { day: string; m: DayMoments | undefined; partnerName: string; question: Question | null; onOpenPhoto: (photos: ViewerPhoto[], i: number) => void }) {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  if (!m || !hasMoments(m)) {
    return <Empty>{day === toISODate(today()) ? 'Nothing shared yet today. Moods, check-ins, photos and answers will gather here.' : 'Nothing shared this day.'}</Empty>;
  }
  const photos: ViewerPhoto[] = [];
  if (m.photos.mine?.photo_path) photos.push({ path: m.photos.mine.photo_path, caption: m.photos.mine.caption, note: 'Your photo of the day' });
  if (m.photos.partner?.photo_path) photos.push({ path: m.photos.partner.photo_path, caption: m.photos.partner.caption, note: `${partnerName}'s photo of the day` });
  for (const mem of m.memories) if (mem.photo_path) photos.push({ path: mem.photo_path, caption: mem.caption, note: mem.place });
  const lines = (ci: DayMoments['checkins']['mine']) =>
    ci ? [ci.rose && `🌹 ${ci.rose}`, ci.thorn && `🌵 ${ci.thorn}`, ci.bud && `🌱 ${ci.bud}`].filter(Boolean).join('\n') : '';
  const chip = { backgroundColor: alpha(c.accent, dark ? 0.16 : 0.1), borderRadius: radius.pill, paddingVertical: 3, paddingLeft: 3, paddingRight: 12 };

  return (
    <View
      style={{
        marginTop: 6,
        backgroundColor: c.surface,
        backgroundImage: `linear-gradient(180deg, ${alpha(c.accent2, dark ? 0.1 : 0.09)} 0%, ${alpha(c.surface, 0)} 40%)`,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: radius.xl,
        padding: space.lg,
        paddingTop: space.xl,
        gap: space.lg,
        boxShadow: lift(c, dark),
      }}>
      {/* A strip of tape holding the page in, like a diary. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ position: 'absolute', top: -10, left: '50%', marginLeft: -44, width: 88, height: 22, borderRadius: 3, backgroundColor: alpha(c.accent2, dark ? 0.6 : 0.5), transform: [{ rotate: '-4deg' }] }}
      />
      {(m.moods.mine || m.moods.partner) && (
        <Part emoji="😊" title="Moods" tint={c.accent}>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {m.moods.mine && (
              <Row gap={6} style={chip}>
                <Avatar name="You" size={28} />
                <T>
                  {m.moods.mine.emoji} {m.moods.mine.word ?? ''}
                </T>
              </Row>
            )}
            {m.moods.partner && (
              <Row gap={6} style={chip}>
                <Avatar name={partnerName} partner size={28} />
                <T>
                  {m.moods.partner.emoji} {m.moods.partner.word ?? ''}
                </T>
              </Row>
            )}
          </Row>
        </Part>
      )}
      {(m.checkins.mine || m.checkins.partner) && (
        <Part emoji="🌹" title="Rose, thorn and bud" tint={c.accent2}>
          {m.checkins.mine && (
            <Quote who="You" tint={c.accent}>
              <T>{lines(m.checkins.mine)}</T>
            </Quote>
          )}
          {m.checkins.partner &&
            (m.checkins.partner.rose ? (
              <Quote who={partnerName} tint={c.accent2}>
                <T>{lines(m.checkins.partner)}</T>
              </Quote>
            ) : (
              <T variant="small" muted>
                {partnerName} shared theirs. It shows once you&apos;ve shared yours.
              </T>
            ))}
        </Part>
      )}
      {photos.length > 0 && (
        <Part emoji="📸" title="Photos" tint={c.accent3}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingVertical: 8, paddingHorizontal: 4 }}>
            {photos.map((p, i) => (
              // Little prints, each laid down at a slight tilt.
              <Pressable
                key={`${p.path}-${i}`}
                onPress={() => onOpenPhoto(photos, i)}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Open ${p.note ?? 'photo'}`}
                style={({ pressed }) => ({ transform: [{ rotate: i % 2 ? '2.5deg' : '-2.5deg' }, { scale: pressed ? 0.97 : 1 }] })}>
                <View style={{ backgroundColor: '#FFFDF8', padding: 6, paddingBottom: 24, borderRadius: 4, boxShadow: `0px 3px 10px ${dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.16)'}` }}>
                  <Photo path={p.path} style={{ width: 104, height: 104, borderRadius: 2 }} label={p.caption ?? undefined} />
                  {p.caption || p.note ? (
                    <T variant="fine" color="#6B5A48" numberOfLines={1} style={{ position: 'absolute', left: 6, right: 6, bottom: 4, textAlign: 'center', fontSize: 11 }}>
                      {p.caption || p.note}
                    </T>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Part>
      )}
      {m.photos.partner && !m.photos.partner.photo_path && (
        <T variant="small" muted>
          {partnerName} added a photo. It shows once you&apos;ve added yours.
        </T>
      )}
      {(m.answers.mine || m.answers.partner) && (
        <Part emoji="💬" title="Daily question" tint={c.accent}>
          {question ? (
            <T variant="strong" style={{ fontStyle: 'italic' }}>
              “{question.text}”
            </T>
          ) : null}
          {m.answers.mine?.body && (
            <Quote who="You" tint={c.accent}>
              <T>{m.answers.mine.body}</T>
            </Quote>
          )}
          {m.answers.partner &&
            (m.answers.partner.body ? (
              <Quote who={partnerName} tint={c.accent2}>
                <T>{m.answers.partner.body}</T>
              </Quote>
            ) : (
              <T variant="small" muted>
                {partnerName} answered. You&apos;ll see it once you&apos;ve answered too.
              </T>
            ))}
        </Part>
      )}
      {m.memories.length > 0 && (
        <Part emoji="💞" title="Memories" tint={c.accent2}>
          {m.memories.map((mem) => (
            <T key={mem.id}>
              {mem.caption}
              {mem.place ? <T muted>{` · ${mem.place}`}</T> : null}
            </T>
          ))}
        </Part>
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
  const dark = useColorScheme() === 'dark';
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
  // Every plan this month, counted once even when it runs over several days.
  const monthPlans = new Set([...byDay.values()].flat().map((o) => `${o.plan.id}-${o.start}`)).size;
  const page = dateParts(parseISODate(selected));

  const soonest = upcoming[0];
  const soonestIcon = soonest ? iconFor(soonest.plan) : null;
  const nextPlan: Next | null =
    soonest && soonestIcon
      ? { day: soonest.start, title: soonest.plan.title, emoji: soonestIcon.emoji, icon: soonestIcon, kind: 'plan', end: soonest.end > soonest.start ? soonest.end : undefined }
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

  /** A plan as a ticket: a coloured stub with the date or the time, then what it is. */
  const planRow = (o: Occurrence, day: string | null) => {
    const p = o.plan;
    const several = o.end > o.start;
    const repeats = isRepeat(p.repeats);
    const ongoing = !day && o.start < todayIso;
    // On a later day of a trip, the start time doesn't apply.
    const time = day && day !== o.start ? 'All day' : timeLabel(p.time);
    const [clock, half] = time === 'All day' ? ['', ''] : time.split(' ');
    // Trips, repeating plans and one-off plans each have their own colour.
    const tint = several ? c.accent3 : repeats ? c.accent2 : c.accent;
    const onTint = several ? c.onAccent3 : repeats ? c.onAccent2 : c.onAccent;
    const deep = mix(tint, c.ink, 0.3);
    const when = dateParts(parseISODate(ongoing ? todayIso : o.start));
    const away = daysBetween(today(), parseISODate(o.start));
    const soon = ongoing ? 'On now' : away === 0 ? 'Today' : away === 1 ? 'Tomorrow' : `In ${away} days`;
    const notch = { position: 'absolute', left: 64, width: 16, height: 16, borderRadius: 8, backgroundColor: c.page } as const;
    return (
      <Pressable
        key={`${p.id}-${o.start}`}
        onPress={() => openPlan(o, day ?? (ongoing ? todayIso : o.start))}
        onLongPress={() => openPlan(o, day ?? (ongoing ? todayIso : o.start))}
        accessibilityRole="button"
        accessibilityHint="Opens it to change, skip or delete"
        style={({ pressed }) => ({
          flexDirection: 'row',
          backgroundColor: c.surface,
          borderColor: c.line,
          borderWidth: 1,
          borderRadius: radius.lg,
          boxShadow: lift(c, dark, 4),
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        })}>
        <View
          style={{
            width: 72,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: space.md,
            backgroundColor: tint,
            backgroundImage: `linear-gradient(160deg, ${mix(tint, '#FFFFFF', 0.22)} 0%, ${tint} 75%)`,
            borderTopLeftRadius: radius.lg - 1,
            borderBottomLeftRadius: radius.lg - 1,
          }}>
          {day ? (
            clock ? (
              <>
                <T variant="heading" color={onTint} style={{ fontSize: 20, lineHeight: 25 }}>
                  {clock}
                </T>
                <T variant="eyebrow" color={onTint} style={{ fontSize: 10, opacity: 0.85 }}>
                  {half}
                </T>
              </>
            ) : (
              <>
                <Glyph name={several ? 'trip' : repeats ? 'repeat' : 'today'} color={onTint} size={24} />
                <T variant="eyebrow" color={onTint} style={{ fontSize: 10, opacity: 0.85 }}>
                  All day
                </T>
              </>
            )
          ) : (
            <>
              <T variant="eyebrow" color={onTint} style={{ fontSize: 10, opacity: 0.85 }}>
                {when.weekday}
              </T>
              <T variant="title" color={onTint} style={{ fontSize: 28, lineHeight: 32 }}>
                {when.day}
              </T>
              <T variant="eyebrow" color={onTint} style={{ fontSize: 10, opacity: 0.85 }}>
                {when.month}
              </T>
            </>
          )}
        </View>
        {/* The notches where a ticket tears off. */}
        <View style={[notch, { top: -8 }]} />
        <View style={[notch, { bottom: -8 }]} />
        <View style={{ flex: 1, flexDirection: 'row', paddingVertical: space.md, paddingHorizontal: space.md, gap: space.sm + 2 }}>
          <PlanIconView icon={iconFor(p)} size={36} tint={tint} />
          <View style={{ flex: 1, gap: 3 }}>
            <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
              <T variant="strong" style={{ flex: 1 }}>
                {p.title}
              </T>
              {!day && (
                <View style={{ paddingHorizontal: 9, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: alpha(tint, dark ? 0.24 : 0.16) }}>
                  <T variant="fine" color={deep} style={{ fontWeight: '800' }}>
                    {soon}
                  </T>
                </View>
              )}
            </Row>
            {!day && (
              <T variant="small" muted>
                {time}
              </T>
            )}
            {several && (
              <T variant="small" color={deep} style={{ fontWeight: '700' }}>
                {day ? `${dayOf(o, day)} · ${rangeLabel(o)}` : rangeLabel(o)}
              </T>
            )}
            {repeats && (
              <T variant="small" muted>
                🔁 {repeatLabel(p)}
              </T>
            )}
            {p.note ? <T variant="small" muted>{p.note}</T> : null}
            <T variant="fine">{p.created_by === userId ? 'Added by you' : `Added by ${partner.name}`}</T>
          </View>
        </View>
      </Pressable>
    );
  };

  const future = selected >= todayIso;
  const pick = idea?.day === selected ? idea.pick : null;
  const legendDot = (color: string) => <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, justifyContent: 'space-between' }}>
        <T variant="title">Calendar</T>
        <IconButton label="Add a plan" accent onPress={() => router.push({ pathname: '/new-plan', params: { day: selected } })}>
          <Glyph name="plus" color={c.onAccent} />
        </IconButton>
      </Row>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: tabBarInset + space.xl, gap: space.md }}>
        <Countdown next={next} onPress={() => (next ? jump(next.day) : router.push({ pathname: '/new-plan', params: { day: selected } }))} />

        {/* The month, on a card of its own. */}
        <View
          style={{
            backgroundColor: c.surface,
            backgroundImage: `linear-gradient(165deg, ${alpha(c.accent2, dark ? 0.12 : 0.1)} 0%, ${alpha(c.surface, 0)} 42%, ${alpha(c.accent, dark ? 0.1 : 0.06)} 100%)`,
            borderWidth: 1,
            borderColor: alpha(c.accent2, dark ? 0.35 : 0.45),
            borderRadius: radius.xl,
            padding: space.sm,
            paddingTop: space.md,
            gap: space.sm,
            boxShadow: lift(c, dark, 8),
          }}>
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
            <IconButton label="Previous month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <Glyph name="prev" color={c.ink} />
            </IconButton>
            <View style={{ alignItems: 'center' }} accessible accessibilityRole="header" accessibilityLabel={monthLabel(month)}>
              <T variant="title" style={{ fontSize: 26, lineHeight: 31 }}>
                {month.toLocaleDateString('en-GB', { month: 'long' })}
              </T>
              <T variant="eyebrow" color={mix(c.accent2, c.ink, 0.25)} style={{ fontSize: 10.5 }}>
                {`${month.getFullYear()} · ${monthPlans === 0 ? 'nothing planned yet' : monthPlans === 1 ? '1 plan' : `${monthPlans} plans`}`}
              </T>
            </View>
            <IconButton label="Next month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <Glyph name="next" color={c.ink} />
            </IconButton>
          </Row>

          <View>
            <View style={{ flexDirection: 'row' }}>
              {WEEKDAYS.map((w, i) => (
                <T key={w} variant="eyebrow" color={i >= 5 ? c.accent : c.muted} style={{ flex: 1, textAlign: 'center', paddingVertical: 4 }}>
                  {w}
                </T>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.map((iso, i) => {
                if (!iso) return <View key={`blank-${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
                const isSel = iso === selected;
                const isToday = iso === todayIso;
                const past = iso < todayIso;
                const onDay = byDay.get(iso) ?? [];
                const has = onDay.length > 0;
                // Each plan's icon, on its first day here: a trip's shows where it starts, or on the 1st if it began last month.
                const marks = onDay.filter((o) => o.end === o.start || o.start === iso || (o.start < first && iso === first)).slice(0, 2);
                const trips = onDay.filter((o) => o.end > o.start);
                const tripStart = trips.some((o) => o.start === iso);
                const tripEnd = trips.some((o) => o.end === iso);
                const col = i % 7;
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
                // A trip's band is round where it starts and ends, and a little round where it wraps to the next week.
                const left = tripStart ? radius.sm : col === 0 ? 5 : 0;
                const right = tripEnd ? radius.sm : col === 6 ? 5 : 0;
                return (
                  <Pressable
                    key={iso}
                    onPress={() => setSelected(iso)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSel }}
                    accessibilityLabel={label}
                    style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }}>
                    {trips.length > 0 && (
                      // A band that runs across every day of a trip.
                      <View
                        style={{
                          position: 'absolute',
                          top: 5,
                          bottom: 5,
                          left: tripStart ? 3 : 0,
                          right: tripEnd ? 3 : 0,
                          backgroundColor: alpha(c.accent3, dark ? 0.34 : 0.24),
                          borderTopLeftRadius: left,
                          borderBottomLeftRadius: left,
                          borderTopRightRadius: right,
                          borderBottomRightRadius: right,
                        }}
                      />
                    )}
                    <View
                      style={[
                        { flex: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', gap: 2 },
                        bothFree && { backgroundColor: alpha(c.accent2, dark ? 0.2 : 0.24), borderWidth: 1.5, borderStyle: 'dashed', borderColor: alpha(c.accent2, 0.8) },
                        isToday && { borderWidth: 2, borderStyle: 'solid', borderColor: c.accent },
                        isSel && {
                          backgroundColor: c.accent,
                          backgroundImage: `linear-gradient(150deg, ${mix(c.accent, c.accent2, 0.45)} 0%, ${c.accent} 70%)`,
                          borderWidth: 0,
                          boxShadow: `0px 4px 14px ${alpha(c.accent, dark ? 0.6 : 0.45)}`,
                        },
                      ]}>
                      {special && (
                        <T style={{ position: 'absolute', top: 1, right: 2, fontSize: 10, lineHeight: 13 }} accessibilityElementsHidden importantForAccessibility="no">
                          {special.emoji}
                        </T>
                      )}
                      <T
                        style={{ fontWeight: isSel || isToday ? '800' : '600', fontVariant: ['tabular-nums'], lineHeight: 19 }}
                        color={isSel ? c.onAccent : past ? alpha(c.ink, 0.45) : c.ink}>
                        {parseISODate(iso).getDate()}
                      </T>
                      <Row gap={1} style={{ height: 14, opacity: past && !isSel ? 0.6 : 1 }}>
                        {marks.map((o) => (
                          <PlanIconView key={`${o.plan.id}-${o.start}`} icon={iconFor(o.plan)} size={14} color={isSel ? c.onAccent : mix(c.accent, c.ink, 0.2)} />
                        ))}
                        {shared && <View style={{ width: 6, height: 6, marginLeft: 2, borderRadius: 3, backgroundColor: isSel ? c.onAccent : c.accent2 }} />}
                      </Row>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: c.line, marginHorizontal: space.sm }} />
          <Row gap={space.md} style={{ flexWrap: 'wrap', justifyContent: 'center', rowGap: 6, paddingBottom: 4 }}>
            <Row gap={5}>
              <PlanIconView icon={{ emoji: '📅', glyph: null }} size={13} />
              <T variant="fine">Plans</T>
            </Row>
            <Row gap={5}>
              <View style={{ width: 16, height: 8, borderRadius: 4, backgroundColor: alpha(c.accent3, dark ? 0.6 : 0.45) }} />
              <T variant="fine">Several days</T>
            </Row>
            <Row gap={5}>
              {legendDot(c.accent2)}
              <T variant="fine">Your day together</T>
            </Row>
            <Row gap={5}>
              <View style={{ width: 12, height: 12, borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed', borderColor: alpha(c.accent2, 0.8), backgroundColor: alpha(c.accent2, 0.24) }} />
              <T variant="fine">Both free</T>
            </Row>
          </Row>
        </View>

        {/* The chosen day, like a page torn from a desk calendar. */}
        <Row gap={space.md} style={{ marginTop: space.md }}>
          <View style={{ width: 58, borderRadius: radius.sm, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, boxShadow: lift(c, dark, 3) }}>
            <View
              style={{
                alignItems: 'center',
                paddingVertical: 3,
                backgroundColor: c.accent,
                backgroundImage: `linear-gradient(90deg, ${c.accent} 0%, ${mix(c.accent, c.accent2, 0.5)} 100%)`,
                borderTopLeftRadius: radius.sm - 1,
                borderTopRightRadius: radius.sm - 1,
              }}>
              <T variant="eyebrow" color={c.onAccent} style={{ fontSize: 10, letterSpacing: 1.2 }}>
                {page.weekday}
              </T>
            </View>
            <View style={{ alignItems: 'center', paddingTop: 1, paddingBottom: 5 }}>
              <T variant="title" style={{ fontSize: 26, lineHeight: 30 }}>
                {page.day}
              </T>
              <T variant="fine" style={{ lineHeight: 14 }}>
                {page.month}
              </T>
            </View>
            {/* The rings it hung from. */}
            <View style={{ position: 'absolute', top: -4, left: 13, width: 6, height: 10, borderRadius: 3, backgroundColor: mix(c.muted, c.ink, 0.3) }} />
            <View style={{ position: 'absolute', top: -4, right: 13, width: 6, height: 10, borderRadius: 3, backgroundColor: mix(c.muted, c.ink, 0.3) }} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <T variant="heading" accessibilityRole="header">
              {dayLabel(selected)}
            </T>
            <T variant="small" muted>
              {[
                parseISODate(selected).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
                selectedPlans.length === 1 ? '1 plan' : selectedPlans.length > 1 ? `${selectedPlans.length} plans` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </T>
          </View>
          {selected !== todayIso && (
            <Pressable
              onPress={() => jump(todayIso)}
              accessibilityRole="button"
              accessibilityLabel="Back to today"
              hitSlop={6}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radius.pill,
                backgroundColor: alpha(c.accent, 0.14),
                borderWidth: 1,
                borderColor: alpha(c.accent, 0.45),
                opacity: pressed ? 0.8 : 1,
              })}>
              <T variant="fine" color={mix(c.accent, c.ink, 0.25)} style={{ fontWeight: '800' }}>
                Today
              </T>
            </Pressable>
          )}
        </Row>

        {selectedSpecial.map((s) => (
          <Pressable
            key={`${s.kind}-${s.title}`}
            disabled={!s.link}
            onPress={() => s.link && router.push(s.link as never)}
            accessibilityRole={s.link ? 'button' : undefined}
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: space.md,
              alignItems: 'center',
              backgroundColor: c.accentSoft,
              backgroundImage: `linear-gradient(120deg, ${alpha(c.accent2, dark ? 0.3 : 0.32)} 0%, ${alpha(c.accent, dark ? 0.2 : 0.14)} 100%)`,
              borderWidth: 1,
              borderColor: alpha(c.accent2, 0.55),
              borderRadius: radius.lg,
              padding: space.md,
              opacity: pressed ? 0.8 : 1,
            })}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: alpha(c.surface, 0.8), alignItems: 'center', justifyContent: 'center' }}>
              <T style={{ fontSize: 26, lineHeight: 32 }}>{s.emoji}</T>
            </View>
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
          <View
            style={{
              backgroundColor: c.surface,
              backgroundImage: bothFreeSelected
                ? `linear-gradient(130deg, ${alpha(c.accent2, 0.3)} 0%, ${alpha(c.accent, dark ? 0.18 : 0.12)} 100%)`
                : `linear-gradient(130deg, ${alpha(c.accent3, dark ? 0.16 : 0.1)} 0%, ${alpha(c.surface, 0)} 65%)`,
              borderColor: bothFreeSelected ? c.accent2 : c.line,
              borderWidth: bothFreeSelected ? 2 : 1,
              borderRadius: radius.lg,
              padding: space.md,
              gap: space.sm,
              boxShadow: lift(c, dark, 3),
            }}>
            <Row>
              <Badge emoji={bothFreeSelected ? '🥂' : '🌙'} tint={bothFreeSelected ? c.accent2 : c.accent3} size={38} />
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="strong">{bothFreeSelected ? 'You’re both free this evening 🎉' : 'Free this evening?'}</T>
                <T variant="small" muted>
                  {selectedFree.them ? `${partner.name} is free.` : `${partner.name} hasn’t said yet.`}
                  {selectedFree.me ? ' You are too.' : ''}
                </T>
              </View>
              <Pressable
                onPress={() => toggleFree(!selectedFree.me)}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedFree.me }}
                style={({ pressed }) => ({
                  minHeight: 42,
                  paddingHorizontal: 16,
                  borderRadius: radius.pill,
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: selectedFree.me ? c.accent : alpha(c.accent, 0.55),
                  backgroundColor: selectedFree.me ? c.accent : alpha(c.accent, 0.06),
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                })}>
                <T variant="small" color={selectedFree.me ? c.onAccent : mix(c.accent, c.ink, 0.2)} style={{ fontWeight: '800' }}>
                  {selectedFree.me ? 'I’m free ✓' : 'I’m free'}
                </T>
              </Pressable>
            </Row>
            {bothFreeSelected && pick && (
              <View style={{ gap: space.sm, borderTopWidth: 1, borderTopColor: alpha(c.accent2, 0.5), paddingTop: space.sm }}>
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

        {selectedPlans.length ? (
          selectedPlans.map((o) => planRow(o, selected))
        ) : future ? (
          <Pressable
            onPress={() => router.push({ pathname: '/new-plan', params: { day: selected } })}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: alpha(c.accent, 0.5),
              backgroundColor: alpha(c.accent, dark ? 0.08 : 0.05),
              borderRadius: radius.lg,
              padding: space.md,
              opacity: pressed ? 0.8 : 1,
            })}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph name="plus" color={c.onAccent} size={20} />
            </View>
            <T variant="small" muted style={{ flex: 1 }}>
              Nothing planned. Tap here to add something for you both.
            </T>
          </Pressable>
        ) : null}

        {!future || selected === todayIso ? (
          <>
            <Heading emoji="📔" title="Your day together" tint={c.accent2} />
            <OurDay day={selected} m={moments.get(selected)} partnerName={partner.name} question={selectedQuestion} onOpenPhoto={(photos, start) => setViewer({ photos, start })} />
          </>
        ) : null}

        <Heading emoji="🎟️" title="Coming up" tint={c.accent3} />
        {upcoming.length ? upcoming.map((o) => planRow(o, null)) : <Empty>No plans ahead yet.</Empty>}
        <T variant="fine" style={{ textAlign: 'center' }}>
          Tap a plan to change it, skip it once, or delete it.
        </T>
      </ScrollView>
      <Sheet open={!!open} onClose={() => setOpen(null)}>
        {open && !confirmDelete && (
          <>
            <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
              <PlanIconView icon={iconFor(open.o.plan)} size={46} tint={c.accent} />
              <View style={{ flex: 1, gap: 4 }}>
                <T variant="heading">{open.o.plan.title}</T>
                <T variant="small" accent style={{ fontWeight: '700' }}>
                  {open.o.end > open.o.start ? `${rangeLabel(open.o)} · ${dayOf(open.o, open.day)}` : dayLabel(open.o.start)}
                  {/* On a later day of a trip, the start time doesn't apply. */}
                  {open.o.plan.time && open.day === open.o.start ? ` · ${timeLabel(open.o.plan.time)}` : ''}
                </T>
                {isRepeat(open.o.plan.repeats) && <T variant="small" muted>🔁 {repeatLabel(open.o.plan)}</T>}
                {open.o.plan.note ? <T variant="small">{open.o.plan.note}</T> : null}
              </View>
            </Row>
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
