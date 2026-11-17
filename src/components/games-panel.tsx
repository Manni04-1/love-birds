import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { Button, Card, Glyph, Row, T } from '@/components/ui';
import { LEVELS, QUIZ, unlockedLevels, WYR } from '@/content/games';
import { quizStats, sharedHeat, useGameAnswers, wyrStats } from '@/lib/games';
import { useCouple } from '@/lib/session';
import { radius, space, tabBarInset, useColors } from '@/lib/theme';

function GameCard({ emoji, title, body, stat, onPress }: { emoji: string; title: string; body: string; stat: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Card onPress={onPress} accessibilityLabel={`${title}. ${stat}`}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ fontSize: 28, lineHeight: 34 }}>{emoji}</T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="strong" style={{ fontSize: 18 }}>
            {title}
          </T>
          <T variant="small" muted>
            {body}
          </T>
          <T variant="small" accent style={{ fontWeight: '700', marginTop: 4 }}>
            {stat}
          </T>
        </View>
        <Glyph name="next" color={c.muted} />
      </Row>
    </Card>
  );
}

export function GamesPanel() {
  const c = useColors();
  const ctx = useCouple();
  const wyr = useGameAnswers('wyr');
  const quiz = useGameAnswers('quiz');
  if (!ctx) return null;
  const { profile, partner } = ctx;

  const heat = sharedHeat(profile, partner);
  const levels = new Set(unlockedLevels(heat));
  const w = wyrStats(wyr.answers, new Set(WYR.filter((q) => levels.has(q.level)).map((q) => q.key)));
  const q = quizStats(quiz.answers, new Set(QUIZ.filter((x) => levels.has(x.level)).map((x) => x.key)));

  const wyrStat = w.waiting
    ? `${partner.name} answered ${w.waiting} you haven't yet`
    : w.both
      ? `You agree on ${w.agree} of ${w.both}`
      : 'Start with a few light ones';
  const quizStat = q.waiting
    ? `${partner.name} answered ${q.waiting} you haven't yet`
    : q.both
      ? `You know ${partner.name} ${q.youKnow}/${q.both} · ${partner.name} knows you ${q.theyKnow}/${q.both}`
      : 'Score a point for every right guess';

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: tabBarInset + space.xl, gap: space.md }}>
      <GameCard
        emoji="🤔"
        title="Would you rather"
        body={`Pick one of two. See what ${partner.name} picked once you've both answered.`}
        stat={wyrStat}
        onPress={() => router.push('/wyr')}
      />
      <GameCard
        emoji="🎯"
        title="How well do you know me"
        body={`Answer about yourself, then guess what ${partner.name} said.`}
        stat={quizStat}
        onPress={() => router.push('/quiz')}
      />

      <View style={{ gap: 2, marginTop: space.md }}>
        <T variant="eyebrow">Talk decks</T>
        <T variant="small" muted>
          Pull a card and talk it through together. Take turns, and skip any card you like.
        </T>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        {LEVELS.map((l) => {
          const open = levels.has(l.level);
          return (
            <Card
              key={l.level}
              style={{ flexBasis: '46%', flexGrow: 1, opacity: open ? 1 : 0.6 }}
              tone={open ? 'plain' : 'soft'}
              onPress={() => (open ? router.push({ pathname: '/talk', params: { level: l.level } }) : router.push('/settings'))}
              accessibilityLabel={open ? `${l.label} talk deck` : `${l.label} talk deck, locked. Opens Settings.`}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T style={{ fontSize: 30, lineHeight: 36 }}>{l.emoji}</T>
                {!open && <Glyph name="lock" color={c.muted} size={16} />}
              </Row>
              <T variant="strong">{l.label}</T>
              <T variant="fine">{open ? l.blurb : 'Switch on in Settings'}</T>
            </Card>
          );
        })}
      </View>
      {heat < 2 && (
        <Card tone="soft" style={{ gap: space.sm }}>
          <T variant="small">
            Flirty and Erotic questions appear in all three games once you&apos;ve both switched them on under Settings, After dark. The app only shows
            what&apos;s on for you both.
          </T>
          <Button title="Open Settings" variant="outline" onPress={() => router.push('/settings')} />
        </Card>
      )}
    </ScrollView>
  );
}
