import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Chip, Field, Glyph, Row, Sheet, T } from '@/components/ui';
import { EMOJI_GROUPS, GLYPH_GROUPS, groupOf, searchIcons, type PlanIcon } from '@/lib/plan-icons';
import { alpha, mix, radius, space, useColors } from '@/lib/theme';

/**
 * A plan's icon: its emoji, or its drawn icon. With `tint` it sits in a round badge of that colour,
 * and a drawn icon takes a deeper shade of it. Decorative: the plan's name says what it is.
 */
export function PlanIconView({ icon, size = 30, tint, color }: { icon: PlanIcon; size?: number; tint?: string; color?: string }) {
  const c = useColors();
  const ink = color ?? (tint ? mix(tint, c.ink, 0.35) : c.ink);
  const inner = tint ? size * 0.58 : size;
  const emoji = <T style={{ fontSize: inner * 0.86, lineHeight: inner * 1.18, textAlign: 'center' }}>{icon.emoji}</T>;
  const content = icon.glyph ? <SymbolView name={{ android: icon.glyph, web: icon.glyph }} tintColor={ink} size={inner} fallback={emoji} /> : emoji;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        tint && { borderRadius: size / 2, backgroundColor: alpha(tint, 0.18), borderWidth: 1, borderColor: alpha(tint, 0.5) },
      ]}>
      {content}
    </View>
  );
}

// The grid's gap, and the smallest a choice can be.
const GAP = 2;
const MIN_CELL = 46;

/** One choice in the picker, ringed when it's the plan's icon now. */
function Choice({ icon, label, selected, size, onPress }: { icon: PlanIcon; label: string; selected: boolean; size: number; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: selected ? c.accent : 'transparent',
        backgroundColor: selected ? alpha(c.accent, 0.12) : pressed ? c.surface2 : 'transparent',
      })}>
      <PlanIconView icon={icon} size={icon.glyph ? 26 : 30} color={icon.glyph ? mix(c.accent, c.ink, 0.35) : undefined} />
    </Pressable>
  );
}

const firstWord = (words: string) => words.split(' ')[0];

/**
 * Picks a plan's icon from emoji or drawn icons, by group or by search. "From the name" goes back to
 * the icon the plan's name suggests, which then follows the name as it changes.
 */
export function IconPicker({
  open,
  icon,
  fromName,
  followsName,
  onPick,
  onClose,
}: {
  open: boolean;
  icon: PlanIcon;
  /** The icon the name suggests now. */
  fromName: PlanIcon;
  followsName: boolean;
  /** Null goes back to following the name. */
  onPick: (icon: PlanIcon | null) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  // As many columns as fit, stretched to fill the row.
  const room = Math.min(width, 640) - space.lg * 2;
  const cols = Math.max(5, Math.floor((room + GAP) / (MIN_CELL + GAP)));
  const cell = Math.floor((room - (cols - 1) * GAP) / cols);
  const [kind, setKind] = useState<'emoji' | 'glyph'>(icon.glyph ? 'glyph' : 'emoji');
  const [group, setGroup] = useState(() => groupOf(icon));
  const [query, setQuery] = useState('');
  // Opening it again starts where the plan's icon is.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind(icon.glyph ? 'glyph' : 'emoji');
      setGroup(groupOf(icon));
      setQuery('');
    }
  }

  const pick = (next: PlanIcon | null) => {
    onPick(next);
    onClose();
  };
  const groups = kind === 'emoji' ? EMOJI_GROUPS : GLYPH_GROUPS;
  const shown = groups.find((grp) => grp.key === group) ?? groups[0];
  const found = query.trim() ? searchIcons(query) : null;

  const emojiChoice = (emoji: string, words: string) => (
    <Choice key={emoji} icon={{ emoji, glyph: null }} label={firstWord(words)} size={cell} selected={!followsName && !icon.glyph && icon.emoji === emoji} onPress={() => pick({ emoji, glyph: null })} />
  );
  const glyphChoice = (glyph: AndroidSymbol, emoji: string, words: string) => (
    <Choice key={glyph} icon={{ emoji, glyph }} label={firstWord(words)} size={cell} selected={!followsName && icon.glyph === glyph} onPress={() => pick({ emoji, glyph })} />
  );

  return (
    <Sheet open={open} onClose={onClose}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="heading">Pick an icon</T>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Glyph name="close" color={c.muted} size={22} />
        </Pressable>
      </Row>
      <Pressable
        onPress={() => pick(null)}
        accessibilityRole="button"
        accessibilityState={{ selected: followsName }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          padding: space.sm,
          paddingRight: space.md,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: followsName ? c.accent : c.line,
          backgroundColor: followsName ? alpha(c.accent, 0.1) : pressed ? c.surface2 : c.surface,
        })}>
        <PlanIconView icon={fromName} size={38} tint={c.accent} />
        <View style={{ flex: 1 }}>
          <T variant="small" style={{ fontWeight: '800' }}>
            From the name
          </T>
          <T variant="fine">It changes when you change the name.</T>
        </View>
        {followsName ? <Glyph name="check" color={c.accent} size={20} /> : null}
      </Pressable>
      <Field label="Search" value={query} onChangeText={setQuery} placeholder="e.g. dinner, beach or gym" autoCorrect={false} returnKeyType="search" />
      {!found && (
        <>
          <Row gap={space.sm}>
            <Chip label="Emoji" selected={kind === 'emoji'} onPress={() => setKind('emoji')} />
            <Chip label="Icons" selected={kind === 'glyph'} onPress={() => setKind('glyph')} />
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.sm }}>
            {groups.map((grp) => (
              <Chip key={grp.key} label={grp.label} selected={grp.key === shown.key} onPress={() => setGroup(grp.key)} />
            ))}
          </ScrollView>
        </>
      )}
      <ScrollView style={{ maxHeight: Math.max(180, height * 0.34) }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {found
            ? [...found.emoji.map((i) => emojiChoice(i.emoji, i.words)), ...found.glyphs.map((i) => glyphChoice(i.glyph, i.emoji, i.words))]
            : kind === 'emoji'
              ? EMOJI_GROUPS.find((grp) => grp.key === shown.key)?.items.map((i) => emojiChoice(i.emoji, i.words))
              : GLYPH_GROUPS.find((grp) => grp.key === shown.key)?.items.map((i) => glyphChoice(i.glyph, i.emoji, i.words))}
        </View>
        {found && !found.emoji.length && !found.glyphs.length ? (
          <T variant="small" muted style={{ paddingVertical: space.md }}>
            Nothing matches “{query.trim()}”. Try another word.
          </T>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

