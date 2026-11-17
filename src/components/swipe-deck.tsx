import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, useWindowDimensions, View } from 'react-native';

import { Glyph, Row, T } from '@/components/ui';
import { radius, space, useColors } from '@/lib/theme';

const THRESHOLD = 110;

/**
 * A stack of cards you swipe right to like and left to pass, with buttons for
 * the same. Built on React Native's own Animated and PanResponder, so it needs
 * no extra native code.
 */
export function SwipeDeck<Item extends { id: string }>({
  items,
  renderCard,
  onSwipe,
  footer,
}: {
  items: Item[];
  renderCard: (item: Item) => ReactNode;
  onSwipe: (item: Item, liked: boolean) => void;
  footer?: ReactNode;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const [pan] = useState(() => new Animated.ValueXY());
  const top = items[0];
  const next = items[1];

  // Handlers read the latest values through a ref, so the gesture handler can be made once.
  const latest = useRef({ top, onSwipe, width, busy: false });
  useEffect(() => {
    latest.current.top = top;
    latest.current.onSwipe = onSwipe;
    latest.current.width = width;
  });

  // A new top card always starts in the middle.
  useLayoutEffect(() => {
    pan.setValue({ x: 0, y: 0 });
    latest.current.busy = false;
  }, [pan, top?.id]);

  const fling = useCallback(
    (liked: boolean, dy = 0) => {
      const l = latest.current;
      if (!l.top || l.busy) return;
      l.busy = true;
      const item = l.top;
      Animated.timing(pan, {
        toValue: { x: (liked ? 1 : -1) * l.width * 1.4, y: dy },
        duration: 230,
        useNativeDriver: false,
      }).start(() => l.onSwipe(item, liked));
    },
    [pan],
  );

  // The gesture handlers read `latest` only while a finger is moving, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => pan.setValue({ x: g.dx, y: g.dy }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > THRESHOLD || g.vx > 0.9) return fling(true, g.dy);
        if (g.dx < -THRESHOLD || g.vx < -0.9) return fling(false, g.dy);
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start();
      },
    }),
  );

  const rotate = pan.x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-12deg', '0deg', '12deg'] });
  const likeOpacity = pan.x.interpolate({ inputRange: [20, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = pan.x.interpolate({ inputRange: [-THRESHOLD, -20], outputRange: [1, 0], extrapolate: 'clamp' });
  const nextScale = pan.x.interpolate({ inputRange: [-THRESHOLD, 0, THRESHOLD], outputRange: [1, 0.94, 1], extrapolate: 'clamp' });

  const cardStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.xl,
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    overflow: 'hidden' as const,
    shadowColor: '#3B1425',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  };

  return (
    <View style={{ flex: 1, gap: space.lg }}>
      <View style={{ flex: 1 }}>
        {next && (
          <Animated.View key={next.id} pointerEvents="none" style={[cardStyle, { transform: [{ scale: nextScale }] }]}>
            {renderCard(next)}
          </Animated.View>
        )}
        {top && (
          <Animated.View
            key={top.id}
            {...responder.panHandlers}
            accessibilityHint="Swipe right if you like it, left to pass"
            style={[cardStyle, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}>
            {renderCard(top)}
            <Stamp label="Yes please" color={c.accent} opacity={likeOpacity} side="left" />
            <Stamp label="Not for us" color={c.muted} opacity={passOpacity} side="right" />
          </Animated.View>
        )}
      </View>
      <Row style={{ justifyContent: 'center' }} gap={space.xl}>
        <RoundButton label="Pass" onPress={() => fling(false)} disabled={!top}>
          <Glyph name="close" color={c.muted} size={30} />
        </RoundButton>
        {footer}
        <RoundButton label="Like" onPress={() => fling(true)} disabled={!top} accent>
          <Glyph name="heart" color={c.onAccent} size={30} />
        </RoundButton>
      </Row>
    </View>
  );
}

function Stamp({ label, color, opacity, side }: { label: string; color: string; opacity: Animated.AnimatedInterpolation<number>; side: 'left' | 'right' }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 28,
        [side]: 22,
        opacity,
        transform: [{ rotate: side === 'left' ? '-14deg' : '14deg' }],
        borderWidth: 3,
        borderColor: color,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}>
      <T variant="strong" color={color} style={{ fontSize: 20, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {label}
      </T>
    </Animated.View>
  );
}

export function RoundButton({
  label,
  onPress,
  children,
  accent,
  disabled,
  size = 68,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  accent?: boolean;
  disabled?: boolean;
  size?: number;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: accent ? c.accent : c.surface,
        borderWidth: accent ? 0 : 1.5,
        borderColor: c.line,
        opacity: disabled ? 0.4 : 1,
        transform: [{ scale: pressed && !disabled ? 0.93 : 1 }],
        shadowColor: '#3B1425',
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      })}>
      {children}
    </Pressable>
  );
}
