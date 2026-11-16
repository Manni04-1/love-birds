import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { parseISODate, shortDate, timeLabel, toISODate, toTimeString } from '@/lib/dates';
import { radius, space, useColors } from '@/lib/theme';

/* Text ------------------------------------------------------------------- */

type Variant = 'display' | 'title' | 'heading' | 'body' | 'strong' | 'small' | 'fine' | 'eyebrow';

const textStyles = StyleSheet.create({
  display: { fontSize: 44, fontWeight: '800', letterSpacing: -1.5, lineHeight: 48 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, lineHeight: 32 },
  heading: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, lineHeight: 28 },
  body: { fontSize: 16, lineHeight: 23 },
  strong: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  small: { fontSize: 14, lineHeight: 20 },
  fine: { fontSize: 12.5, lineHeight: 17 },
  eyebrow: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
});

export function T({
  variant = 'body',
  muted,
  accent,
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; accent?: boolean; color?: string }) {
  const c = useColors();
  const tint = color ?? (accent || variant === 'eyebrow' ? c.accent : muted || variant === 'fine' ? c.muted : c.ink);
  return <Text style={[textStyles[variant], { color: tint }, style]} {...rest} />;
}

/* Layout ----------------------------------------------------------------- */

export function Card({
  children,
  onPress,
  style,
  tone = 'plain',
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: 'plain' | 'accent' | 'soft';
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const bg = tone === 'accent' ? c.accent : tone === 'soft' ? c.accentSoft : c.surface;
  const border = tone === 'plain' ? c.line : 'transparent';
  const base: ViewStyle = { backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: 6 };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, style, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>
      {children}
    </Pressable>
  );
}

export function Row({ children, style, gap = space.md }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/* Buttons ---------------------------------------------------------------- */

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  icon,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'dark';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
}) {
  const c = useColors();
  const look: Record<string, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.accent, fg: c.onAccent, border: c.accent },
    outline: { bg: c.surface, fg: c.ink, border: c.line },
    ghost: { bg: 'transparent', fg: c.accent, border: 'transparent' },
    danger: { bg: c.danger, fg: c.onDanger, border: c.danger },
    dark: { bg: c.ink, fg: c.page, border: c.ink },
  };
  const l = look[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: l.bg, borderColor: l.border, opacity: disabled ? 0.5 : 1 },
        pressed && !off && { transform: [{ scale: 0.98 }] },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={l.fg} />
      ) : (
        <Row gap={space.sm}>
          {icon}
          <Text style={[textStyles.strong, { color: l.fg }]}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}

export function IconButton({
  label,
  onPress,
  children,
  accent,
}: {
  label: string;
  onPress: PressableProps['onPress'];
  children: ReactNode;
  accent?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: accent ? c.accent : c.surface2, opacity: pressed ? 0.8 : 1 },
      ]}>
      {children}
    </Pressable>
  );
}

const GLYPHS = {
  back: { ios: 'chevron.left', android: 'arrow_back' },
  plus: { ios: 'plus', android: 'add' },
  settings: { ios: 'slider.horizontal.3', android: 'tune' },
  send: { ios: 'arrow.up', android: 'arrow_upward' },
  photo: { ios: 'photo', android: 'image' },
  heart: { ios: 'heart.fill', android: 'favorite' },
  heartOutline: { ios: 'heart', android: 'favorite_border' },
  lock: { ios: 'lock.fill', android: 'lock' },
  check: { ios: 'checkmark', android: 'check' },
  prev: { ios: 'chevron.left', android: 'chevron_left' },
  next: { ios: 'chevron.right', android: 'chevron_right' },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type GlyphName = keyof typeof GLYPHS;

/** A system icon: SF Symbols on iPhone, Material Symbols on Android. */
export function Glyph({ name, color, size = 20 }: { name: GlyphName; color: string; size?: number }) {
  const g = GLYPHS[name];
  return <SymbolView name={{ ios: g.ios, android: g.android, web: g.android }} tintColor={color} size={size} />;
}

/* Inputs ----------------------------------------------------------------- */

export function Field({ label, style, ...rest }: TextInputProps & { label: string }) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T variant="small" muted style={{ fontWeight: '700' }}>
        {label}
      </T>
      <TextInput
        placeholderTextColor={c.muted}
        accessibilityLabel={label}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          styles.input,
          { backgroundColor: c.surface, borderColor: focused ? c.accent : c.line, color: c.ink },
          rest.multiline && { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 },
          style as StyleProp<TextStyle>,
        ]}
      />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const c = useColors();
  if (!children) return null;
  return (
    <T variant="small" color={c.danger} style={{ fontWeight: '600' }} accessibilityRole="alert">
      {children}
    </T>
  );
}

/**
 * A date or time picker that shows the chosen value as a tappable field.
 * value is YYYY-MM-DD for dates and HH:MM:SS for times (null = not set).
 */
export function DateField({
  label,
  value,
  onChange,
  mode = 'date',
  maximumDate,
  placeholder = 'Choose',
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  mode?: 'date' | 'time';
  maximumDate?: Date;
  placeholder?: string;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const asDate = value
    ? mode === 'date'
      ? parseISODate(value)
      : (() => {
          const [h, m] = value.split(':').map(Number);
          const d = new Date();
          d.setHours(h, m, 0, 0);
          return d;
        })()
    : new Date();
  const shown = value ? (mode === 'date' ? shortDate(value) : timeLabel(value)) : placeholder;

  const handle = (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type !== 'set' || !picked) return;
    onChange(mode === 'date' ? toISODate(picked) : toTimeString(picked));
  };

  return (
    <View style={{ gap: 6, flex: 1 }}>
      <T variant="small" muted style={{ fontWeight: '700' }}>
        {label}
      </T>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        style={[styles.input, { backgroundColor: c.surface, borderColor: open ? c.accent : c.line, justifyContent: 'center' }]}>
        <T color={value ? c.ink : c.muted}>{shown}</T>
      </Pressable>
      {open && (
        <View style={Platform.OS === 'ios' ? { alignItems: 'flex-start' } : undefined}>
          <DateTimePicker
            value={asDate}
            mode={mode}
            display={Platform.OS === 'ios' ? (mode === 'date' ? 'inline' : 'spinner') : 'default'}
            maximumDate={maximumDate}
            accentColor={c.accent}
            onChange={handle}
          />
          {Platform.OS === 'ios' && <Button title="Done" variant="ghost" onPress={() => setOpen(false)} />}
        </View>
      )}
    </View>
  );
}

/* People ----------------------------------------------------------------- */

export function Avatar({ name, partner, size = 56 }: { name: string; partner?: boolean; size?: number }) {
  const c = useColors();
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: partner ? c.accent2 : c.accent,
        borderWidth: 3,
        borderColor: c.page,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: partner ? c.onAccent2 : c.onAccent, fontWeight: '800', fontSize: size * 0.4 }}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line, borderRadius: radius.md, padding: space.lg }}>
      <T variant="small" muted style={{ textAlign: 'center' }}>
        {children}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 50, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 },
});
