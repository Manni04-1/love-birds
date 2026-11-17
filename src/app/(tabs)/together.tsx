import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateIdeasPanel } from '@/components/date-ideas';
import { GamesPanel } from '@/components/games-panel';
import { Row, T } from '@/components/ui';
import { useCouple } from '@/lib/session';
import { radius, space, tabBarInset, useColors } from '@/lib/theme';

type Tab = 'ideas' | 'games';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ideas', label: 'Date ideas' },
  { key: 'games', label: 'Games' },
];

export default function Together() {
  const c = useColors();
  const ctx = useCouple();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'games' ? 'games' : 'ideas');
  const refresh = ctx?.refresh;

  // Picks up your partner's latest settings, such as which question decks they've switched on.
  useFocusEffect(
    useCallback(() => {
      refresh?.();
    }, [refresh]),
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.page }}>
      <Row style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, justifyContent: 'space-between' }}>
        <T variant="title">Together</T>
        <Row gap={0} style={{ backgroundColor: c.surface2, borderRadius: radius.pill, padding: 3 }}>
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: on ? c.surface : 'transparent' }}>
                <T variant="small" style={{ fontWeight: '700' }} color={on ? c.accent : c.muted}>
                  {t.label}
                </T>
              </Pressable>
            );
          })}
        </Row>
      </Row>
      {tab === 'ideas' ? (
        <View style={{ flex: 1, paddingBottom: tabBarInset + space.md }}>
          <DateIdeasPanel />
        </View>
      ) : (
        <GamesPanel />
      )}
    </SafeAreaView>
  );
}
