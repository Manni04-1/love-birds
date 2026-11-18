import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { BackHeader, LevelPicker, Option, Panel, Pill } from '@/components/game-ui';
import { Button, ErrorText, Row, T } from '@/components/ui';
import { levelInfo, unlockedLevels, WYR, type Level, type WyrQuestion } from '@/content/games';
import { saveGameAnswer, sharedHeat, useGameAnswers, wyrStats } from '@/lib/games';
import { useCouple } from '@/lib/session';
import { friendlyError } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';
import type { GameAnswer } from '@/lib/types';

/** Unanswered questions, the ones your partner already answered first. */
function queueFor(questions: WyrQuestion[], answers: Map<string, GameAnswer>) {
  return questions
    .filter((q) => answers.get(q.key)?.my_choice == null)
    .sort((a, b) => Number(!!answers.get(b.key)?.partner_answered) - Number(!!answers.get(a.key)?.partner_answered));
}

export default function WouldYouRather() {
  const c = useColors();
  const ctx = useCouple();
  const { answers, loaded, error, reload } = useGameAnswers('wyr');
  const [level, setLevel] = useState<Level>('light');
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [saveError, setSaveError] = useState('');

  if (!ctx) return null;
  const { profile, partner, couple } = ctx;
  const levels = unlockedLevels(sharedHeat(profile, partner));
  const active = levels.includes(level) ? level : 'light';
  const questions = WYR.filter((q) => q.level === active);
  const queue = queueFor(questions, answers);
  const current = (currentKey ? questions.find((q) => q.key === currentKey) : undefined) ?? queue[0];
  const mine = current ? answers.get(current.key) : undefined;
  const answered = questions.filter((q) => answers.get(q.key)?.my_choice != null && q.key !== current?.key);
  const stats = wyrStats(answers, new Set(questions.map((q) => q.key)));
  const badges = Object.fromEntries(levels.map((l) => [l, queueFor(WYR.filter((q) => q.level === l), answers).filter((q) => answers.get(q.key)?.partner_answered).length]));

  async function pick(choice: number) {
    if (!current) return;
    setSaveError('');
    setSaving(choice);
    setCurrentKey(current.key);
    try {
      await saveGameAnswer(couple.id, 'wyr', current.key, choice);
      await reload();
    } catch (e) {
      setSaveError(friendlyError(e));
    }
    setSaving(null);
  }

  const optionText = (q: WyrQuestion, i: number | null | undefined) => (i === 0 ? q.a : i === 1 ? q.b : null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <BackHeader title="Would you rather" />
      <LevelPicker
        levels={levels}
        value={active}
        badges={badges}
        onChange={(l) => {
          setLevel(l);
          setCurrentKey(null);
        }}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
        <ErrorText>{error ? friendlyError(error) : ''}</ErrorText>
        {stats.both > 0 && (
          <T variant="small" muted style={{ textAlign: 'center' }}>
            {levelInfo(active).label}: you agree on {stats.agree} of {stats.both}
          </T>
        )}

        {!loaded ? null : current ? (
          <Panel tone={mine?.my_choice != null ? 'plain' : 'soft'}>
            <T variant="eyebrow">Would you rather…</T>
            {[current.a, current.b].map((text, i) => {
              const isMine = mine?.my_choice === i;
              const isTheirs = mine?.partner_choice === i;
              return (
                <View key={i} style={{ gap: space.sm }}>
                  {i === 1 && (
                    <T variant="small" muted style={{ textAlign: 'center', fontWeight: '700' }}>
                      or
                    </T>
                  )}
                  <Option
                    label={text}
                    selected={isMine || saving === i}
                    disabled={mine?.my_choice != null || saving != null}
                    onPress={() => pick(i)}
                    trailing={
                      <Row gap={4}>
                        {isMine && <Pill accent>You</Pill>}
                        {isTheirs && <Pill>{partner.name}</Pill>}
                      </Row>
                    }
                  />
                </View>
              );
            })}
            {mine?.my_choice != null && (
              <View style={{ gap: space.md }}>
                <T style={{ textAlign: 'center' }} variant="strong">
                  {mine.partner_choice == null
                    ? `Waiting for ${partner.name}. Their pick shows here once they answer.`
                    : mine.partner_choice === mine.my_choice
                      ? `You both picked the same 💞`
                      : `Different picks! Ask ${partner.name} why 😄`}
                </T>
                {queue.length > 0 ? (
                  <Button title="Next question" onPress={() => setCurrentKey(null)} />
                ) : (
                  <T variant="small" muted style={{ textAlign: 'center' }}>
                    That was the last {levelInfo(active).label.toLowerCase()} question.
                  </T>
                )}
              </View>
            )}
            <ErrorText>{saveError}</ErrorText>
          </Panel>
        ) : (
          <Panel tone="soft">
            <T variant="strong">You&apos;ve answered every {levelInfo(active).label.toLowerCase()} question 🎉</T>
            <T variant="small">Try another level, or see how your answers compare below.</T>
          </Panel>
        )}

        {answered.length > 0 && (
          <View style={{ gap: space.sm }}>
            <T variant="eyebrow" style={{ marginLeft: 4 }}>
              Answered
            </T>
            {answered.map((q) => {
              const a = answers.get(q.key)!;
              const same = a.partner_choice != null && a.partner_choice === a.my_choice;
              return (
                <Panel key={q.key}>
                  <T variant="small" muted>
                    {q.a} <T variant="small" muted style={{ fontWeight: '700' }}>or</T> {q.b}
                  </T>
                  <View style={{ gap: 6 }}>
                    <Row gap={space.sm}>
                      <Pill accent>You</Pill>
                      <T variant="small" style={{ flex: 1 }}>
                        {optionText(q, a.my_choice)}
                      </T>
                    </Row>
                    <Row gap={space.sm}>
                      <Pill>{partner.name}</Pill>
                      <T variant="small" muted={a.partner_choice == null} style={{ flex: 1 }}>
                        {optionText(q, a.partner_choice) ?? 'Not answered yet'}
                      </T>
                      {same && <T>💞</T>}
                    </Row>
                  </View>
                </Panel>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
