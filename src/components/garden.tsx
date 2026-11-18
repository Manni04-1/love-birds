import type { ReactNode } from 'react';
import { Animated, useColorScheme, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { usePulse, useReducedMotion } from '@/components/hero';
import { radius, useThemeName, type ThemeName } from '@/lib/theme';

type FlowerKind = 'rose' | 'daisy' | 'sunflower' | 'hibiscus' | 'gear' | 'star';

type Look = {
  flower: FlowerKind;
  petal: string;
  petal2: string;
  center: string;
  stem: string;
  leaf: string;
  ground: string;
  groundTop: string;
  sky: { light: [string, string]; dark: [string, string] };
};

const LOOKS: Record<ThemeName, Look> = {
  rose: {
    flower: 'rose',
    petal: '#E0436E',
    petal2: '#B8264F',
    center: '#7E1634',
    stem: '#4E8A3E',
    leaf: '#5FA34C',
    ground: '#7A4B3A',
    groundTop: '#9A6450',
    sky: { light: ['#FFE3EC', '#FFF6F8'], dark: ['#3A1626', '#24101A'] },
  },
  meadow: {
    flower: 'daisy',
    petal: '#FFFFFF',
    petal2: '#D9D9D9',
    center: '#F4C430',
    stem: '#4A8F3A',
    leaf: '#6DB050',
    ground: '#5E8C3A',
    groundTop: '#7AAE4A',
    sky: { light: ['#D6EEFF', '#F2FAEA'], dark: ['#16301F', '#1B2A1A'] },
  },
  serengeti: {
    flower: 'sunflower',
    petal: '#F6B40E',
    petal2: '#E08E0B',
    center: '#6B3E1F',
    stem: '#5D7F2E',
    leaf: '#7A9A3A',
    ground: '#B9773E',
    groundTop: '#D19455',
    sky: { light: ['#FFDCAE', '#FFF3DE'], dark: ['#3A2410', '#22170C'] },
  },
  diani: {
    flower: 'hibiscus',
    petal: '#F0476B',
    petal2: '#C72550',
    center: '#FFD45C',
    stem: '#3F8A4E',
    leaf: '#4DA35E',
    ground: '#E3C88F',
    groundTop: '#F0DAAA',
    sky: { light: ['#C8EEF5', '#F5FBF7'], dark: ['#0F2E36', '#132226'] },
  },
  steampunk: {
    flower: 'gear',
    petal: '#C9A227',
    petal2: '#8F7118',
    center: '#4A3828',
    stem: '#9A4E2A',
    leaf: '#B87333',
    ground: '#4A3828',
    groundTop: '#5E4733',
    sky: { light: ['#E6D4B4', '#F6EEDF'], dark: ['#2C2016', '#1E160F'] },
  },
  starry: {
    flower: 'star',
    petal: '#FFE38A',
    petal2: '#F5B83D',
    center: '#FFF6D0',
    stem: '#6C7BD9',
    leaf: '#8C98F0',
    ground: '#2B2A5C',
    groundTop: '#3A3878',
    sky: { light: ['#1C1B45', '#2D2B66'], dark: ['#0E0D2A', '#1A1840'] },
  },
};

const W = 300;
const H = 200;
const BASE_X = 150;
const BASE_Y = 178;

/** How the plant looks at each of the nine stages. */
const SHAPE = [
  { stem: 0, leaves: 0, open: 0, buds: 0 },
  { stem: 22, leaves: 2, open: 0, buds: 0 },
  { stem: 40, leaves: 2, open: 0, buds: 0 },
  { stem: 62, leaves: 4, open: 0, buds: 0 },
  { stem: 80, leaves: 4, open: 0, buds: 1 },
  { stem: 92, leaves: 6, open: 1, buds: 1 },
  { stem: 104, leaves: 6, open: 3, buds: 1 },
  { stem: 114, leaves: 8, open: 5, buds: 1 },
  { stem: 122, leaves: 8, open: 7, buds: 0 },
];

/** Where flowers sit: dx from the stem, how far up it (0 to 1), and their size. */
const SPOTS = [
  { dx: 0, up: 1, r: 1 },
  { dx: -36, up: 0.8, r: 0.85 },
  { dx: 36, up: 0.72, r: 0.85 },
  { dx: -54, up: 0.56, r: 0.75 },
  { dx: 52, up: 0.5, r: 0.75 },
  { dx: -64, up: 0.34, r: 0.65 },
  { dx: 66, up: 0.3, r: 0.65 },
];

const BG_STARS = [
  [24, 22, 1.2],
  [62, 48, 0.8],
  [96, 16, 1],
  [214, 26, 1.3],
  [256, 54, 0.9],
  [280, 18, 0.8],
  [182, 12, 0.7],
  [40, 86, 0.7],
  [270, 96, 0.8],
] as const;

function rot(deg: number, x: number, y: number) {
  return `rotate(${deg} ${x} ${y})`;
}

function gearPath(x: number, y: number, r: number, teeth = 8) {
  const inner = r * 0.78;
  const step = (Math.PI * 2) / teeth;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const corners = [
      [inner, a - step * 0.5],
      [inner, a - step * 0.22],
      [r, a - step * 0.16],
      [r, a + step * 0.16],
      [inner, a + step * 0.22],
    ] as const;
    for (const [rad, ang] of corners) pts.push(`${(x + rad * Math.cos(ang)).toFixed(1)} ${(y + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

function starPath(x: number, y: number, r: number, points = 5) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    pts.push(`${(x + rad * Math.cos(a)).toFixed(1)} ${(y + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

function Flower({ look, x, y, r }: { look: Look; x: number; y: number; r: number }) {
  const { petal, petal2, center } = look;
  switch (look.flower) {
    case 'rose':
      return (
        <G>
          {[0, 72, 144, 216, 288].map((a) => (
            <Circle key={a} cx={x} cy={y - r * 0.42} r={r * 0.55} fill={petal} transform={rot(a, x, y)} />
          ))}
          <Circle cx={x} cy={y} r={r * 0.58} fill={petal2} />
          <Path d={`M ${x - r * 0.3} ${y} a ${r * 0.3} ${r * 0.3} 0 1 1 ${r * 0.3} ${r * 0.3} a ${r * 0.16} ${r * 0.16} 0 1 1 0 ${-r * 0.32}`} stroke={center} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'daisy':
      return (
        <G>
          {Array.from({ length: 12 }, (_, i) => (
            <Ellipse key={i} cx={x} cy={y - r * 0.55} rx={r * 0.2} ry={r * 0.48} fill={petal} stroke={petal2} strokeWidth={0.8} transform={rot(i * 30, x, y)} />
          ))}
          <Circle cx={x} cy={y} r={r * 0.32} fill={center} />
        </G>
      );
    case 'sunflower':
      return (
        <G>
          {Array.from({ length: 16 }, (_, i) => (
            <Path
              key={i}
              d={`M ${x} ${y - r * 0.3} Q ${x + r * 0.2} ${y - r * 0.7} ${x} ${y - r * 1.05} Q ${x - r * 0.2} ${y - r * 0.7} ${x} ${y - r * 0.3} Z`}
              fill={i % 2 ? petal2 : petal}
              transform={rot(i * 22.5, x, y)}
            />
          ))}
          <Circle cx={x} cy={y} r={r * 0.44} fill={center} />
          <Circle cx={x} cy={y} r={r * 0.28} fill="#4A2A14" />
        </G>
      );
    case 'hibiscus':
      return (
        <G>
          {[0, 72, 144, 216, 288].map((a) => (
            <Ellipse key={a} cx={x} cy={y - r * 0.5} rx={r * 0.42} ry={r * 0.56} fill={petal} stroke={petal2} strokeWidth={1} transform={rot(a, x, y)} />
          ))}
          <Circle cx={x} cy={y} r={r * 0.2} fill={petal2} />
          <Line x1={x} y1={y} x2={x + r * 0.45} y2={y - r * 0.8} stroke={center} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={x + r * 0.45} cy={y - r * 0.8} r={r * 0.12} fill={center} />
        </G>
      );
    case 'gear':
      return (
        <G>
          <Path d={gearPath(x, y, r)} fill={petal} stroke={petal2} strokeWidth={1.2} />
          <Circle cx={x} cy={y} r={r * 0.52} fill="none" stroke={petal2} strokeWidth={1.4} />
          <Circle cx={x} cy={y} r={r * 0.26} fill={center} />
        </G>
      );
    case 'star':
      return (
        <G>
          <Circle cx={x} cy={y} r={r * 1.15} fill={petal} opacity={0.18} />
          <Path d={starPath(x, y, r)} fill={petal} stroke={petal2} strokeWidth={1} strokeLinejoin="round" />
          <Circle cx={x} cy={y} r={r * 0.18} fill={center} />
        </G>
      );
  }
}

function Bud({ look, x, y, r }: { look: Look; x: number; y: number; r: number }) {
  if (look.flower === 'gear') return <Path d={gearPath(x, y, r * 0.5, 6)} fill={look.petal} stroke={look.petal2} strokeWidth={1} />;
  if (look.flower === 'star') return <Path d={starPath(x, y, r * 0.5)} fill={look.petal} opacity={0.8} />;
  return (
    <G>
      <Ellipse cx={x} cy={y - r * 0.15} rx={r * 0.3} ry={r * 0.45} fill={look.petal} stroke={look.petal2} strokeWidth={0.8} />
      <Path d={`M ${x - r * 0.34} ${y + r * 0.05} Q ${x} ${y + r * 0.45} ${x + r * 0.34} ${y + r * 0.05} Q ${x} ${y + r * 0.2} ${x - r * 0.34} ${y + r * 0.05} Z`} fill={look.leaf} />
    </G>
  );
}

function leafPath(x: number, y: number, dir: 1 | -1, size: number) {
  return `M ${x} ${y} Q ${x + dir * size * 0.5} ${y - size * 0.75} ${x + dir * size} ${y - size * 0.4} Q ${x + dir * size * 0.55} ${y + size * 0.15} ${x} ${y} Z`;
}

/** One plant: a stem with leaves, buds and flowers. */
function Plant({ look, stage, x, scale = 1 }: { look: Look; stage: number; x: number; scale?: number }) {
  const shape = SHAPE[stage];
  const h = shape.stem * scale;
  const top = BASE_Y - h;
  const flowerR = (stage >= 6 ? 15 : 13) * scale;
  const stemWidth = (look.flower === 'gear' ? 4.5 : 3.2) * Math.max(0.7, scale);
  const parts: ReactNode[] = [];

  // Side stems first, so flowers sit on top of them.
  const total = shape.open + shape.buds;
  for (let i = 1; i < Math.min(total, SPOTS.length); i++) {
    const s = SPOTS[i];
    const fx = x + s.dx * scale;
    const fy = BASE_Y - h * s.up;
    const sy = BASE_Y - h * (s.up - 0.2);
    parts.push(
      <Path key={`b${i}`} d={`M ${x} ${sy} Q ${x + s.dx * scale * 0.4} ${fy - 4} ${fx} ${fy}`} stroke={look.stem} strokeWidth={stemWidth * 0.75} fill="none" strokeLinecap="round" />,
    );
  }
  parts.push(
    <Path key="stem" d={`M ${x} ${BASE_Y} C ${x - 4 * scale} ${BASE_Y - h * 0.35} ${x + 4 * scale} ${BASE_Y - h * 0.7} ${x} ${top}`} stroke={look.stem} strokeWidth={stemWidth} fill="none" strokeLinecap="round" />,
  );
  for (let i = 0; i < shape.leaves; i++) {
    const dir = i % 2 ? 1 : -1;
    const up = 0.12 + (i / Math.max(1, shape.leaves)) * 0.62;
    const size = (stage <= 2 ? 11 : 16) * scale * (1 - up * 0.35);
    parts.push(<Path key={`l${i}`} d={leafPath(x, BASE_Y - h * up, dir, size)} fill={look.leaf} />);
  }
  for (let i = 0; i < Math.min(total, SPOTS.length); i++) {
    const s = SPOTS[i];
    const fx = x + s.dx * scale;
    const fy = BASE_Y - h * s.up;
    const r = flowerR * s.r;
    parts.push(i < shape.open ? <Flower key={`f${i}`} look={look} x={fx} y={fy} r={r} /> : <Bud key={`f${i}`} look={look} x={fx} y={fy} r={r} />);
  }
  return <G>{parts}</G>;
}

function Sparkle({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  return <Path d={`M ${x} ${y - s} Q ${x} ${y} ${x + s} ${y} Q ${x} ${y} ${x} ${y + s} Q ${x} ${y} ${x - s} ${y} Q ${x} ${y} ${x} ${y - s} Z`} fill={color} />;
}

/** Your love garden, drawn for your theme. stage runs from 0 (a seed) to 8 (magnificent). */
export function Garden({ stage, height = 200 }: { stage: number; height?: number }) {
  const theme = useThemeName();
  const dark = useColorScheme() === 'dark';
  const reduced = useReducedMotion();
  const sway = usePulse(5200, 0, reduced);
  const look = LOOKS[theme];
  const [skyTop, skyBottom] = dark ? look.sky.dark : look.sky.light;
  const s = Math.max(0, Math.min(8, Math.round(stage)));
  const rotate = sway.interpolate({ inputRange: [0, 1], outputRange: ['-1.6deg', '1.6deg'] });
  const nightSky = theme === 'starry' || dark;

  return (
    <View style={{ height, borderRadius: radius.lg, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="gardenSky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={skyTop} />
            <Stop offset="1" stopColor={skyBottom} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#gardenSky)" />
        {nightSky && BG_STARS.map(([x, y, r], i) => <Circle key={i} cx={x} cy={y} r={r} fill="#FFFFFF" opacity={0.7} />)}
        {!nightSky && <Circle cx={254} cy={38} r={16} fill={theme === 'steampunk' ? '#E3BC4E' : '#FFD66B'} opacity={0.85} />}
        <Ellipse cx={150} cy={198} rx={170} ry={26} fill={look.ground} />
        <Ellipse cx={150} cy={184} rx={128} ry={10} fill={look.groundTop} />
        {s === 0 && (
          <G>
            <Ellipse cx={BASE_X} cy={BASE_Y + 2} rx={8} ry={5.5} fill="#8A5A2B" />
            <Path d={`M ${BASE_X - 12} ${BASE_Y + 1} Q ${BASE_X} ${BASE_Y - 4} ${BASE_X + 12} ${BASE_Y + 1}`} stroke={look.ground} strokeWidth={3} fill="none" strokeLinecap="round" />
          </G>
        )}
      </Svg>
      {s > 0 && (
        <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, transformOrigin: '50% 90%', transform: [{ rotate }] }}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">
            {s >= 7 && <Plant look={look} stage={s === 8 ? 6 : 4} x={62} scale={0.55} />}
            {s >= 7 && <Plant look={look} stage={s === 8 ? 6 : 5} x={238} scale={0.5} />}
            <Plant look={look} stage={s} x={BASE_X} />
            {s === 8 && (
              <G>
                <Sparkle x={92} y={46} s={6} color={look.petal2} />
                <Sparkle x={212} y={36} s={5} color={look.petal2} />
                <Sparkle x={236} y={84} s={4} color={look.petal} />
                <Sparkle x={70} y={92} s={4} color={look.petal} />
              </G>
            )}
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}
