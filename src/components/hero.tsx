import { useEffect, useId, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, useColorScheme, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { radius, useThemeName, type ThemeName } from '@/lib/theme';

const W = 360;

/** True when the phone asks apps to keep motion to a minimum. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/** A value that runs from 0 to 1 again and again. */
function useLoop(duration: number, delay = 0, reduced = false) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const anim = Animated.loop(
      Animated.sequence([Animated.delay(delay), Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay, reduced]);
  return v;
}

/** A value that drifts 0 → 1 → 0 smoothly, for swaying and twinkling. */
export function usePulse(duration: number, delay = 0, reduced = false) {
  const [v] = useState(() => new Animated.Value(reduced ? 0.6 : 0));
  useEffect(() => {
    if (reduced) return;
    const ease = Easing.inOut(Easing.sin);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: duration / 2, easing: ease, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: duration / 2, easing: ease, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay, reduced]);
  return v;
}

export const HEART_PATH = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

export function HeartShape({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={HEART_PATH} fill={color} />
    </Svg>
  );
}

function abs(left: string | number, top: string | number, extra?: ViewStyle): ViewStyle {
  return { position: 'absolute', left: left as ViewStyle['left'], top: top as ViewStyle['top'], ...extra };
}

/* Rose: hearts drifting up ----------------------------------------------- */

function RisingHeart({ x, size, delay, duration, color, height, reduced }: { x: string; size: number; delay: number; duration: number; color: string; height: number; reduced: boolean }) {
  const t = useLoop(duration, delay, reduced);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [height + 10, -size - 10] });
  const opacity = t.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.9, 0.7, 0] });
  const translateX = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 8, 0, -8, 0] });
  return (
    <Animated.View style={[abs(x, 0), { opacity: reduced ? 0.5 : opacity, transform: [{ translateY: reduced ? height * 0.4 : translateY }, { translateX }] }]}>
      <HeartShape size={size} color={color} />
    </Animated.View>
  );
}

function RoseScene({ dark, height, reduced }: SceneProps) {
  const heart = dark ? '#FF7FA6' : '#FFFFFF';
  return (
    <>
      <Backdrop id="rose" stops={dark ? ['#6E1C3F', '#2A0A16'] : ['#FF8FB1', '#D3325F']} height={height}>
        <Path d={`M${W - 70} 30 ${'c-18 -22 -52 -8 -42 18 c8 20 42 38 42 38 c0 0 34 -18 42 -38 c10 -26 -24 -40 -42 -18z'}`} fill="none" stroke={heart} strokeOpacity={0.18} strokeWidth={3} />
        <Circle cx={40} cy={height - 20} r={70} fill={heart} opacity={0.07} />
        <Circle cx={W - 30} cy={height + 10} r={90} fill={heart} opacity={0.06} />
      </Backdrop>
      {[
        ['8%', 16, 0, 7000],
        ['22%', 10, 2500, 8000],
        ['40%', 20, 1200, 9000],
        ['63%', 12, 4000, 7500],
        ['78%', 18, 600, 8500],
        ['90%', 11, 3200, 6500],
      ].map(([x, size, delay, duration], i) => (
        <RisingHeart key={i} x={x as string} size={size as number} delay={delay as number} duration={duration as number} color={heart} height={height} reduced={reduced} />
      ))}
    </>
  );
}

/* Steampunk: turning gears ------------------------------------------------ */

function gearPath(teeth: number, outer: number, inner: number, hole: number) {
  const c = outer;
  const step = (Math.PI * 2) / teeth;
  const pt = (r: number, a: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    d += `${i ? 'L' : 'M'}${pt(inner, a)} L${pt(outer, a + step * 0.12)} L${pt(outer, a + step * 0.38)} L${pt(inner, a + step * 0.5)} `;
  }
  d += 'Z ';
  d += `M${c + hole} ${c} A${hole} ${hole} 0 1 0 ${c - hole} ${c} A${hole} ${hole} 0 1 0 ${c + hole} ${c} Z`;
  return d;
}

function Gear({ x, y, size, teeth, color, duration, reverse, reduced }: { x: string; y: number; size: number; teeth: number; color: string; duration: number; reverse?: boolean; reduced: boolean }) {
  const t = useLoop(duration, 0, reduced);
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: reverse ? ['360deg', '0deg'] : ['0deg', '360deg'] });
  const r = size / 2;
  return (
    <Animated.View style={[abs(x, y), { width: size, height: size, transform: [{ rotate }] }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Path d={gearPath(teeth, r, r * 0.82, r * 0.28)} fill={color} fillRule="evenodd" />
        <Circle cx={r} cy={r} r={r * 0.55} fill="none" stroke="#000" strokeOpacity={0.18} strokeWidth={2} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Circle key={i} cx={r + r * 0.68 * Math.cos((i * Math.PI) / 3)} cy={r + r * 0.68 * Math.sin((i * Math.PI) / 3)} r={r * 0.05} fill="#000" opacity={0.25} />
        ))}
      </Svg>
    </Animated.View>
  );
}

function Steam({ x, delay, height, reduced }: { x: string; delay: number; height: number; reduced: boolean }) {
  const t = useLoop(5200, delay, reduced);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [height * 0.55, -10] });
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] });
  const opacity = t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.35, 0] });
  if (reduced) return null;
  return (
    <Animated.View style={[abs(x, 0), { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF3DC', opacity, transform: [{ translateY }, { scale }] }]} />
  );
}

function SteampunkScene({ dark, height, reduced }: SceneProps) {
  return (
    <>
      <Backdrop id="steam" stops={dark ? ['#3B2614', '#140C06'] : ['#8A5A2B', '#3D2614']} height={height}>
        {Array.from({ length: 10 }, (_, i) => (
          <Circle key={i} cx={18 + i * 36} cy={10} r={2.4} fill="#E3BC4E" opacity={0.55} />
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <Circle key={`b${i}`} cx={18 + i * 36} cy={height - 10} r={2.4} fill="#E3BC4E" opacity={0.55} />
        ))}
        <Rect x={0} y={height * 0.62} width={W} height={3} fill="#C9A227" opacity={0.35} />
      </Backdrop>
      <Gear x="62%" y={-24} size={130} teeth={14} color="#C9A227" duration={14000} reduced={reduced} />
      <Gear x="84%" y={86} size={78} teeth={10} color="#B87333" duration={8400} reverse reduced={reduced} />
      <Gear x="-6%" y={height - 70} size={104} teeth={12} color="#8C6A3F" duration={12000} reverse reduced={reduced} />
      <Steam x="20%" delay={0} height={height} reduced={reduced} />
      <Steam x="30%" delay={1800} height={height} reduced={reduced} />
      <Steam x="12%" delay={3400} height={height} reduced={reduced} />
    </>
  );
}

/* Meadow: hills, flowers and a butterfly (fireflies at night) -------------- */

function Flower({ cx, cy, color, r = 5 }: { cx: number; cy: number; color: string; r?: number }) {
  return (
    <G>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i * 2 * Math.PI) / 5;
        return <Circle key={i} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={r * 0.75} fill={color} />;
      })}
      <Circle cx={cx} cy={cy} r={r * 0.55} fill="#F5B83D" />
    </G>
  );
}

function Floater({ x, y, children, duration, delay, reduced, drift = 30 }: { x: string; y: number; children: ReactNode; duration: number; delay: number; reduced: boolean; drift?: number }) {
  const t = usePulse(duration, delay, reduced);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [-drift, drift] });
  const translateY = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -drift / 2, 0] });
  return <Animated.View style={[abs(x, y), { transform: [{ translateX }, { translateY }] }]}>{children}</Animated.View>;
}

function Twinkle({ x, y, size, color, delay, duration, reduced }: { x: string; y: number; size: number; color: string; delay: number; duration: number; reduced: boolean }) {
  const t = usePulse(duration, delay, reduced);
  const opacity = t.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] });
  return <Animated.View style={[abs(x, y), { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity }]} />;
}

function MeadowScene({ dark, height, reduced }: SceneProps) {
  const h = height;
  const flowers = dark ? ['#D9D3FF', '#FFE3F0', '#FFFFFF'] : ['#FFFFFF', '#FF8FB8', '#B79CFF', '#FFD34D'];
  return (
    <>
      <Backdrop id="meadow" stops={dark ? ['#0E2238', '#1C3D33'] : ['#9ED9FF', '#E6F7FF']} height={h}>
        {dark ? <Path d="M300 34 A20 20 0 1 0 300 74 A15 20 0 1 1 300 34 Z" fill="#FFF4C2" /> : <Circle cx={300} cy={52} r={26} fill="#FFD86B" />}
        <Path d={`M0 ${h * 0.62} Q90 ${h * 0.45} 190 ${h * 0.6} T${W} ${h * 0.55} L${W} ${h} L0 ${h} Z`} fill={dark ? '#24503A' : '#9AD47A'} />
        <Path d={`M0 ${h * 0.78} Q120 ${h * 0.62} 240 ${h * 0.76} T${W} ${h * 0.72} L${W} ${h} L0 ${h} Z`} fill={dark ? '#183A2A' : '#62B04E'} />
        {[
          [22, 0.86], [58, 0.93], [92, 0.84], [40, 0.74], [76, 0.99], [272, 0.9], [300, 0.82], [334, 0.92], [318, 0.72], [290, 0.98],
        ].map(([x, y], i) => (
          <Flower key={i} cx={x} cy={h * y} color={flowers[i % flowers.length]} r={i % 3 === 0 ? 6 : 4.5} />
        ))}
      </Backdrop>
      {dark ? (
        [
          ['15%', 0.55, 0], ['32%', 0.7, 900], ['48%', 0.5, 400], ['66%', 0.66, 1500], ['82%', 0.58, 700], ['24%', 0.42, 2000], ['74%', 0.4, 1100],
        ].map(([x, y, d], i) => <Twinkle key={i} x={x as string} y={h * (y as number)} size={5} color="#F7F08B" delay={d as number} duration={2600} reduced={reduced} />)
      ) : (
        <Floater x="30%" y={h * 0.25} duration={7000} delay={0} reduced={reduced} drift={40}>
          <Svg width={26} height={20} viewBox="0 0 26 20">
            <Path d="M13 10 C8 0 0 2 2 9 C3 13 9 13 13 10 Z" fill="#FF8FB8" />
            <Path d="M13 10 C18 0 26 2 24 9 C23 13 17 13 13 10 Z" fill="#FFB0CF" />
            <Path d="M13 10 C9 14 5 19 9 19 C11 19 13 14 13 10 Z" fill="#FF8FB8" />
            <Path d="M13 10 C17 14 21 19 17 19 C15 19 13 14 13 10 Z" fill="#FFB0CF" />
            <Rect x={12.2} y={5} width={1.6} height={12} rx={0.8} fill="#4A2A1E" />
          </Svg>
        </Floater>
      )}
    </>
  );
}

/* Serengeti: sunset, an acacia, and two love birds flying ------------------ */

function Birds({ height, reduced }: { height: number; reduced: boolean }) {
  const t = useLoop(16000, 0, reduced);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [-60, W + 40] });
  const flap = usePulse(700, 0, reduced);
  const scaleY = flap.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] });
  const bird = (
    <Animated.View style={{ transform: [{ scaleY }] }}>
      <Svg width={22} height={10} viewBox="0 0 22 10">
        <Path d="M1 8 Q6 1 11 7 Q16 1 21 8" stroke="#2B1608" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
  return (
    <Animated.View style={[abs(0, height * 0.22), { flexDirection: 'row', gap: 6, transform: [{ translateX: reduced ? W * 0.55 : translateX }] }]}>
      {bird}
      <View style={{ marginTop: 8 }}>{bird}</View>
    </Animated.View>
  );
}

function SerengetiScene({ dark, height, reduced }: SceneProps) {
  const h = height;
  const ground = dark ? '#120A04' : '#3A2412';
  return (
    <>
      <Backdrop id="seren" stops={dark ? ['#3B1E3A', '#7A3B1F', '#1B0F05'] : ['#FFC36B', '#FF8A3D', '#C8452F']} height={h}>
        <Circle cx={W * 0.62} cy={h * 0.62} r={52} fill={dark ? '#F7B267' : '#FFE08A'} opacity={dark ? 0.75 : 0.95} />
        <Path d={`M0 ${h * 0.8} Q${W * 0.3} ${h * 0.74} ${W * 0.55} ${h * 0.79} T${W} ${h * 0.77} L${W} ${h} L0 ${h} Z`} fill={ground} />
        {/* Acacia */}
        <Path d={`M${W * 0.22} ${h * 0.8} C${W * 0.22} ${h * 0.68} ${W * 0.2} ${h * 0.6} ${W * 0.16} ${h * 0.5} M${W * 0.22} ${h * 0.7} C${W * 0.25} ${h * 0.6} ${W * 0.3} ${h * 0.54} ${W * 0.34} ${h * 0.5}`} stroke={ground} strokeWidth={6} fill="none" strokeLinecap="round" />
        <Ellipse cx={W * 0.25} cy={h * 0.47} rx={70} ry={11} fill={ground} />
        <Ellipse cx={W * 0.19} cy={h * 0.44} rx={36} ry={8} fill={ground} />
        <Ellipse cx={W * 0.32} cy={h * 0.445} rx={34} ry={8} fill={ground} />
        {/* Giraffe */}
        <Path
          d={`M${W * 0.8} ${h * 0.79} l2 -26 l-4 0 l-1 26 z M${W * 0.86} ${h * 0.79} l1 -26 l-4 0 l0 26 z M${W * 0.785} ${h * 0.68} q4 -6 24 -8 l6 -36 q2 -6 8 -6 l6 0 q2 2 0 4 l-6 2 l-6 36 q-2 10 -12 12 l-18 2 z`}
          fill={ground}
        />
        {dark &&
          [
            [40, 18], [90, 34], [150, 14], [210, 30], [270, 12], [330, 26],
          ].map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={1.4} fill="#FFF" opacity={0.8} />)}
      </Backdrop>
      <Birds height={h} reduced={reduced} />
    </>
  );
}

/* Diani Beach: waves, sand and a palm --------------------------------------- */

function Wave({ y, color, duration, height, amplitude, reverse, reduced }: { y: number; color: string; duration: number; height: number; amplitude: number; reverse?: boolean; reduced: boolean }) {
  const t = useLoop(duration, 0, reduced);
  const length = 120;
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: reverse ? [-length, 0] : [0, -length] });
  let d = `M0 ${amplitude}`;
  for (let x = 0; x < W + length * 2; x += length) d += ` q${length / 4} ${-amplitude} ${length / 2} 0 t${length / 2} 0`;
  d += ` L${W + length * 2} ${height} L0 ${height} Z`;
  return (
    <Animated.View style={[abs(0, y), { transform: [{ translateX }] }]}>
      <Svg width={W + length * 2} height={height - y} viewBox={`0 0 ${W + length * 2} ${height - y}`}>
        <Path d={d} fill={color} />
      </Svg>
    </Animated.View>
  );
}

function DianiScene({ dark, height, reduced }: SceneProps) {
  const h = height;
  return (
    <>
      <Backdrop id="diani" stops={dark ? ['#0A1F3B', '#12405A'] : ['#7FD3F2', '#D9F5FC']} height={h}>
        {dark ? <Path d="M290 30 A20 20 0 1 0 290 70 A15 20 0 1 1 290 30 Z" fill="#FFF4C2" /> : <Circle cx={290} cy={50} r={24} fill="#FFE07A" />}
        {dark &&
          [
            [30, 20], [80, 40], [140, 16], [200, 36], [250, 22], [340, 44],
          ].map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={1.3} fill="#FFF" opacity={0.8} />)}
      </Backdrop>
      <Wave y={h * 0.5} color={dark ? '#145C73' : '#38C6D2'} duration={9000} height={h} amplitude={6} reduced={reduced} />
      <Wave y={h * 0.6} color={dark ? '#0F4A5E' : '#11A3B0'} duration={6500} height={h} amplitude={7} reverse reduced={reduced} />
      <View style={abs(0, h * 0.78, { width: '100%', height: h * 0.22 })}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${h * 0.22}`} preserveAspectRatio="none">
          <Path d={`M0 10 Q${W / 2} -6 ${W} 12 L${W} ${h} L0 ${h} Z`} fill={dark ? '#4A4536' : '#F6E3B4'} />
        </Svg>
      </View>
      <View style={abs(-10, h * 0.12)} pointerEvents="none">
        <Svg width={120} height={h * 0.9} viewBox="0 0 120 200">
          <Path d="M20 200 C30 150 40 100 62 52" stroke={dark ? '#0A1A14' : '#6B4A2B'} strokeWidth={7} fill="none" strokeLinecap="round" />
          {[
            'M62 52 C40 40 20 44 6 62 C26 52 44 52 62 52',
            'M62 52 C52 28 34 18 16 20 C34 30 48 38 62 52',
            'M62 52 C70 26 90 14 112 18 C92 26 76 38 62 52',
            'M62 52 C84 44 104 52 118 70 C98 60 80 56 62 52',
            'M62 52 C60 30 64 12 76 0 C70 20 66 36 62 52',
          ].map((d, i) => (
            <Path key={i} d={d} fill={dark ? '#0F2A1E' : '#2E8B57'} />
          ))}
        </Svg>
      </View>
    </>
  );
}

/* Starry Night: twinkling stars, a moon and a shooting star ---------------- */

function ShootingStar({ reduced }: { reduced: boolean }) {
  const t = useLoop(9000, 2000, reduced);
  const translateX = t.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 180, 180] });
  const translateY = t.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 60, 60] });
  const opacity = t.interpolate({ inputRange: [0, 0.02, 0.1, 0.12, 1], outputRange: [0, 1, 1, 0, 0] });
  if (reduced) return null;
  return (
    <Animated.View style={[abs('10%', 18), { opacity, transform: [{ translateX }, { translateY }, { rotate: '18deg' }] }]}>
      <View style={{ width: 60, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF' }} />
    </Animated.View>
  );
}

function StarryScene({ dark, height, reduced }: SceneProps) {
  const h = height;
  const stars: [string, number, number, number][] = [
    ['6%', 0.2, 3, 0], ['14%', 0.55, 2, 600], ['21%', 0.12, 4, 1200], ['28%', 0.72, 2, 300], ['35%', 0.32, 3, 1800],
    ['43%', 0.08, 2, 900], ['47%', 0.6, 3, 1500], ['55%', 0.25, 2, 400], ['60%', 0.78, 2, 2100], ['67%', 0.42, 4, 700],
    ['72%', 0.1, 2, 1300], ['80%', 0.62, 3, 200], ['88%', 0.3, 2, 1700], ['93%', 0.75, 3, 1000], ['10%', 0.85, 2, 2400],
    ['39%', 0.88, 2, 500], ['52%', 0.45, 2, 1900], ['84%', 0.9, 2, 800],
  ];
  return (
    <>
      <Backdrop id="starry" stops={dark ? ['#1C1C52', '#0B0B22'] : ['#6A5BD0', '#2B2470']} height={h}>
        <Path d={`M${W - 70} 34 A28 28 0 1 0 ${W - 70} 90 A21 28 0 1 1 ${W - 70} 34 Z`} fill="#FFF1B8" />
        <Circle cx={W - 80} cy={62} r={48} fill="#FFF1B8" opacity={0.06} />
        <Path d={`M0 ${h} L0 ${h * 0.86} Q${W * 0.25} ${h * 0.8} ${W * 0.5} ${h * 0.87} T${W} ${h * 0.84} L${W} ${h} Z`} fill="#000" opacity={0.25} />
      </Backdrop>
      {stars.map(([x, y, s, d], i) => (
        <Twinkle key={i} x={x} y={h * y} size={s} color="#FFFFFF" delay={d} duration={2400 + (i % 4) * 500} reduced={reduced} />
      ))}
      <ShootingStar reduced={reduced} />
    </>
  );
}

/* Golden Hour: a window of night sky, a glowing ribbon of hearts, sunlit stone and leaves */

/** A heart traced as one line, with a small gap at the top like a ribbon. */
export function ribbonHeart(cx: number, cy: number, scale: number, gap = 0.28) {
  const pts: string[] = [];
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const t = gap + ((2 * Math.PI - 2 * gap) * i) / steps;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push(`${i ? 'L' : 'M'}${(cx + x * scale).toFixed(1)} ${(cy - y * scale).toFixed(1)}`);
  }
  return pts.join(' ');
}

export function leafPath(x: number, y: number, len: number, angle: number) {
  const a = (angle * Math.PI) / 180;
  const ex = x + len * Math.cos(a);
  const ey = y + len * Math.sin(a);
  const nx = -Math.sin(a) * len * 0.32;
  const ny = Math.cos(a) * len * 0.32;
  const mx = (x + ex) / 2;
  const my = (y + ey) / 2;
  return `M${x.toFixed(1)} ${y.toFixed(1)} Q${(mx + nx).toFixed(1)} ${(my + ny).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)} Q${(mx - nx).toFixed(1)} ${(my - ny).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)} Z`;
}

/** A spray of leaves from one point, swaying a little. */
function LeafSpray({ x, y, flip, dark, reduced, delay }: { x: string; y: number; flip?: boolean; dark: boolean; reduced: boolean; delay: number }) {
  const t = usePulse(5200, delay, reduced);
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '3deg'] });
  const leaves: [number, number, number][] = [
    [8, 70, -30], [12, 62, -55], [18, 58, -10], [6, 52, -80], [26, 48, 12], [30, 40, -38], [14, 44, 32],
  ];
  const deep = dark ? '#1E2E14' : '#2F4A22';
  const light = dark ? '#33491F' : '#5B7A35';
  return (
    <Animated.View style={[abs(x, y), { width: 90, height: 90, transform: [{ scaleX: flip ? -1 : 1 }, { rotate }] }]}>
      <Svg width={90} height={90} viewBox="0 0 90 90">
        {leaves.map(([dx, len, ang], i) => (
          <Path key={i} d={leafPath(4 + dx * 0.3, 86 - dx, len * 0.75, ang - 45)} fill={i % 2 ? light : deep} opacity={0.95} />
        ))}
      </Svg>
    </Animated.View>
  );
}

/** The glowing ribbon: a soft wide glow under a bright gold line, breathing slowly. */
function HeartRibbon({ height, reduced }: { height: number; reduced: boolean }) {
  const t = usePulse(4200, 0, reduced);
  const opacity = t.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const h = height;
  const big = ribbonHeart(W * 0.6, h * 0.3, 2.6);
  const small = ribbonHeart(W * 0.42, h * 0.42, 1.6, 0.4);
  const swoosh = `M${W * 0.3} ${h * 0.74} C${W * 0.26} ${h * 0.55} ${W * 0.33} ${h * 0.5} ${W * 0.38} ${h * 0.56}`;
  return (
    <Animated.View style={[abs(0, 0), { width: '100%', height: h, opacity }]}>
      <Svg width="100%" height={h} viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="xMidYMid slice">
        {[big, small, swoosh].map((d, i) => (
          <G key={i}>
            <Path d={d} stroke="#FFB547" strokeOpacity={0.22} strokeWidth={14} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Path d={d} stroke="#FFD48A" strokeOpacity={0.5} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Path d={d} stroke="#FFF3D6" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </G>
        ))}
      </Svg>
    </Animated.View>
  );
}

function GoldenScene({ dark, height, reduced }: SceneProps) {
  const h = height;
  const wl = W * 0.22;
  const wr = W * 0.8;
  const sill = h * 0.8;
  const wall = dark ? '#5A2C12' : '#E0863A';
  const wallLine = dark ? '#3A1C0A' : '#B9652A';
  const step = dark ? '#6B3818' : '#EE9A4C';
  const stepTop = dark ? '#8A4D22' : '#FFC27A';
  const stars: [string, number, number, number][] = [
    ['28%', 0.12, 3, 0], ['36%', 0.3, 2, 700], ['47%', 0.08, 3, 1400], ['70%', 0.12, 2, 300], ['74%', 0.5, 3, 1100],
    ['32%', 0.6, 2, 1800], ['55%', 0.62, 2, 500], ['66%', 0.7, 3, 2200], ['40%', 0.18, 2, 900],
  ];
  return (
    <>
      <Backdrop id="golden" stops={dark ? ['#3A1D0C', '#1A0F08'] : ['#FFC170', '#D9702A']} height={h}>
        {/* Stone walls either side, with a few joints. */}
        <Rect x={0} y={0} width={wl} height={sill} fill={wall} />
        <Rect x={wr} y={0} width={W - wr} height={sill} fill={wall} />
        {[0.16, 0.34, 0.52, 0.7].map((y, i) => (
          <G key={i} opacity={0.35}>
            <Path d={`M0 ${h * y} H${wl} M${wr} ${h * y} H${W}`} stroke={wallLine} strokeWidth={1.2} />
            <Path d={`M${i % 2 ? wl * 0.5 : wl * 0.25} ${h * y} v${h * 0.18} M${wr + (i % 2 ? 22 : 44)} ${h * y} v${h * 0.18}`} stroke={wallLine} strokeWidth={1.2} />
          </G>
        ))}
        {/* The window of night sky. */}
        <Rect x={wl} y={0} width={wr - wl} height={sill} fill={dark ? '#0E0805' : '#1E120A'} />
        <Rect x={wl} y={0} width={4} height={sill} fill="#000" opacity={0.25} />
        {/* Steps. */}
        <Rect x={0} y={sill} width={W} height={h - sill} fill={step} />
        <Rect x={0} y={sill} width={W} height={3} fill={stepTop} />
        <Rect x={0} y={sill + (h - sill) * 0.55} width={W} height={2} fill={stepTop} opacity={0.6} />
        {/* Sunbeams slanting across. */}
        <Path d={`M0 ${h * 0.05} L${W * 0.12} 0 L${W * 0.5} ${h} L${W * 0.34} ${h} Z`} fill="#FFF4D6" opacity={dark ? 0.06 : 0.16} />
        <Path d={`M${W * 0.62} 0 L${W * 0.7} 0 L${W} ${h * 0.62} L${W} ${h * 0.82} Z`} fill="#FFF4D6" opacity={dark ? 0.05 : 0.12} />
      </Backdrop>
      {stars.map(([x, y, s, d], i) => (
        <Twinkle key={i} x={x} y={h * y} size={s} color="#FFE6A8" delay={d} duration={2600 + (i % 3) * 500} reduced={reduced} />
      ))}
      <HeartRibbon height={h} reduced={reduced} />
      <LeafSpray x="-5%" y={h - 82} dark={dark} reduced={reduced} delay={0} />
      <LeafSpray x="84%" y={h - 86} flip dark={dark} reduced={reduced} delay={1600} />
      <LeafSpray x="86%" y={-26} flip dark={dark} reduced={reduced} delay={800} />
    </>
  );
}

/* Shared ------------------------------------------------------------------ */

type SceneProps = { dark: boolean; height: number; reduced: boolean };

function Backdrop({ id, stops, height, children }: { id: string; stops: string[]; height: number; children?: ReactNode }) {
  // Each hero needs its own gradient id: on the web, two screens that share one hide each other's sky.
  const gid = `bg-${id}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg style={{ position: 'absolute', left: 0, top: 0 }} width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          {stops.map((c, i) => (
            <Stop key={i} offset={i / (stops.length - 1)} stopColor={c} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={height} fill={`url(#${gid})`} />
      {children}
    </Svg>
  );
}

const SCENES: Record<ThemeName, (p: SceneProps) => ReactNode> = {
  rose: RoseScene,
  steampunk: SteampunkScene,
  meadow: MeadowScene,
  serengeti: SerengetiScene,
  diani: DianiScene,
  starry: StarryScene,
  golden: GoldenScene,
};

/** Text colour that reads well on each scene. */
export function heroInk(theme: ThemeName, dark: boolean): { ink: string; soft: string; shadow: string } {
  const lightSky = !dark && (theme === 'meadow' || theme === 'diani');
  return lightSky
    ? { ink: '#0F2A2E', soft: 'rgba(15,42,46,0.75)', shadow: 'rgba(255,255,255,0.6)' }
    : { ink: '#FFFFFF', soft: 'rgba(255,255,255,0.85)', shadow: 'rgba(0,0,0,0.35)' };
}

/** The animated picture at the top of Home, drawn for your theme. */
export function Hero({ height = 230, children, theme: forced }: { height?: number; children?: ReactNode; theme?: ThemeName }) {
  const current = useThemeName();
  const theme = forced ?? current;
  const dark = useColorScheme() === 'dark';
  const reduced = useReducedMotion();
  const Scene = SCENES[theme];
  return (
    <View style={{ height, borderRadius: radius.xl, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Scene dark={dark} height={height} reduced={reduced} />
      </View>
      {children}
    </View>
  );
}
