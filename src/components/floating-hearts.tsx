import { useEffect, useState } from 'react';
import { Animated, Easing, useWindowDimensions, View } from 'react-native';

import { HeartShape, useReducedMotion } from '@/components/hero';
import { useColors } from '@/lib/theme';

const COUNT = 16;

type Floater = { x: number; size: number; delay: number; duration: number; sway: number; tint: 0 | 1 | 2 };

function makeFloaters(): Floater[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    x: 0.06 + ((i * 0.618) % 1) * 0.88,
    size: 18 + ((i * 7) % 4) * 7,
    delay: (i % 8) * 110,
    duration: 1900 + ((i * 13) % 5) * 220,
    sway: (i % 2 ? 1 : -1) * (12 + (i % 3) * 8),
    tint: (i % 3) as 0 | 1 | 2,
  }));
}

function Floating({ f, t, height, width, colors }: { f: Floater; t: Animated.Value; height: number; width: number; colors: string[] }) {
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 0.85] });
  const translateX = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, f.sway, 0, -f.sway, 0] });
  const opacity = t.interpolate({ inputRange: [0, 0.08, 0.7, 1], outputRange: [0, 1, 0.9, 0] });
  const scale = t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.4, 1.1, 0.85] });
  return (
    <Animated.View style={{ position: 'absolute', left: f.x * width - f.size / 2, bottom: 40, opacity, transform: [{ translateY }, { translateX }, { scale }] }}>
      <HeartShape size={f.size} color={colors[f.tint]} />
    </Animated.View>
  );
}

/** Hearts that drift up the whole screen each time `burst` goes up. */
export function FloatingHearts({ burst }: { burst: number }) {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [floaters] = useState(makeFloaters);
  const [values] = useState(() => floaters.map(() => new Animated.Value(0)));
  // The last burst that finished floating. Hearts show while a newer one is on its way up.
  const [landed, setLanded] = useState(burst);
  const active = !reduced && burst !== landed;

  useEffect(() => {
    if (!burst || reduced) return;
    values.forEach((v) => v.setValue(0));
    const anim = Animated.parallel(
      values.map((v, i) => Animated.timing(v, { toValue: 1, duration: floaters[i].duration, delay: floaters[i].delay, easing: Easing.out(Easing.quad), useNativeDriver: true })),
    );
    anim.start(({ finished }) => finished && setLanded(burst));
    return () => anim.stop();
  }, [burst, reduced, values, floaters]);

  if (!active) return null;
  const colors = [c.accent, c.accent2, '#FF6FA5'];
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {floaters.map((f, i) => (
        <Floating key={i} f={f} t={values[i]} height={height} width={width} colors={colors} />
      ))}
    </View>
  );
}
