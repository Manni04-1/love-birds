import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateIdeasPanel } from '@/components/date-ideas';
import { GamesPanel } from '@/components/games-panel';
import { Row, T } from '@/components/ui';
import { UsPanel } from '@/components/us-panel';
import { useCouple } from '@/lib/session';
import { radius, space, tabBarInset, useColors } from '@/lib/theme';

type Tab = 'us' | 'ideas' | 'games';

const TABS: { key: Tab; label: string }[] = [
  { key: 'us', label: 'Us' },
  { key: 'ideas', label: 'Dates' },
  { key: 'games', label: 'Games' },
];

const isTab = (v: unknown): v is Tab => TABS.some((t) => t.key === v);

export default function Together() {
  const c = useColors();
  const ctx = useCouple();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(isTab(params.tab) ? params.tab : 'us');
  // Opening Together from a link or notification shows the part it points to.
  const [linked, setLinked] = useState(params.tab);
  if (params.tab !== linked) {
    setLinked(params.tab);
    if (isTab(params.tab)) setTab(params.tab);
  }
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
      {tab === 'us' ? (
        <UsPanel />
      ) : tab === 'ideas' ? (
        <View style={{ flex: 1, paddingBottom: tabBarInset + space.md }}>
          <DateIdeasPanel />
        </View>
      ) : (
        <GamesPanel />
      )}
    </SafeAreaView>
  );
}
