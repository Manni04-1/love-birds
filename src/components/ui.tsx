import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Fragment, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseISODate, shortDate, timeLabel, toISODate, toTimeString } from '@/lib/dates';
import { animalEmoji } from '@/content/animals';
import { useSession } from '@/lib/session';
import { fontFor, radius, space, useColors, useFontName } from '@/lib/theme';

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

// Emoji, and the joiners and skin tones that hold them together.
const EMOJI_RUN =
  /((?:[0-9#*]\uFE0F?\u20E3|[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299\uFE0F\u200D]|[\uD83C-\uD83E][\uDC00-\uDFFF]|\uDB40[\uDC20-\uDC7F])+)/;

/**
 * Android draws some emoji wrongly (only their outlines, in odd colours) when they
 * fall back from a custom font. So emoji always use the phone's own font.
 */
const EMOJI_FONT = { fontFamily: Platform.select({ android: 'sans-serif', ios: 'System', default: undefined }) };

function withPhoneEmoji(children: ReactNode): ReactNode {
  if (typeof children === 'string') {
    if (!EMOJI_RUN.test(children)) return children;
    return children.split(EMOJI_RUN).map((part, i) =>
      i % 2 === 1 ? (
        <Text key={i} style={EMOJI_FONT}>
          {part}
        </Text>
      ) : (
        part
      ),
    );
  }
  if (Array.isArray(children)) return children.map((child, i) => (typeof child === 'string' ? <Fragment key={i}>{withPhoneEmoji(child)}</Fragment> : child));
  return children;
}

export function T({
  variant = 'body',
  muted,
  accent,
  color,
  style,
  children,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; accent?: boolean; color?: string }) {
  const c = useColors();
  const fontName = useFontName();
  const tint = color ?? (accent || variant === 'eyebrow' ? c.accent : muted || variant === 'fine' ? c.muted : c.ink);
  const weight = (StyleSheet.flatten([textStyles[variant], style]) as TextStyle | undefined)?.fontWeight;
  const font = fontFor(weight, DISPLAY.has(variant), fontName);
  return (
    <Text style={[textStyles[variant], { color: tint }, style, font]} {...rest}>
      {font.fontFamily ? withPhoneEmoji(children) : children}
    </Text>
  );
}

const DISPLAY = new Set<Variant>(['display', 'title', 'heading']);

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
          <T variant="strong" color={l.fg}>
            {title}
          </T>
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
  close: { ios: 'xmark', android: 'close' },
  shuffle: { ios: 'shuffle', android: 'shuffle' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome' },
  backspace: { ios: 'delete.left', android: 'backspace' },
  fingerprint: { ios: 'touchid', android: 'fingerprint' },
  camera: { ios: 'camera', android: 'photo_camera' },
  play: { ios: 'play.fill', android: 'play_arrow' },
  mail: { ios: 'envelope', android: 'mail' },
  clock: { ios: 'clock', android: 'schedule' },
  reply: { ios: 'arrowshape.turn.up.left', android: 'reply' },
  edit: { ios: 'pencil', android: 'edit' },
  trash: { ios: 'trash', android: 'delete' },
  copy: { ios: 'doc.on.doc', android: 'content_copy' },
  mic: { ios: 'mic.fill', android: 'mic' },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type GlyphName = keyof typeof GLYPHS;

/** A system icon: SF Symbols on iPhone, Material Symbols on Android. */
export function Glyph({ name, color, size = 20 }: { name: GlyphName; color: string; size?: number }) {
  const g = GLYPHS[name];
  return <SymbolView name={{ ios: g.ios, android: g.android, web: g.android }} tintColor={color} size={size} />;
}

/** A small pill to pick a filter or an option. */
export function Chip({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        minHeight: 36,
        justifyContent: 'center',
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: selected ? c.accent : c.line,
        backgroundColor: selected ? c.accent : c.surface,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}>
      <T variant="small" color={selected ? c.onAccent : c.ink} style={{ fontWeight: '700' }}>
        {label}
      </T>
    </Pressable>
  );
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
          // The phone's own font, so emoji you type look right.
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
  minimumDate,
  placeholder = 'Choose',
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  mode?: 'date' | 'time';
  maximumDate?: Date;
  minimumDate?: Date;
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
            minimumDate={minimumDate}
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

/** Your circle, or your partner's: the animal you picked, or else your initial. */
export function Avatar({ name, partner, size = 56, animal }: { name: string; partner?: boolean; size?: number; animal?: string | null }) {
  const c = useColors();
  const fontName = useFontName();
  const session = useSession();
  const emoji = animalEmoji(animal !== undefined ? animal : partner ? session.partner?.animal : session.profile?.animal);
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
      {emoji ? (
        <Text style={[EMOJI_FONT, { fontSize: size * 0.52, lineHeight: size * 0.66, textAlign: 'center' }]} allowFontScaling={false}>
          {emoji}
        </Text>
      ) : (
        <Text style={[{ color: partner ? c.onAccent2 : c.onAccent, fontWeight: '800', fontSize: size * 0.4 }, fontFor(800, true, fontName)]}>
          {(name.trim()[0] ?? '?').toUpperCase()}
        </Text>
      )}
    </View>
  );
}

/** A panel that slides up from the bottom. Tap outside it to close. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: c.page, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, paddingBottom: space.lg + insets.bottom, gap: space.md }}>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
