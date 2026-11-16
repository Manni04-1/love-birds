import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, Card, ErrorText, Field, Glyph, IconButton, Row, T } from '@/components/ui';
import { clockLabel, dayLabel, today } from '@/lib/dates';
import { useQuestions } from '@/lib/questions';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';

export default function QuestionScreen() {
  const c = useColors();
  const ctx = useCouple();
  const { today: q, past, reload } = useQuestions(ctx?.userId, 14);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      reload();
      // Check again every 15 seconds so a partner's answer unlocks without leaving the screen.
      const t = setInterval(reload, 15000);
      return () => clearInterval(t);
    }, [reload]),
  );

  if (!ctx) return null;
  const { profile, partner, couple } = ctx;

  async function submit() {
    if (!q?.question) return;
    setError('');
    if (!answer.trim()) return setError('Write something first. Even one line is perfect.');
    setBusy(true);
    const { error: err } = await supabase.from('answers').insert({
      couple_id: couple.id,
      day: q.day,
      question_id: q.question.id,
      body: answer.trim(),
    });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setAnswer('');
    await reload();
  }

  const todayLabel = today().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
          <IconButton label="Back" onPress={() => router.back()}>
            <Glyph name="back" color={c.ink} />
          </IconButton>
          <T variant="strong" style={{ fontSize: 18 }}>
            Daily question
          </T>
        </Row>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
          <T variant="eyebrow">{todayLabel}</T>
          <T variant="title">{q?.question?.text ?? 'Loading…'}</T>

          {q && !q.mine && (
            <>
              <Card>
                <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                  <Avatar name={partner.name} partner size={38} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <T variant="small" muted style={{ fontWeight: '700' }}>
                      {q.partner ? `${partner.name} answered at ${clockLabel(q.partner.created_at)}` : `${partner.name} hasn't answered yet`}
                    </T>
                    <Row gap={6}>
                      <Glyph name="lock" color={c.muted} size={14} />
                      <T variant="small" muted>
                        Answer to unlock
                      </T>
                    </Row>
                  </View>
                </Row>
              </Card>
              <Field label="Your answer" value={answer} onChangeText={setAnswer} multiline placeholder="Write your answer" maxLength={2000} />
              <ErrorText>{error}</ErrorText>
              <Button title="Share my answer" onPress={submit} loading={busy} />
              <T variant="fine">Neither of you sees the other&apos;s answer until you&apos;ve both replied.</T>
            </>
          )}

          {q?.mine && (
            <>
              <Card>
                <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                  <Avatar name={profile.name} size={38} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="small" muted style={{ fontWeight: '700' }}>
                      You
                    </T>
                    <T>{q.mine.body}</T>
                  </View>
                </Row>
              </Card>
              <Card>
                <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                  <Avatar name={partner.name} partner size={38} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="small" muted style={{ fontWeight: '700' }}>
                      {partner.name}
                    </T>
                    <T muted={!q.partner?.body}>{q.partner?.body ?? `Waiting for ${partner.name} to answer. You'll both see each other's answers then.`}</T>
                  </View>
                </Row>
              </Card>
              <T variant="fine">A new question arrives tomorrow.</T>
            </>
          )}

          {past.length > 0 && (
            <T variant="strong" style={{ marginTop: space.md }}>
              Earlier questions
            </T>
          )}
          {past.map((p) => (
            <Card key={p.day}>
              <T variant="fine">{dayLabel(p.day)}</T>
              <T variant="strong">{p.question?.text}</T>
              <T variant="small">
                <T variant="small" muted style={{ fontWeight: '700' }}>
                  You:{' '}
                </T>
                {p.mine?.body ?? 'No answer'}
              </T>
              <T variant="small">
                <T variant="small" muted style={{ fontWeight: '700' }}>
                  {partner.name}:{' '}
                </T>
                {p.partner?.body ?? (p.partner ? 'Hidden, because you skipped this one' : 'No answer')}
              </T>
            </Card>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
