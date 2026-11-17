import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, DateField, ErrorText, Field, Row, T } from '@/components/ui';
import { toISODate, today } from '@/lib/dates';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';

export default function NewPlan() {
  const c = useColors();
  const ctx = useCouple();
  // title and match come from a date idea: match links the new plan to it.
  const params = useLocalSearchParams<{ day?: string; title?: string; match?: string }>();
  const [title, setTitle] = useState(params.title ?? '');
  const [day, setDay] = useState<string | null>(params.day ?? toISODate(today()));
  const [time, setTime] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [remind, setRemind] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!ctx) return null;
  const { couple, partner } = ctx;

  async function save() {
    setError('');
    if (!title.trim()) return setError('Give your plan a name.');
    if (!day) return setError('Pick a date.');
    setBusy(true);
    const { data, error: err } = await supabase
      .from('events')
      .insert({
        couple_id: couple.id,
        title: title.trim(),
        day,
        time,
        note: note.trim() || null,
        remind,
      })
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
          <T variant="title">{params.match ? 'Plan your date' : 'New plan'}</T>
          <Field label="What" value={title} onChangeText={setTitle} placeholder="e.g. Picnic in the park" maxLength={120} autoFocus />
          <Row style={{ alignItems: 'flex-start' }}>
            <DateField label="Date" value={day} onChange={setDay} />
            <DateField label="Time" value={time} onChange={setTime} mode="time" placeholder="All day" />
          </Row>
          {time && <Button title="Make it all day" variant="ghost" onPress={() => setTime(null)} />}
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" maxLength={500} />
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T variant="strong">Remind us both</T>
              <T variant="small" muted>
                An hour before, or at 9 AM on the day for an all-day plan.
              </T>
            </View>
            <Switch value={remind} onValueChange={setRemind} trackColor={{ true: c.accent, false: c.line }} />
          </Row>
          <ErrorText>{error}</ErrorText>
          <Row>
            <Button style={{ flex: 1 }} title="Cancel" variant="outline" onPress={() => router.back()} />
            <Button style={{ flex: 1 }} title="Add plan" onPress={save} loading={busy} />
          </Row>
          <T variant="fine" style={{ textAlign: 'center' }}>
            {partner.name} sees this plan too.
          </T>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
