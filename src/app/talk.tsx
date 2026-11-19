import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { BackHeader } from '@/components/game-ui';
import { Button, Glyph, Row, T } from '@/components/ui';
import { LEVELS, levelInfo, TALK, unlockedLevels, type Level } from '@/content/games';
import { hashRank, sharedHeat } from '@/lib/games';
import { useCouple } from '@/lib/session';
import { radius, space, useColors } from '@/lib/theme';

function shuffled(cards: string[], seed: string) {
  return cards
    .map((text, i) => ({ text, rank: hashRank(seed, String(i)) }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.text);
}

const TIPS: Record<Level, string> = {
  light: 'Take turns answering. There are no wrong answers.',
  deep: 'Listen without fixing. Ask one follow-up question before you answer yourself.',
  flirty: 'Keep it playful. Either of you can skip a card.',
  erotic: 'Go at your own pace. Either of you can skip a card or stop, no questions asked.',
};

export default function Talk() {
  const c = useColors();
  const ctx = useCouple();
  const params = useLocalSearchParams<{ level?: string }>();
  const level: Level = LEVELS.some((l) => l.level === params.level) ? (params.level as Level) : 'light';
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2));
  const [index, setIndex] = useState(0);

  if (!ctx) return null;
  const info = levelInfo(level);
  const open = unlockedLevels(sharedHeat(ctx.profile, ctx.partner)).includes(level);
  const cards = shuffled(TALK[level], seed);
  const card = cards[index % cards.length];
  const hot = level === 'flirty' || level === 'erotic';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <BackHeader title={`${info.emoji} ${info.label} talk deck`} />
      {!open ? (
        <View style={{ flex: 1, padding: space.xl, justifyContent: 'center', gap: space.md }}>
          <Glyph name="lock" color={c.muted} size={36} />
          <T variant="heading">This deck is still locked</T>
          <T muted>It appears once you and {ctx.partner.name} have both switched it on under Settings, After dark.</T>
          <Button title="Open Settings" onPress={() => router.push('/settings')} />
        </View>
      ) : (
        <View style={{ flex: 1, padding: space.lg, gap: space.lg }}>
          <T variant="small" muted style={{ textAlign: 'center' }}>
            {TIPS[level]}
          </T>
          <View
            accessibilityLiveRegion="polite"
            style={{
              flex: 1,
              borderRadius: radius.xl,
              backgroundColor: hot ? c.accent : c.surface,
              borderColor: c.line,
              borderWidth: hot ? 0 : 1,
              padding: space.xxl,
              justifyContent: 'center',
              gap: space.lg,
            }}>
            <T variant="eyebrow" color={hot ? c.onAccent : c.accent}>
              Card {index + 1} of {cards.length}
            </T>
            <T variant="title" color={hot ? c.onAccent : c.ink} style={{ fontSize: 30, lineHeight: 38 }}>
              {card}
            </T>
          </View>
          <Row gap={space.sm}>
            <Button style={{ flex: 1 }} title="Back" variant="outline" disabled={index === 0} onPress={() => setIndex((i) => Math.max(0, i - 1))} />
            {index < cards.length - 1 ? (
              <Button style={{ flex: 2 }} title="Next card" onPress={() => setIndex((i) => i + 1)} />
            ) : (
              <Button
                style={{ flex: 2 }}
                title="Shuffle and start again"
                onPress={() => {
                  setSeed(Math.random().toString(36).slice(2));
                  setIndex(0);
                }}
              />
            )}
          </Row>
        </View>
      )}
    </SafeAreaView>
  );
}
