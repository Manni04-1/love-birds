import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, LevelPicker, Option, Panel, Pill } from '@/components/game-ui';
import { Button, ErrorText, Glyph, Row, T } from '@/components/ui';
import { levelInfo, QUIZ, unlockedLevels, type Level, type QuizQuestion } from '@/content/games';
import { quizStats, saveGameAnswer, sharedHeat, useGameAnswers } from '@/lib/games';
import { useCouple } from '@/lib/session';
import { friendlyError } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';
import type { GameAnswer } from '@/lib/types';

function queueFor(questions: QuizQuestion[], answers: Map<string, GameAnswer>) {
  return questions
    .filter((q) => answers.get(q.key)?.my_choice == null)
    .sort((a, b) => Number(!!answers.get(b.key)?.partner_answered) - Number(!!answers.get(a.key)?.partner_answered));
}

const named = (text: string, name: string) => text.split('{name}').join(name);

function Verdict({ right }: { right: boolean }) {
  const c = useColors();
  return <Glyph name={right ? 'check' : 'close'} color={right ? c.accent : c.muted} size={18} />;
}

export default function Quiz() {
  const c = useColors();
  const ctx = useCouple();
  const { answers, loaded, error, reload } = useGameAnswers('quiz');
  const [level, setLevel] = useState<Level>('light');
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [self, setSelf] = useState<number | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  if (!ctx) return null;
  const { profile, partner, couple } = ctx;
  const levels = unlockedLevels(sharedHeat(profile, partner));
  const active = levels.includes(level) ? level : 'light';
  const questions = QUIZ.filter((q) => q.level === active);
  const queue = queueFor(questions, answers);
  const current = (currentKey ? questions.find((q) => q.key === currentKey) : undefined) ?? queue[0];
  const mine = current ? answers.get(current.key) : undefined;
  const locked = mine?.my_choice != null;
  const answered = questions.filter((q) => answers.get(q.key)?.my_choice != null && q.key !== current?.key);
  const allKeys = new Set(QUIZ.filter((q) => levels.includes(q.level)).map((q) => q.key));
  const stats = quizStats(answers, allKeys);
  const badges = Object.fromEntries(levels.map((l) => [l, queueFor(QUIZ.filter((q) => q.level === l), answers).filter((q) => answers.get(q.key)?.partner_answered).length]));

  function next() {
    setCurrentKey(null);
    setSelf(null);
    setGuess(null);
  }

  async function lockIn() {
    if (!current || self == null || guess == null) return;
    setSaveError('');
    setSaving(true);
    setCurrentKey(current.key);
    try {
      await saveGameAnswer(couple.id, 'quiz', current.key, self, guess);
      await reload();
    } catch (e) {
      setSaveError(friendlyError(e));
    }
    setSaving(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <BackHeader title="How well do you know me" />
      <LevelPicker levels={levels} value={active} badges={badges} onChange={(l) => { setLevel(l); next(); }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <ErrorText>{error ? friendlyError(error) : ''}</ErrorText>
        <Row gap={space.md}>
          <Panel style={{ flex: 1 }}>
            <T variant="fine">You know {partner.name}</T>
            <T variant="title" accent>
              {stats.youKnow}
              <T variant="heading" muted>/{stats.both}</T>
            </T>
          </Panel>
          <Panel style={{ flex: 1 }}>
            <T variant="fine">{partner.name} knows you</T>
            <T variant="title" accent>
              {stats.theyKnow}
              <T variant="heading" muted>/{stats.both}</T>
            </T>
          </Panel>
        </Row>

        {!loaded ? null : current ? (
          <Panel tone={locked ? 'plain' : 'soft'}>
            {!locked ? (
              <>
                <T variant="eyebrow">1 · About you</T>
                <T variant="heading">{current.self}</T>
                {current.options.map((o, i) => (
                  <Option key={i} label={o} selected={self === i} onPress={() => setSelf(i)} />
                ))}
                {self != null && (
                  <>
                    <T variant="eyebrow" style={{ marginTop: space.md }}>
                      2 · Your guess
                    </T>
                    <T variant="heading">{named(current.other, partner.name)}</T>
                    {current.options.map((o, i) => (
                      <Option key={i} label={o} selected={guess === i} onPress={() => setGuess(i)} />
                    ))}
                  </>
                )}
                <Button title="Lock it in" onPress={lockIn} loading={saving} disabled={self == null || guess == null} />
              </>
            ) : (
              <>
                <T variant="heading">{named(current.other, partner.name)}</T>
                {mine?.partner_choice == null ? (
                  <>
                    <Row gap={space.sm}>
                      <Pill accent>Your guess</Pill>
                      <T style={{ flex: 1 }}>{current.options[mine!.my_guess ?? 0]}</T>
                    </Row>
                    <T variant="small" muted>
                      Locked in. You&apos;ll see if you were right once {partner.name} answers.
                    </T>
                  </>
                ) : (
                  <>
                    <Row gap={space.sm}>
                      <Pill>{partner.name} said</Pill>
                      <T variant="strong" style={{ flex: 1 }}>
                        {current.options[mine.partner_choice]}
                      </T>
                    </Row>
                    <Row gap={space.sm}>
                      <Pill accent>You guessed</Pill>
                      <T style={{ flex: 1 }}>{current.options[mine.my_guess ?? 0]}</T>
                      <Verdict right={mine.my_guess === mine.partner_choice} />
                    </Row>
                    <T variant="strong" accent style={{ textAlign: 'center' }}>
                      {mine.my_guess === mine.partner_choice ? 'You know them! 🎯' : 'Not quite. Now you know 😉'}
                    </T>
                    <View style={{ height: 1, backgroundColor: c.line }} />
                    <T variant="small" muted>
                      {partner.name} guessed you&apos;d say &quot;{current.options[mine.partner_guess ?? 0]}&quot;.{' '}
                      {mine.partner_guess === mine.my_choice ? 'Right! 🎯' : `You said "${current.options[mine.my_choice!]}".`}
                    </T>
                  </>
                )}
                {queue.length > 0 ? (
                  <Button title="Next question" onPress={next} />
                ) : (
                  <T variant="small" muted style={{ textAlign: 'center' }}>
                    That was the last {levelInfo(active).label.toLowerCase()} question.
                  </T>
                )}
              </>
            )}
            <ErrorText>{saveError}</ErrorText>
          </Panel>
        ) : (
          <Panel tone="soft">
            <T variant="strong">You&apos;ve answered every {levelInfo(active).label.toLowerCase()} question 🎉</T>
            <T variant="small">Try another level, or see how you did below.</T>
          </Panel>
        )}

        {answered.length > 0 && (
          <View style={{ gap: space.sm }}>
            <T variant="eyebrow" style={{ marginLeft: 4 }}>
              Answered
            </T>
            {answered.map((q) => {
              const a = answers.get(q.key)!;
              return (
                <Panel key={q.key}>
                  <T variant="strong">{named(q.other, partner.name)}</T>
                  {a.partner_choice == null ? (
                    <T variant="small" muted>
                      You guessed &quot;{q.options[a.my_guess ?? 0]}&quot;. Waiting for {partner.name}.
                    </T>
                  ) : (
                    <View style={{ gap: 6 }}>
                      <Row gap={space.sm}>
                        <T variant="small" style={{ flex: 1 }}>
                          {partner.name}: {q.options[a.partner_choice]}. You guessed {q.options[a.my_guess ?? 0]}.
                        </T>
                        <Verdict right={a.my_guess === a.partner_choice} />
                      </Row>
                      <Row gap={space.sm}>
                        <T variant="small" muted style={{ flex: 1 }}>
                          You: {q.options[a.my_choice!]}. {partner.name} guessed {q.options[a.partner_guess ?? 0]}.
                        </T>
                        <Verdict right={a.partner_guess === a.my_choice} />
                      </Row>
                    </View>
                  )}
                </Panel>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
