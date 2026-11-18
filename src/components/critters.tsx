import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { HeartShape, usePulse, useReducedMotion } from '@/components/hero';
import { T } from '@/components/ui';
import { animalEmoji } from '@/content/animals';

const RISERS = [
  { x: -12, size: 12, delay: 0 },
  { x: 8, size: 16, delay: 0.12 },
  { x: -2, size: 11, delay: 0.24 },
];

/** A little heart that floats up from your partner's animal when they nudge you. */
function Riser({ t, x, size, delay, color }: { t: Animated.Value; x: number; size: number; delay: number; color: string }) {
  const start = delay;
  const translateY = t.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, -62], extrapolate: 'clamp' });
  const opacity = t.interpolate({ inputRange: [0, start, start + 0.08, 0.85, 1], outputRange: [0, 0, 1, 0.8, 0], extrapolate: 'clamp' });
  return (
    <Animated.View style={{ position: 'absolute', bottom: 34, left: 18 + x, opacity, transform: [{ translateY }] }}>
      <HeartShape size={size} color={color} />
    </Animated.View>
  );
}

/**
 * Your two animals along the bottom of the hero. They bob about on their own, snuggle up with a
 * heart between them once you've both done something today, and your partner's hops when they nudge you.
 */
export function Critters({ mine, theirs, close, ping, heart }: { mine: string | null | undefined; theirs: string | null | undefined; close: boolean; ping: number; heart: string }) {
  const reduced = useReducedMotion();
  const bobA = usePulse(2600, 0, reduced);
  const bobB = usePulse(2600, 900, reduced);
  const beat = usePulse(1000, 0, reduced || !close);
  const [near] = useState(() => new Animated.Value(close ? 1 : 0));
  const [hop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const to = close ? 1 : 0;
    const anim = reduced
      ? Animated.timing(near, { toValue: to, duration: 0, useNativeDriver: true })
      : Animated.spring(near, { toValue: to, friction: 7, tension: 30, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [close, near, reduced]);

  useEffect(() => {
    if (!ping || reduced) return;
    hop.setValue(0);
    const anim = Animated.timing(hop, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [ping, hop, reduced]);

  const a = animalEmoji(mine) ?? '🦜';
  const b = animalEmoji(theirs) ?? '🦜';
  const leftX = near.interpolate({ inputRange: [0, 1], outputRange: [-74, -28] });
  const rightX = near.interpolate({ inputRange: [0, 1], outputRange: [74, 28] });
  const tiltA = near.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '10deg'] });
  const tiltB = near.interpolate({ inputRange: [0, 1], outputRange: ['4deg', '-10deg'] });
  const yA = bobA.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const yB = Animated.add(
    bobB.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }),
    hop.interpolate({ inputRange: [0, 0.1, 0.2, 0.3, 0.4, 1], outputRange: [0, -18, 0, -9, 0, 0] }),
  );
  const heartScale = beat.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.2] });
  const animal = { fontSize: 34, lineHeight: 42 };

  return (
    <View pointerEvents="none" style={{ height: 46, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={{ position: 'absolute', bottom: 0, transform: [{ translateX: leftX }] }}>
        <Animated.View style={{ transform: [{ translateY: yA }, { rotate: tiltA }] }}>
          <T style={animal}>{a}</T>
        </Animated.View>
      </Animated.View>
      <Animated.View style={{ position: 'absolute', bottom: 22, opacity: near, transform: [{ scale: heartScale }] }}>
        <HeartShape size={18} color={heart} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', bottom: 0, transform: [{ translateX: rightX }] }}>
        {!!ping && !reduced && RISERS.map((r, i) => <Riser key={i} t={hop} x={r.x} size={r.size} delay={r.delay} color={heart} />)}
        <Animated.View style={{ transform: [{ translateY: yB }, { rotate: tiltB }] }}>
          <T style={animal}>{b}</T>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
