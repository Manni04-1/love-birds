import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

import { Chip, Glyph, IconButton, Row, T } from '@/components/ui';
import { levelInfo, type Level } from '@/content/games';
import { radius, space, useColors } from '@/lib/theme';

export function BackHeader({ title }: { title: string }) {
  const c = useColors();
  return (
    <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
      <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/together', params: { tab: 'games' } }))}>
        <Glyph name="back" color={c.ink} />
      </IconButton>
      <T variant="strong" style={{ fontSize: 18, flex: 1 }} numberOfLines={1}>
        {title}
      </T>
    </Row>
  );
}

/** Chips to switch between the question levels you've both unlocked. badge: how many wait on you. */
export function LevelPicker({ levels, value, onChange, badges }: { levels: Level[]; value: Level; onChange: (l: Level) => void; badges?: Partial<Record<Level, number>> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
      {levels.map((l) => {
        const info = levelInfo(l);
        const n = badges?.[l] ?? 0;
        return <Chip key={l} label={`${info.emoji} ${info.label}${n ? ` · ${n}` : ''}`} selected={value === l} onPress={() => onChange(l)} />;
      })}
    </ScrollView>
  );
}

/** A big tappable answer. */
export function Option({
  label,
  selected,
  onPress,
  disabled,
  trailing,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => ({
        minHeight: 56,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: selected ? c.accent : c.line,
        backgroundColor: selected ? c.accentSoft : c.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      })}>
      <T variant="strong" style={{ flex: 1 }}>
        {label}
      </T>
      {trailing}
    </Pressable>
  );
}

/** A small rounded label, e.g. "You" or your partner's name next to an answer. */
export function Pill({ children, accent }: { children: ReactNode; accent?: boolean }) {
  const c = useColors();
  return (
    <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: accent ? c.accent : c.surface2 }}>
      <T variant="fine" color={accent ? c.onAccent : c.ink} style={{ fontWeight: '700' }}>
        {children}
      </T>
    </View>
  );
}

export function Panel({ children, tone = 'plain', style }: { children: ReactNode; tone?: 'plain' | 'soft'; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View
      style={[{
        backgroundColor: tone === 'soft' ? c.accentSoft : c.surface,
        borderColor: tone === 'soft' ? 'transparent' : c.line,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: space.lg,
        gap: space.md,
      }, style]}>
      {children}
    </View>
  );
}
