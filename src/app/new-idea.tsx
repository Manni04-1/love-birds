import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Field, Row, T } from '@/components/ui';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';

export default function NewIdea() {
  const c = useColors();
  const ctx = useCouple();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!ctx) return null;
  const { partner } = ctx;

  async function save() {
    setError('');
    if (!title.trim()) return setError('Give your idea a name.');
    setBusy(true);
    const { error: err } = await supabase.rpc('add_date_idea', { p_title: title.trim(), p_details: details.trim() });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    router.back();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
          <T variant="title">Your own date idea</T>
          <T muted>
            It goes straight into {partner.name}&apos;s deck. If they swipe right too, it&apos;s a match.
          </T>
          <Field label="The idea" value={title} onChangeText={setTitle} placeholder="e.g. Sunday lunch at our favourite spot" maxLength={120} autoFocus />
          <Field label="Details" value={details} onChangeText={setDetails} placeholder="Optional: where, what to bring, why it'll be fun" maxLength={500} multiline />
          <ErrorText>{error}</ErrorText>
          <Row>
            <Button style={{ flex: 1 }} title="Cancel" variant="outline" onPress={() => router.back()} />
            <Button style={{ flex: 1 }} title="Add idea" onPress={save} loading={busy} />
          </Row>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
