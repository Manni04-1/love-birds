import { useId, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { HEART_PATH, leafPath, ribbonHeart } from '@/components/hero';
import { useColors, useThemeName, type Colors, type ThemeName } from '@/lib/theme';

/*
 * A quiet picture behind every screen, drawn for your theme: hearts for Rose, gears for Steampunk,
 * hills and flowers for Meadow, acacias for Serengeti, waves for Diani Beach and stars for Starry Night.
 * It keeps to the edges and stays faint, so words and cards on top stay easy to read.
 */

type Motif = { w: number; h: number; dark: boolean; c: Colors; id: string };

/** The same "random" numbers every time, so the picture doesn't jump between screens. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A soft wash of colour from the top (or bottom) of the screen. */
function Wash({ id, w, h, color, strength, from = 'top', reach = 0.5 }: { id: string; w: number; h: number; color: string; strength: number; from?: 'top' | 'bottom'; reach?: number }) {
  const top = from === 'top';
  return (
    <>
      <Defs>
        <LinearGradient id={`wash-${id}`} x1="0" y1={top ? '0' : '1'} x2="0" y2={top ? '1' : '0'}>
          <Stop offset="0" stopColor={color} stopOpacity={strength} />
          <Stop offset={String(reach)} stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#wash-${id})`} />
    </>
  );
}

/** A round glow, like the sun through cloud or a far-off nebula. */
function Glow({ id, cx, cy, r, color, strength }: { id: string; cx: number; cy: number; r: number; color: string; strength: number }) {
  return (
    <>
      <Defs>
        <RadialGradient id={`glow-${id}`} cx={cx} cy={cy} r={r} fx={cx} fy={cy} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color} stopOpacity={strength} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={r} fill={`url(#glow-${id})`} />
    </>
  );
}

function Heart({ x, y, size, rotate, color, opacity, outline }: { x: number; y: number; size: number; rotate: number; color: string; opacity: number; outline?: boolean }) {
  const s = size / 24;
  return (
    <G transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s}) translate(-12 -12)`} opacity={opacity}>
      <Path d={HEART_PATH} fill={outline ? 'none' : color} stroke={outline ? color : undefined} strokeWidth={outline ? 1.6 / s : 0} />
    </G>
  );
}

/* Rose: hearts drifting at the edges -------------------------------------- */

function RoseMotif({ w, h, dark, c, id }: Motif) {
  const rand = seeded(7);
  const colors = [c.accent, c.accent2, c.accent3];
  const hearts = Array.from({ length: 22 }, (_, i) => {
    // Mostly along the left and right edges, a few further in.
    const edge = i % 4 !== 3;
    const side = rand() < 0.5;
    const x = edge ? (side ? rand() * w * 0.2 : w - rand() * w * 0.2) : w * (0.25 + rand() * 0.5);
    return {
      x,
      y: rand() * h,
      size: edge ? 12 + rand() * 22 : 8 + rand() * 8,
      rotate: -25 + rand() * 50,
      color: colors[i % 3],
      opacity: (edge ? 0.07 + rand() * 0.07 : 0.05) * (dark ? 1.4 : 1),
      outline: i % 5 === 0,
    };
  });
  return (
    <>
      <Wash id={id} w={w} h={h} color={c.accent} strength={dark ? 0.14 : 0.09} reach={0.45} />
      <Glow id={id} cx={w * 0.9} cy={h * 0.06} r={w * 0.6} color={c.accent2} strength={dark ? 0.12 : 0.1} />
      {hearts.map((p, i) => (
        <Heart key={i} {...p} />
      ))}
      <Heart x={w * 0.88} y={h * 0.9} size={170} rotate={-14} color={c.accent} opacity={dark ? 0.12 : 0.09} outline />
    </>
  );
}

/* Steampunk: brass gears and a riveted pipe ------------------------------- */

function gearPath(cx: number, cy: number, teeth: number, outer: number, inner: number) {
  const step = (Math.PI * 2) / teeth;
  const pt = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    d += `${i ? 'L' : 'M'}${pt(inner, a)} L${pt(outer, a + step * 0.12)} L${pt(outer, a + step * 0.38)} L${pt(inner, a + step * 0.5)} `;
  }
  return `${d}Z`;
}

function GearOutline({ cx, cy, r, teeth, color, opacity }: { cx: number; cy: number; r: number; teeth: number; color: string; opacity: number }) {
  return (
    <G opacity={opacity}>
      <Path d={gearPath(cx, cy, teeth, r, r * 0.84)} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" />
      <Circle cx={cx} cy={cy} r={r * 0.52} fill="none" stroke={color} strokeWidth={2.5} />
      <Circle cx={cx} cy={cy} r={r * 0.16} fill={color} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i * Math.PI) / 3;
        return <Path key={i} d={`M${cx + r * 0.16 * Math.cos(a)} ${cy + r * 0.16 * Math.sin(a)} L${cx + r * 0.52 * Math.cos(a)} ${cy + r * 0.52 * Math.sin(a)}`} stroke={color} strokeWidth={2.5} />;
      })}
    </G>
  );
}

function SteampunkMotif({ w, h, dark, c, id }: Motif) {
  const k = dark ? 1.35 : 1;
  const rivets = Array.from({ length: Math.ceil((h * 0.5) / 34) }, (_, i) => h * 0.25 + i * 34);
  return (
    <>
      <Wash id={id} w={w} h={h} color={c.accent2} strength={dark ? 0.1 : 0.12} reach={0.4} />
      <Glow id={id} cx={w * 0.1} cy={h * 0.98} r={w * 0.8} color={c.accent} strength={dark ? 0.12 : 0.08} />
      <GearOutline cx={w + 6} cy={70} r={118} teeth={16} color={c.accent2} opacity={0.11 * k} />
      <GearOutline cx={w - 128} cy={168} r={52} teeth={10} color={c.accent} opacity={0.1 * k} />
      <GearOutline cx={-24} cy={h - 130} r={128} teeth={18} color={c.accent2} opacity={0.1 * k} />
      <GearOutline cx={118} cy={h - 34} r={46} teeth={10} color={c.accent3} opacity={0.12 * k} />
      {/* A brass pipe down the right edge, held on with rivets. */}
      <Rect x={w - 9} y={h * 0.22} width={5} height={h * 0.56} rx={2.5} fill={c.accent2} opacity={0.1 * k} />
      {rivets.map((y, i) => (
        <Circle key={i} cx={w - 6.5} cy={y} r={3.4} fill={c.accent2} opacity={0.16 * k} />
      ))}
    </>
  );
}

/* Meadow: hills, flowers, and fireflies at night --------------------------- */

function Flower({ x, y, r, color, center, opacity }: { x: number; y: number; r: number; color: string; center: string; opacity: number }) {
  return (
    <G opacity={opacity}>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        return <Circle key={i} cx={x + r * Math.cos(a)} cy={y + r * Math.sin(a)} r={r * 0.75} fill={color} />;
      })}
      <Circle cx={x} cy={y} r={r * 0.55} fill={center} />
    </G>
  );
}

function MeadowMotif({ w, h, dark, c, id }: Motif) {
  const rand = seeded(21);
  const back = `M0 ${h - 120} C ${w * 0.25} ${h - 175}, ${w * 0.5} ${h - 95}, ${w * 0.72} ${h - 140} S ${w} ${h - 150}, ${w} ${h - 150} L${w} ${h} L0 ${h} Z`;
  const front = `M0 ${h - 70} C ${w * 0.3} ${h - 40}, ${w * 0.55} ${h - 120}, ${w} ${h - 80} L${w} ${h} L0 ${h} Z`;
  const flowers = Array.from({ length: 11 }, () => ({ x: rand() * w, y: h - 20 - rand() * 70, r: 3.5 + rand() * 3 }));
  const flies = Array.from({ length: 14 }, () => ({ x: rand() * w, y: h * 0.1 + rand() * h * 0.7 }));
  return (
    <>
      <Wash id={id} w={w} h={h} color={c.accent3} strength={dark ? 0.12 : 0.14} reach={0.42} />
      {!dark && <Glow id={id} cx={w * 0.86} cy={h * 0.07} r={w * 0.45} color={c.accent2} strength={0.16} />}
      <Path d={back} fill={c.accent} opacity={dark ? 0.12 : 0.08} />
      <Path d={front} fill={c.accent} opacity={dark ? 0.16 : 0.11} />
      {flowers.map((f, i) => (
        <Flower key={i} {...f} color={[c.accent2, c.accent3, '#F48FB1'][i % 3]} center={dark ? c.page : '#FFFFFF'} opacity={dark ? 0.35 : 0.3} />
      ))}
      {dark &&
        flies.map((f, i) => (
          <G key={`f${i}`}>
            <Circle cx={f.x} cy={f.y} r={6} fill={c.accent2} opacity={0.08} />
            <Circle cx={f.x} cy={f.y} r={1.6} fill={c.accent2} opacity={0.55} />
          </G>
        ))}
    </>
  );
}

/* Serengeti: acacias against a low sun (or the moon) ----------------------- */

function Acacia({ x, base, size, color, opacity }: { x: number; base: number; size: number; color: string; opacity: number }) {
  const s = size;
  // A trunk that forks, under a wide flat crown.
  const trunk = `M${x - 0.03 * s} ${base} L${x - 0.02 * s} ${base - 0.38 * s} L${x - 0.2 * s} ${base - 0.62 * s} L${x - 0.16 * s} ${base - 0.64 * s} L${x} ${base - 0.45 * s} L${x + 0.18 * s} ${base - 0.66 * s} L${x + 0.22 * s} ${base - 0.63 * s} L${x + 0.03 * s} ${base - 0.38 * s} L${x + 0.04 * s} ${base} Z`;
  const crown = `M${x - 0.55 * s} ${base - 0.66 * s} C ${x - 0.45 * s} ${base - 0.86 * s}, ${x + 0.4 * s} ${base - 0.9 * s}, ${x + 0.58 * s} ${base - 0.68 * s} C ${x + 0.3 * s} ${base - 0.6 * s}, ${x - 0.3 * s} ${base - 0.58 * s}, ${x - 0.55 * s} ${base - 0.66 * s} Z`;
  return (
    <G opacity={opacity}>
      <Path d={trunk} fill={color} />
      <Path d={crown} fill={color} />
    </G>
  );
}

function SerengetiMotif({ w, h, dark, c, id }: Motif) {
  const rand = seeded(5);
  const ground = `M0 ${h - 46} C ${w * 0.3} ${h - 58}, ${w * 0.6} ${h - 38}, ${w} ${h - 52} L${w} ${h} L0 ${h} Z`;
  const stars = Array.from({ length: 26 }, () => ({ x: rand() * w, y: rand() * h * 0.45, r: 0.6 + rand() * 1.2 }));
  return (
    <>
      <Wash id={id} w={w} h={h} color={c.accent} strength={dark ? 0.16 : 0.14} from="bottom" reach={0.5} />
      <Circle cx={w * 0.7} cy={h - 120} r={68} fill={dark ? c.ink : c.accent} opacity={dark ? 0.07 : 0.1} />
      <Glow id={id} cx={w * 0.7} cy={h - 120} r={180} color={dark ? c.ink : c.accent2} strength={dark ? 0.06 : 0.1} />
      <Path d={ground} fill={c.ink} opacity={dark ? 0.08 : 0.06} />
      <Acacia x={w * 0.2} base={h - 44} size={150} color={c.ink} opacity={dark ? 0.1 : 0.08} />
      <Acacia x={w * 0.9} base={h - 50} size={84} color={c.ink} opacity={dark ? 0.08 : 0.06} />
      {/* Birds heading home. */}
      {[
        [0.14, 0.12, 1],
        [0.22, 0.1, 0.8],
        [0.19, 0.15, 0.7],
      ].map(([x, y, s], i) => (
        <Path key={i} d={`M${w * x - 9 * s} ${h * y} q ${4.5 * s} ${-5 * s} ${9 * s} 0 q ${4.5 * s} ${-5 * s} ${9 * s} 0`} fill="none" stroke={c.ink} strokeWidth={1.6} opacity={0.14} />
      ))}
      {dark && stars.map((s, i) => <Circle key={`s${i}`} cx={s.x} cy={s.y} r={s.r} fill={c.ink} opacity={0.22} />)}
    </>
  );
}

/* Diani Beach: waves, bubbles and the sun ----------------------------------- */

function wave(w: number, y: number, amp: number, len: number) {
  let d = `M0 ${y}`;
  for (let x = 0; x < w + len; x += len) d += ` q ${len / 4} ${-amp} ${len / 2} 0 t ${len / 2} 0`;
  return `${d} L${w + len} ${y + 400} L0 ${y + 400} Z`;
}

function DianiMotif({ w, h, dark, c, id }: Motif) {
  const rand = seeded(13);
  const bubbles = Array.from({ length: 9 }, () => ({ x: rand() * w, y: h * 0.55 + rand() * h * 0.3, r: 3 + rand() * 6 }));
  return (
    <>
      <Wash id={id} w={w} h={h} color={c.accent} strength={dark ? 0.12 : 0.1} reach={0.4} />
      <Glow id={id} cx={w * 0.85} cy={h * 0.07} r={w * 0.5} color={dark ? c.ink : c.accent2} strength={dark ? 0.08 : 0.2} />
      <Circle cx={w * 0.85} cy={h * 0.07} r={34} fill={dark ? c.ink : c.accent2} opacity={dark ? 0.08 : 0.16} />
      <Path d={wave(w, h - 150, 10, 120)} fill={c.accent} opacity={dark ? 0.08 : 0.06} />
      <Path d={wave(w, h - 105, 12, 150)} fill={c.accent} opacity={dark ? 0.1 : 0.08} />
      <Path d={wave(w, h - 60, 9, 100)} fill={c.accent} opacity={dark ? 0.13 : 0.1} />
      {bubbles.map((b, i) => (
        <Circle key={i} cx={b.x} cy={b.y} r={b.r} fill="none" stroke={c.accent} strokeWidth={1.4} opacity={0.14} />
      ))}
      {/* A starfish washed up in the corner. */}
      <Path
        d={Array.from({ length: 10 }, (_, i) => {
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          const r = i % 2 ? 9 : 22;
          return `${i ? 'L' : 'M'}${(w * 0.1 + r * Math.cos(a)).toFixed(1)} ${(h - 30 + r * Math.sin(a)).toFixed(1)}`;
        }).join(' ') + ' Z'}
        fill={c.accent3}
        opacity={dark ? 0.2 : 0.16}
      />
    </>
  );
}

/* Starry Night: stars, a nebula and the moon ------------------------------- */

function Sparkle({ x, y, size, color, opacity }: { x: number; y: number; size: number; color: string; opacity: number }) {
  const s = size;
  const d = `M${x} ${y - s} Q ${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q ${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q ${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q ${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z`;
  return <Path d={d} fill={color} opacity={opacity} />;
}

function StarryMotif({ w, h, dark, c, id }: Motif) {
  const rand = seeded(42);
  const stars = Array.from({ length: 70 }, () => ({ x: rand() * w, y: rand() * h, r: 0.5 + rand() * 1.4, o: 0.25 + rand() * 0.45 }));
  const sparkles = Array.from({ length: 7 }, () => ({ x: rand() * w, y: rand() * h, size: 4 + rand() * 5 }));
  const mx = w * 0.84;
  const my = h * 0.08;
  return (
    <>
      <Wash id={id} w={w} h={h} color={c.accent} strength={dark ? 0.16 : 0.1} reach={0.5} />
      <Glow id={`${id}a`} cx={w * 0.05} cy={h * 0.3} r={w * 0.7} color={c.accent3} strength={dark ? 0.1 : 0.08} />
      <Glow id={`${id}b`} cx={w * 0.95} cy={h * 0.78} r={w * 0.6} color={c.accent} strength={dark ? 0.12 : 0.08} />
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={dark ? c.ink : c.accent} opacity={s.o * (dark ? 0.8 : 0.35)} />
      ))}
      {sparkles.map((s, i) => (
        <Sparkle key={`k${i}`} {...s} color={c.accent2} opacity={dark ? 0.45 : 0.35} />
      ))}
      {/* A crescent moon. */}
      <Path d={`M${mx} ${my - 26} A 26 26 0 1 0 ${mx} ${my + 26} A 20 20 0 1 1 ${mx} ${my - 26} Z`} fill={c.accent2} opacity={dark ? 0.3 : 0.22} />
    </>
  );
}

/* Golden Hour: sunbeams, a ribbon of hearts, sparkles and leaves --------- */

function GoldenMotif({ w, h, dark, c, id, roo = false }: Motif & { roo?: boolean }) {
  const rand = seeded(1124);
  const sparkles = Array.from({ length: 9 }, () => ({ x: rand() * w, y: rand() * h * 0.9, size: 3 + rand() * 4 }));
  const leaves = (x: number, y: number, flip: number) =>
    [[0, 64, -40], [6, 54, -70], [10, 58, -15], [16, 44, 15], [4, 48, -95]].map(([d, len, ang], i) => (
      <Path key={`${x}-${i}`} d={leafPath(x + d * flip, y - d, len, flip > 0 ? ang : 180 - ang)} fill={i % 2 ? c.accent3 : mixLeaf(dark)} opacity={dark ? 0.22 : 0.16} />
    ));
  return (
    <>
      <Wash id={id} w={w} h={h} color={c.accent2} strength={dark ? 0.14 : 0.22} reach={0.55} />
      <Glow id={`${id}g`} cx={w * 0.9} cy={h * 0.06} r={w * 0.75} color={c.accent2} strength={dark ? 0.12 : 0.24} />
      <Path d={`M${w * 0.55} 0 L${w * 0.7} 0 L${w} ${h * 0.3} L${w} ${h * 0.42} Z`} fill={dark ? c.accent2 : '#FFFFFF'} opacity={dark ? 0.05 : 0.35} />
      <Path d={ribbonHeart(w * 0.82, h * 0.2, 2.2)} stroke={c.accent} strokeWidth={2} fill="none" opacity={dark ? 0.22 : 0.16} strokeLinecap="round" />
      <Path d={ribbonHeart(w * 0.12, h * 0.62, 1.4, 0.4)} stroke={c.accent2} strokeWidth={2} fill="none" opacity={dark ? 0.24 : 0.3} strokeLinecap="round" />
      {sparkles.map((s, i) => (
        <Sparkle key={i} {...s} color={c.accent2} opacity={dark ? 0.4 : 0.45} />
      ))}
      {leaves(0, h, 1)}
      {roo ? null : leaves(w, h * 0.55, -1)}
      {roo ? <RooExtras w={w} h={h} dark={dark} c={c} /> : null}
    </>
  );
}

/** Bamboo for the panda and a trail of footprints, for Roo & Panda. */
function RooExtras({ w, h, dark, c }: { w: number; h: number; dark: boolean; c: Colors }) {
  return (
    <>
      {/* Bamboo up the right edge, for the panda. */}
      {[0, 12].map((dx, k) => (
        <G key={`b${k}`} opacity={dark ? 0.2 : 0.16}>
          <Path d={`M${w - 14 - dx} ${h} L${w - 12 - dx} ${h * (0.5 + k * 0.08)}`} stroke={c.accent3} strokeWidth={5} strokeLinecap="round" />
          {Array.from({ length: 6 }, (_, i) => h - 40 - i * 52)
            .filter((y) => y > h * (0.5 + k * 0.08) + 10)
            .map((y, i) => (
              <G key={i}>
                <Path d={`M${w - 18 - dx} ${y} h8`} stroke={c.accent3} strokeWidth={2} />
                <Path d={leafPath(w - 13 - dx, y, 22, 200 + (i % 2) * 30)} fill={c.accent3} />
              </G>
            ))}
        </G>
      ))}
      {/* A kangaroo's tracks and a panda's paw prints, wandering along together. */}
      {Array.from({ length: 6 }, (_, i) => {
        const x = w * 0.18 + i * w * 0.12;
        const y = h * 0.93 - i * h * 0.045;
        return (
          <G key={`p${i}`} opacity={dark ? 0.22 : 0.18}>
            <Roo x={x} y={y - 16} color={c.accent} />
            <Paw x={x + 10} y={y + 8} color={c.ink} />
          </G>
        );
      })}
    </>
  );
}

/** A kangaroo's footprint pair: two long feet side by side. */
function Roo({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <G transform={`rotate(-18 ${x} ${y})`}>
      <Path d={`M${x - 4} ${y} q -2 -8 0 -14 q 2 6 0 14 Z M${x + 4} ${y} q -2 -8 0 -14 q 2 6 0 14 Z`} fill={color} />
    </G>
  );
}

/** A panda's paw: a round pad and five toes. */
function Paw({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={4} fill={color} />
      {[-150, -115, -90, -65, -30].map((a, i) => (
        <Circle key={i} cx={x + 6 * Math.cos((a * Math.PI) / 180)} cy={y + 6 * Math.sin((a * Math.PI) / 180)} r={1.5} fill={color} />
      ))}
    </G>
  );
}

function mixLeaf(dark: boolean) {
  return dark ? '#5E7F3C' : '#2F4A22';
}

const MOTIFS: Record<ThemeName, (m: Motif) => ReactNode> = {
  rose: RoseMotif,
  steampunk: SteampunkMotif,
  meadow: MeadowMotif,
  serengeti: SerengetiMotif,
  diani: DianiMotif,
  starry: StarryMotif,
  golden: GoldenMotif,
  roo: (m: Motif) => <GoldenMotif {...m} roo />,
};

/**
 * Put this first inside a screen's outer view. It fills the screen behind everything else
 * and never takes taps.
 */
export function ThemeBackdrop({ theme: forced }: { theme?: ThemeName }) {
  const current = useThemeName();
  const theme = forced ?? current;
  const dark = useColorScheme() === 'dark';
  const c = useColors();
  const window = useWindowDimensions();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Gradient names must be unique on the page, since several screens can be open at once.
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const w = size?.w ?? window.width;
  const h = size?.h ?? window.height;
  const Draw = MOTIFS[theme];
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0 && (Math.round(width) !== Math.round(w) || Math.round(height) !== Math.round(h))) setSize({ w: width, h: height });
      }}>
      <Svg width={w} height={h}>
        <Draw w={w} h={h} dark={dark} c={c} id={id} />
      </Svg>
    </View>
  );
}
