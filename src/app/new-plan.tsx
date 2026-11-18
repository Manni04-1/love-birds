import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Chip, DateField, ErrorText, Field, Row, T } from '@/components/ui';
import { addDays, daysBetween, parseISODate, toISODate, today } from '@/lib/dates';
import { isRepeat, longestSpan, REPEATS, span, type Repeat } from '@/lib/plans';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';
import type { Plan } from '@/lib/types';

/** Add a plan, or change one (with ?id=). A plan can last several days and can repeat. */
export default function NewPlan() {
  const c = useColors();
  const ctx = useCouple();
  // title and match come from a date idea: match links the new plan to it. id changes an existing plan.
  const params = useLocalSearchParams<{ day?: string; title?: string; match?: string; id?: string }>();
  const editing = typeof params.id === 'string' && params.id.length > 0;
  const [loaded, setLoaded] = useState(!editing);
  const [title, setTitle] = useState(params.title ?? '');
  const [day, setDay] = useState<string | null>(params.day ?? toISODate(today()));
  const [endDay, setEndDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [repeats, setRepeats] = useState<Repeat | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [remind, setRemind] = useState(true);
  // The plan being changed already lasts several days or repeats, so those can be switched off.
  const [had, setHad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) return;
    let live = true;
    supabase
      .from('events')
      .select('*')
      .eq('id', params.id!)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!live) return;
        const p = data as Plan | null;
        if (err || !p) {
          setError(err ? friendlyError(err) : 'This plan has been deleted.');
        } else {
          setTitle(p.title);
          setDay(p.day);
          setEndDay(span(p) > 0 ? p.end_day! : null);
          setTime(p.time ? p.time.slice(0, 8) : null);
          setRepeats(isRepeat(p.repeats) ? p.repeats : null);
          setUntil(p.repeat_until ?? null);
          setNote(p.note ?? '');
          setRemind(p.remind);
          setHad(!!p.end_day || !!p.repeats);
        }
        setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [editing, params.id]);

  if (!ctx) return null;
  const { couple, partner } = ctx;
  const days = day && endDay && endDay > day ? daysBetween(parseISODate(day), parseISODate(endDay)) : 0;

  async function save() {
    setError('');
    if (!title.trim()) return setError('Give your plan a name.');
    if (!day) return setError('Pick a date.');
    if (endDay && endDay < day) return setError('It can’t end before it starts.');
    if (days > 366) return setError('A plan can last up to a year.');
    if (repeats && days > longestSpan(repeats)) return setError('It lasts longer than the time between repeats. Make it shorter, or repeat it less often.');
    if (repeats && until && until < day) return setError('It can’t stop repeating before it starts.');
    setBusy(true);
    const row = {
      title: title.trim(),
      day,
      time,
      note: note.trim() || null,
      remind,
      // Only sent when used, so plain plans still save before calendar.sql has run.
      ...(days > 0 || had ? { end_day: days > 0 ? endDay : null } : {}),
      ...(repeats || had ? { repeats, repeat_until: repeats ? until : null } : {}),
    };
    if (editing) {
      const { error: err } = await supabase.from('events').update(row).eq('id', params.id!);
      setBusy(false);
      if (err) return setError(friendlyError(err));
      return router.back();
    }
    const { data, error: err } = await supabase
      .from('events')
      .insert({ ...row, couple_id: couple.id })
      .select('id')
      .single();
    if (!err && params.match && data) {
      // Best effort: the plan is saved either way.
      await supabase.from('date_matches').update({ event_id: data.id }).eq('couple_id', couple.id).eq('idea_id', params.match);
    }
    setBusy(false);
    if (err) return setError(friendlyError(err));
    router.back();
  }

  const whenRemind = time ? 'An hour before' : 'At 9 AM on the day';
  const remindNote = `${whenRemind}${days > 0 ? ' it starts' : ''}${repeats ? ', each time it comes round' : ''}.`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {!loaded ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: space.xxl }} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
            <T variant="title">{editing ? 'Change plan' : params.match ? 'Plan your date' : 'New plan'}</T>
            <Field label="What" value={title} onChangeText={setTitle} placeholder="e.g. Picnic in the park" maxLength={120} autoFocus={!editing} />
            <Row style={{ alignItems: 'flex-start' }}>
              <DateField
                label={days > 0 ? 'Starts' : 'Date'}
                value={day}
                onChange={(d) => {
                  // Moving the start keeps a trip the same length.
                  if (d && day && endDay && days > 0) setEndDay(toISODate(addDays(parseISODate(d), days)));
                  setDay(d);
                }}
              />
              <DateField label="Time" value={time} onChange={setTime} mode="time" placeholder="All day" />
            </Row>
            {time && <Button title="Make it all day" variant="ghost" onPress={() => setTime(null)} />}

            <View style={{ gap: space.sm }}>
              <Row style={{ alignItems: 'flex-start' }}>
                <DateField
                  label="Ends"
                  value={days > 0 ? endDay : null}
                  onChange={setEndDay}
                  placeholder="Same day"
                  initial={day ? toISODate(addDays(parseISODate(day), 1)) : null}
                  minimumDate={day ? addDays(parseISODate(day), 1) : undefined}
                />
                <View style={{ flex: 1, justifyContent: 'flex-end', alignSelf: 'stretch', paddingBottom: 14 }}>
                  <T variant="small" muted>
                    {days > 0 ? `${days + 1} days` : 'For trips and weekends away'}
                  </T>
                </View>
              </Row>
              {days > 0 && <Button title="Just one day" variant="ghost" onPress={() => setEndDay(null)} />}
            </View>

            <View style={{ gap: space.sm }}>
              <T variant="small" muted style={{ fontWeight: '700' }}>
                Repeats
              </T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.sm }}>
                <Chip label="Never" selected={!repeats} onPress={() => setRepeats(null)} />
                {REPEATS.map((r) => (
                  <Chip key={r.key} label={r.label} selected={repeats === r.key} onPress={() => setRepeats(r.key)} />
                ))}
              </ScrollView>
              {repeats && (
                <>
                  <Row style={{ alignItems: 'flex-start' }}>
                    <DateField label="Until" value={until} onChange={setUntil} placeholder="Forever" initial={day} minimumDate={day ? parseISODate(day) : undefined} />
                    <View style={{ flex: 1 }} />
                  </Row>
                  {until && <Button title="Keep it going" variant="ghost" onPress={() => setUntil(null)} />}
                </>
              )}
            </View>

            <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" maxLength={500} />
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T variant="strong">Remind us both</T>
                <T variant="small" muted>
                  {remindNote}
                </T>
              </View>
              <Switch value={remind} onValueChange={setRemind} trackColor={{ true: c.accent, false: c.line }} />
            </Row>
            <ErrorText>{error}</ErrorText>
            <Row>
              <Button style={{ flex: 1 }} title="Cancel" variant="outline" onPress={() => router.back()} />
              <Button style={{ flex: 1 }} title={editing ? 'Save' : 'Add plan'} onPress={save} loading={busy} />
            </Row>
            <T variant="fine" style={{ textAlign: 'center' }}>
              {partner.name} sees this plan too.
            </T>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
