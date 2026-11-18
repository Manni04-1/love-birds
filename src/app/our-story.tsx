import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { BackHeader } from '@/components/game-ui';
import { Button, Chip, DateField, ErrorText, Field, Glyph, Row, Sheet, T } from '@/components/ui';
import { STORY_IDEAS } from '@/content/story';
import { addDays, daysBetween, longDate, parseISODate, today } from '@/lib/dates';
import { useCouple } from '@/lib/session';
import { specialDays } from '@/lib/special-days';
import { useMilestones } from '@/lib/story';
import { friendlyError, supabase } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';
import type { Milestone } from '@/lib/types';

const EMOJIS = ['💞', '👀', '🌹', '💋', '💬', '💑', '✈️', '🏡', '🐶', '💍', '💒', '👶', '🎓', '🎉', '🌍', '⭐'];

/** "3 years ago", "5 months ago", "12 days ago", "today". */
function sinceLabel(iso: string) {
  const d = parseISODate(iso);
  const t = today();
  const days = daysBetween(d, t);
  if (days < 0) return 'Still to come';
  if (days === 0) return 'Today';
  let months = (t.getFullYear() - d.getFullYear()) * 12 + (t.getMonth() - d.getMonth());
  if (t.getDate() < d.getDate()) months -= 1;
  if (months >= 12) {
    const y = Math.floor(months / 12);
    return `${y} ${y === 1 ? 'year' : 'years'} ago`;
  }
  if (months >= 1) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

type Entry = { key: string; day: string; emoji: string; title: string; note: string | null; milestone: Milestone | null };

type Draft = { id: string | null; title: string; emoji: string; day: string | null; note: string; yearly: boolean };

const blank: Draft = { id: null, title: '', emoji: '💞', day: null, note: '', yearly: true };

/** Your story: the firsts and the big moments, on a timeline, remembered every year. */
export default function OurStory() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const { milestones, reload } = useMilestones(coupleId, 'screen');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!ctx || !coupleId) return null;
  const { couple, partner, profile } = ctx;

  const entries: Entry[] = [
    ...(couple.together_since
      ? [{ key: 'together', day: couple.together_since, emoji: '💞', title: 'We got together', note: null, milestone: null }]
      : []),
    ...milestones.map((m) => ({ key: m.id, day: m.happened_on, emoji: m.emoji || '💞', title: m.title, note: m.note, milestone: m })),
  ].sort((a, b) => a.day.localeCompare(b.day));

  const have = new Set(milestones.map((m) => m.title.trim().toLowerCase()));
  const ideas = STORY_IDEAS.filter((i) => !have.has(i.title.toLowerCase()));
  const next = specialDays(today(), addDays(today(), 366), {
    togetherSince: couple.together_since,
    myBirthday: null,
    partnerBirthday: null,
    partnerName: partner.name,
    story: milestones,
  }).find((s) => s.kind === 'story' || s.kind === 'anniversary');
  const nextIn = next ? daysBetween(today(), parseISODate(next.day)) : null;

  function edit(m: Milestone) {
    setError('');
    setConfirmRemove(false);
    setDraft({ id: m.id, title: m.title, emoji: m.emoji || '💞', day: m.happened_on, note: m.note ?? '', yearly: m.yearly });
  }

  async function save() {
    if (!draft) return;
    setError('');
    if (!draft.title.trim()) return setError('What happened?');
    if (!draft.day) return setError('Pick the day it happened. A guess is fine.');
    setBusy(true);
    const row = { title: draft.title.trim().slice(0, 80), emoji: draft.emoji, happened_on: draft.day, note: draft.note.trim().slice(0, 500) || null, yearly: draft.yearly };
    const { error: err } = draft.id
      ? await supabase.from('milestones').update(row).eq('id', draft.id)
      : await supabase.from('milestones').insert({ ...row, couple_id: coupleId });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setDraft(null);
    reload();
  }

  async function remove() {
    if (!draft?.id) return;
    setBusy(true);
    const { error: err } = await supabase.from('milestones').delete().eq('id', draft.id);
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setDraft(null);
    reload();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <BackHeader title="Our story" home="/together" />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.lg, paddingBottom: space.xxl }}>
        <View style={{ gap: 4 }}>
          <T variant="title">
            {profile.name} & {partner.name}
          </T>
          <T variant="small" muted>
            The firsts and the big moments. Each one comes back on the calendar every year, with a little reminder on the day.
          </T>
          {next && nextIn !== null && (
            <T variant="small" accent style={{ fontWeight: '700' }}>
              Next: {next.emoji} {next.title}, {nextIn === 0 ? 'today!' : nextIn === 1 ? 'tomorrow' : `in ${nextIn} days`}
            </T>
          )}
        </View>

        {entries.length === 0 ? (
          <View style={{ gap: space.sm }}>
            <T variant="small" muted>
              Start with how it all began.
            </T>
          </View>
        ) : (
          <View>
            {entries.map((e, i) => {
              const last = i === entries.length - 1;
              return (
                <Pressable
                  key={e.key}
                  onPress={() => (e.milestone ? edit(e.milestone) : router.push('/settings'))}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.title}, ${longDate(e.day)}`}
                  accessibilityHint={e.milestone ? 'Change or remove it' : 'Change it in Settings'}
                  style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, opacity: pressed ? 0.75 : 1 })}>
                  <View style={{ width: 48, alignItems: 'center' }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.accentSoft, borderWidth: 2, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                      <T style={{ fontSize: 22, lineHeight: 28 }}>{e.emoji}</T>
                    </View>
                    {!last && <View style={{ flex: 1, width: 3, minHeight: 24, backgroundColor: c.line, borderRadius: 2 }} />}
                  </View>
                  <View style={{ flex: 1, paddingTop: 4, paddingBottom: last ? 0 : space.lg, gap: 2 }}>
                    <T variant="eyebrow">{longDate(e.day)}</T>
                    <T variant="strong" style={{ fontSize: 18 }}>
                      {e.title}
                    </T>
                    {!!e.note && <T variant="small">{e.note}</T>}
                    <T variant="fine">{sinceLabel(e.day)}</T>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {ideas.length > 0 && (
          <View style={{ gap: space.sm }}>
            <T variant="eyebrow">Add a moment</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {ideas.map((i) => (
                <Chip
                  key={i.title}
                  label={`+ ${i.emoji} ${i.title}`}
                  selected={false}
                  onPress={() => {
                    setError('');
                    setConfirmRemove(false);
                    setDraft({ ...blank, title: i.title, emoji: i.emoji });
                  }}
                />
              ))}
            </View>
          </View>
        )}
        <Button
          title="Add your own moment"
          variant="outline"
          onPress={() => {
            setError('');
            setConfirmRemove(false);
            setDraft({ ...blank });
          }}
          icon={<Glyph name="plus" color={c.accent} size={18} />}
        />
      </ScrollView>

      <Sheet open={!!draft} onClose={() => setDraft(null)}>
        {draft && !confirmRemove && (
          <>
            <T variant="heading">{draft.id ? 'Change this moment' : 'Add to your story'}</T>
            <Field label="What happened" value={draft.title} onChangeText={(t) => setDraft({ ...draft, title: t })} placeholder="Our first dance" maxLength={80} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {EMOJIS.map((e) => {
                const on = e === draft.emoji;
                return (
                  <Pressable
                    key={e}
                    onPress={() => setDraft({ ...draft, emoji: e })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Use ${e}`}
                    style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }}>
                    <T style={{ fontSize: 20, lineHeight: 26 }}>{e}</T>
                  </Pressable>
                );
              })}
            </View>
            <Row style={{ alignItems: 'flex-start' }}>
              <DateField label="When" value={draft.day} onChange={(d) => setDraft({ ...draft, day: d })} maximumDate={today()} />
            </Row>
            <Field label="A few words (optional)" value={draft.note} onChangeText={(t) => setDraft({ ...draft, note: t })} placeholder="Where, how, what you wore…" maxLength={500} />
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="small" style={{ flex: 1 }}>
                Remember it every year
              </T>
              <Switch
                value={draft.yearly}
                onValueChange={(v) => setDraft({ ...draft, yearly: v })}
                trackColor={{ true: c.accent, false: c.line }}
                thumbColor={c.surface}
                accessibilityLabel="Remember it every year"
              />
            </Row>
            <ErrorText>{error}</ErrorText>
            <Button title={draft.id ? 'Save' : 'Add to our story'} onPress={save} loading={busy} />
            {draft.id && <Button title="Remove" variant="ghost" onPress={() => setConfirmRemove(true)} />}
          </>
        )}
        {draft && confirmRemove && (
          <>
            <T variant="heading">Remove “{draft.title}”?</T>
            <T variant="small" muted>
              It goes from both your stories.
            </T>
            <ErrorText>{error}</ErrorText>
            <Row>
              <Button style={{ flex: 1 }} title="Keep it" variant="outline" onPress={() => setConfirmRemove(false)} />
              <Button style={{ flex: 1 }} title="Remove" variant="danger" loading={busy} onPress={remove} />
            </Row>
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}
