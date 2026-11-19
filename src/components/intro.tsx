import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { HEART_PATH, HeartShape } from '@/components/hero';
import { Bird, GOLD, WHITE } from '@/components/mark';
import { useSession } from '@/lib/session';
import { fontFor } from '@/lib/theme';

/** The splash screen's colour, from app.json, so the hand-over can't be seen. */
const PINK = '#D3325F';
/** The splash image is drawn 200 wide, with the birds placed on it just like this. */
const SIZE = 200;
const PLACE = 'translate(50 51) scale(0.96) translate(-50 -48)';
/** The little heart above the birds sits about 8% of the way down the image. */
const HEART_ORIGIN = '50% 8%';
/** The animation plays at least this long, even when the app is ready sooner. */
const AT_LEAST_MS = 1400;

const FLOATERS = [
  { x: -96, size: 16, delay: 150 },
  { x: 88, size: 20, delay: 300 },
  { x: -46, size: 12, delay: 520 },
  { x: 44, size: 14, delay: 650 },
  { x: -120, size: 10, delay: 800 },
  { x: 118, size: 12, delay: 900 },
  { x: 4, size: 18, delay: 420 },
];

function Floater({ t, x, size }: { t: Animated.Value; x: number; size: number }) {
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [40, -170] });
  const opacity = t.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.9, 0.6, 0] });
  const scale = t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1, 0.8] });
  return (
    <Animated.View style={{ position: 'absolute', opacity, transform: [{ translateX: x }, { translateY }, { scale }] }}>
      <HeartShape size={size} color="#FFFFFF" />
    </Animated.View>
  );
}

/**
 * Plays when the app opens: the birds from the splash screen beat like a heart, little hearts
 * float up and the name appears. It stays until the app has loaded, then fades into it.
 */
export function Intro() {
  const { ready } = useSession();
  const [beat] = useState(() => new Animated.Value(0));
  const [word] = useState(() => new Animated.Value(0));
  const [out] = useState(() => new Animated.Value(0));
  const [floaters] = useState(() => FLOATERS.map(() => new Animated.Value(0)));
  const [waited, setWaited] = useState(false);
  const [gone, setGone] = useState(false);
  const heartbeat = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (!active) return;
        timer = setTimeout(() => setWaited(true), reduced ? 300 : AT_LEAST_MS);
        if (reduced) {
          word.setValue(1);
          return;
        }
        // Lub-dub, rest, lub-dub.
        const pulse = (to: number, ms: number) => Animated.timing(beat, { toValue: to, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true });
        loop = Animated.loop(Animated.sequence([pulse(1, 110), pulse(0.15, 110), pulse(0.8, 110), pulse(0, 240), Animated.delay(260)]));
        heartbeat.current = loop;
        loop.start();
        Animated.timing(word, { toValue: 1, duration: 520, delay: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        Animated.parallel(
          floaters.map((v, i) =>
            Animated.timing(v, { toValue: 1, duration: 1500, delay: FLOATERS[i].delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          ),
        ).start();
      });
    return () => {
      active = false;
      loop?.stop();
      if (timer) clearTimeout(timer);
    };
  }, [beat, word, floaters]);

  // Once the app is ready and the birds have had their moment, fade into the app.
  const leaving = ready && waited;
  useEffect(() => {
    if (!leaving) return;
    Animated.timing(out, { toValue: 1, duration: 450, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      // This stays mounted (drawing nothing) while the app is open, so stop the heartbeat, or it would beat unseen and use battery.
      heartbeat.current?.stop();
      setGone(true);
    });
  }, [leaving, out]);

  if (gone) return null;

  const beatScale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const heartScale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const grow = out.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const fade = out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const wordY = word.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Animated.View
      // Hide the splash screen only once this, which looks just the same, is on screen.
      onLayout={() => {
        SplashScreen.hideAsync().catch(() => {});
      }}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessible
      accessibilityLabel="Love Birds is opening"
      style={[StyleSheet.absoluteFill, { backgroundColor: PINK, alignItems: 'center', justifyContent: 'center', opacity: fade }]}>
      {floaters.map((t, i) => (
        <Floater key={i} t={t} x={FLOATERS[i].x} size={FLOATERS[i].size} />
      ))}
      <Animated.View style={{ width: SIZE, height: SIZE, transform: [{ scale: grow }, { scale: beatScale }] }}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100">
          <G transform={PLACE}>
            <Bird c={WHITE} />
            <Bird c={GOLD} flip />
          </G>
        </Svg>
        <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: HEART_ORIGIN, transform: [{ scale: heartScale }] }]}>
          <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100">
            <G transform={PLACE}>
              <G transform="translate(45.5 -1.5) scale(0.38)">
                <Path d={HEART_PATH} fill="#FFFFFF" />
              </G>
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
      <View style={{ position: 'absolute', left: 0, right: 0, top: '50%', marginTop: SIZE / 2 + 6, alignItems: 'center' }}>
        <Animated.View style={{ alignItems: 'center', opacity: word, transform: [{ translateY: wordY }] }}>
          {/* Always the handwritten font: the name is a signature, the same for both of you. */}
          <Text style={[{ color: '#FFFFFF', fontSize: 36, fontWeight: '800', letterSpacing: -0.5 }, fontFor('800', true, 'handwritten')]} allowFontScaling={false}>
            Love Birds
          </Text>
          <Text style={[{ color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '600', marginTop: 2 }, fontFor('600', false, 'classic')]} allowFontScaling={false}>
            Just the two of you
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}
