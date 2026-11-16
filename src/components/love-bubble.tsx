import { useId, useState, type ReactNode } from 'react';
import { useColorScheme, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';

import type { BubbleStyle } from '@/lib/types';

/**
 * The two chat bubble looks:
 * - hearts: a fuchsia bubble with little hearts
 * - roses: a soft bubble wrapped in thorny vines, with roses on two corners
 */

const RADIUS = 20;
const TAIL = 6;

/** Colours for text and links inside each look. */
export function bubbleInk(look: BubbleStyle, dark: boolean) {
  if (look === 'hearts') return { text: '#FFFFFF', fine: 'rgba(255,255,255,0.8)' };
  return dark ? { text: '#FBE9EC', fine: '#D9B3BC' } : { text: '#3B1020', fine: '#86586B' };
}

/** Space the decorations need around the bubble, per side. */
export function bubbleGutter(look: BubbleStyle) {
  return look === 'roses' ? 12 : 9;
}

type Props = {
  look: BubbleStyle;
  /** Which side the bubble sits on. The tail and the decorations mirror to match. */
  mine: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function LoveBubble({ look, mine, children, style }: Props) {
  const dark = useColorScheme() === 'dark';
  // SVG ids must be unique on the page (web shares one document).
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const gutter = bubbleGutter(look);

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) > 0.5 || Math.abs(size.h - height) > 0.5) setSize({ w: width, h: height });
  }

  const corners = {
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    borderBottomLeftRadius: mine ? RADIUS : TAIL,
    borderBottomRightRadius: mine ? TAIL : RADIUS,
  };

  return (
    <View style={[{ padding: gutter }, style]} onLayout={onLayout}>
      {size && (
        <Svg width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          {look === 'hearts' ? (
            <HeartsBack w={size.w} h={size.h} g={gutter} mine={mine} id={id} />
          ) : (
            <RosesBack w={size.w} h={size.h} g={gutter} mine={mine} dark={dark} />
          )}
        </Svg>
      )}
      <View style={[corners, { overflow: 'hidden', minWidth: 44 }]}>{children}</View>
      {size && (
        <Svg width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          {look === 'hearts' ? (
            <HeartsFront w={size.w} h={size.h} g={gutter} mine={mine} />
          ) : (
            <RosesFront w={size.w} h={size.h} g={gutter} mine={mine} dark={dark} />
          )}
        </Svg>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** Rounded rectangle with a small "tail" corner at the bottom, on the speaker's side. */
function bubblePath(x: number, y: number, w: number, h: number, mine: boolean) {
  const r = Math.min(RADIUS, h / 2, w / 2);
  const bl = mine ? r : TAIL;
  const br = mine ? TAIL : r;
  return [
    `M${x + r},${y}`,
    `H${x + w - r}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `V${y + h - br}`,
    `Q${x + w},${y + h} ${x + w - br},${y + h}`,
    `H${x + bl}`,
    `Q${x},${y + h} ${x},${y + h - bl}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    'Z',
  ].join(' ');
}

/** A heart centred on (cx, cy), `s` wide. */
function heartPath(cx: number, cy: number, s: number) {
  const k = s / 2;
  return [
    `M${cx},${cy + k * 0.9}`,
    `C${cx - k * 1.25},${cy + k * 0.05} ${cx - k * 1.05},${cy - k * 1.05} ${cx},${cy - k * 0.45}`,
    `C${cx + k * 1.05},${cy - k * 1.05} ${cx + k * 1.25},${cy + k * 0.05} ${cx},${cy + k * 0.9}`,
    'Z',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Hearts: fuchsia with little hearts
// ---------------------------------------------------------------------------

function HeartsBack({ w, h, g, mine, id }: { w: number; h: number; g: number; mine: boolean; id: string }) {
  const bw = w - g * 2;
  const bh = h - g * 2;
  const shape = bubblePath(g, g, bw, bh, mine);
  // Big, faint hearts peeking in from the two corners on the tail side.
  const edge = mine ? g + bw : g;
  const inward = mine ? -1 : 1;
  return (
    <>
      <Defs>
        <LinearGradient id={`fuchsia${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F2399D" />
          <Stop offset="1" stopColor="#C70F72" />
        </LinearGradient>
        <ClipPath id={`clip${id}`}>
          <Path d={shape} />
        </ClipPath>
      </Defs>
      <Path d={shape} fill={`url(#fuchsia${id})`} />
      <G clipPath={`url(#clip${id})`}>
        <Path d={heartPath(0, 0, 40)} fill="#FFFFFF" opacity={0.16} transform={`translate(${edge + inward * 8} ${g + bh + 4}) rotate(${inward * -18})`} />
        <Path d={heartPath(0, 0, 22)} fill="#FFFFFF" opacity={0.14} transform={`translate(${edge + inward * 3} ${g + 6}) rotate(${inward * 20})`} />
      </G>
    </>
  );
}

function HeartsFront({ w, g, mine }: { w: number; h: number; g: number; mine: boolean }) {
  // A little cluster of hearts perched on the top corner, away from the tail.
  const cx = mine ? g + 3 : w - g - 3;
  const cy = g + 2;
  const side = mine ? 1 : -1;
  return (
    <>
      <G transform={`translate(${cx} ${cy}) rotate(${side * -14})`}>
        <Path d={heartPath(0, 0, 20)} fill="#FF7DBE" stroke="#FFFFFF" strokeWidth={1.6} />
        <Path d={heartPath(-2.5, -2.5, 6)} fill="#FFFFFF" opacity={0.75} />
      </G>
      <G transform={`translate(${cx + side * 16} ${cy - 4}) rotate(${side * 16})`}>
        <Path d={heartPath(0, 0, 11)} fill="#FFB3DA" stroke="#FFFFFF" strokeWidth={1.2} />
      </G>
    </>
  );
}

// ---------------------------------------------------------------------------
// Roses: thorny vines and roses
// ---------------------------------------------------------------------------

/** Points along a rounded rectangle's edge, with the outward direction at each. */
function perimeter(x: number, y: number, w: number, h: number, r: number, step: number) {
  const pts: { x: number; y: number; nx: number; ny: number; s: number }[] = [];
  const straightW = Math.max(0, w - 2 * r);
  const straightH = Math.max(0, h - 2 * r);
  const arc = (Math.PI / 2) * r;
  const segments = [
    { len: straightW, at: (t: number) => ({ x: x + r + t, y, nx: 0, ny: -1 }) },
    { len: arc, at: (t: number) => corner(x + w - r, y + r, -Math.PI / 2 + t / r) },
    { len: straightH, at: (t: number) => ({ x: x + w, y: y + r + t, nx: 1, ny: 0 }) },
    { len: arc, at: (t: number) => corner(x + w - r, y + h - r, t / r) },
    { len: straightW, at: (t: number) => ({ x: x + w - r - t, y: y + h, nx: 0, ny: 1 }) },
    { len: arc, at: (t: number) => corner(x + r, y + h - r, Math.PI / 2 + t / r) },
    { len: straightH, at: (t: number) => ({ x, y: y + h - r - t, nx: -1, ny: 0 }) },
    { len: arc, at: (t: number) => corner(x + r, y + r, Math.PI + t / r) },
  ];
  function corner(cx: number, cy: number, a: number) {
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  }
  const total = segments.reduce((sum, seg) => sum + seg.len, 0);
  for (let s = 0; s <= total; s += step) {
    let rest = s;
    for (const seg of segments) {
      if (rest <= seg.len || seg === segments[segments.length - 1]) {
        pts.push({ ...seg.at(Math.min(rest, seg.len)), s });
        break;
      }
      rest -= seg.len;
    }
  }
  return { pts, total };
}

function RosesBack({ w, h, g, mine, dark }: { w: number; h: number; g: number; mine: boolean; dark: boolean }) {
  const bw = w - g * 2;
  const bh = h - g * 2;
  return (
    <Path
      d={bubblePath(g, g, bw, bh, mine)}
      fill={dark ? '#2E141C' : '#FFFFFF'}
      stroke={dark ? '#4A2630' : '#F6DDE3'}
      strokeWidth={1}
    />
  );
}

function RosesFront({ w, h, g, mine, dark }: { w: number; h: number; g: number; mine: boolean; dark: boolean }) {
  const vineA = dark ? '#6FAE6B' : '#2E5E33';
  const vineB = dark ? '#8CC587' : '#4E8B4F';
  const thorn = dark ? '#5E9A5B' : '#24492A';
  const leaf = dark ? '#86C27F' : '#5D9E5A';
  const bw = w - g * 2;
  const bh = h - g * 2;
  const r = Math.min(RADIUS, bh / 2, bw / 2);
  const { pts, total } = perimeter(g, g, bw, bh, r, 2);
  // Whole number of waves so the vine joins up neatly.
  const waves = Math.max(4, Math.round(total / 30));
  const k = (Math.PI * 2 * waves) / total;

  const vine = (phase: number, amp: number, lift: number) =>
    pts
      .map((p, i) => {
        const off = lift + amp * Math.sin(p.s * k + phase);
        return `${i ? 'L' : 'M'}${(p.x + p.nx * off).toFixed(1)},${(p.y + p.ny * off).toFixed(1)}`;
      })
      .join(' ') + ' Z';

  // Thorns at each outward crest of the main vine, pointing away from the bubble.
  const thorns: string[] = [];
  const leaves: { x: number; y: number; a: number }[] = [];
  for (let i = 0; i < waves * 2; i++) {
    const s = ((i + 0.25) / waves / 2) * total * 1;
    const p = pts[Math.min(pts.length - 1, Math.round(s / 2))];
    const outward = i % 2 === 0;
    const off = 1 + (outward ? 3 : -3);
    const bx = p.x + p.nx * off;
    const by = p.y + p.ny * off;
    const dir = outward ? 1 : -1;
    const tx = -p.ny;
    const ty = p.nx;
    if (outward || i % 4 === 1) {
      thorns.push(
        `M${(bx - tx * 2).toFixed(1)},${(by - ty * 2).toFixed(1)} L${(bx + p.nx * 5 * dir + tx * 1.2).toFixed(1)},${(by + p.ny * 5 * dir + ty * 1.2).toFixed(1)} L${(bx + tx * 2).toFixed(1)},${(by + ty * 2).toFixed(1)} Z`,
      );
    }
    if (i % 3 === 2) leaves.push({ x: bx + p.nx * 2, y: by + p.ny * 2, a: (Math.atan2(ty, tx) * 180) / Math.PI + 35 });
  }

  // Roses sit on the top corner by the speaker's side and the opposite bottom corner.
  const top = { x: mine ? w - g - 2 : g + 2, y: g + 2 };
  const bottom = { x: mine ? g + 4 : w - g - 4, y: h - g - 2 };

  return (
    <>
      <Path d={vine(Math.PI, 2.2, 1)} stroke={vineB} strokeWidth={1.3} fill="none" opacity={0.85} />
      <Path d={vine(0, 3, 1)} stroke={vineA} strokeWidth={1.9} fill="none" />
      <Path d={thorns.join(' ')} fill={thorn} />
      {leaves.map((l, i) => (
        <Ellipse key={i} cx={l.x} cy={l.y} rx={4.2} ry={1.9} fill={leaf} transform={`rotate(${l.a.toFixed(0)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})`} />
      ))}
      <Rose x={top.x} y={top.y} size={22} turn={mine ? 20 : -20} />
      {bh > 34 && <Rose x={bottom.x} y={bottom.y} size={17} turn={mine ? -35 : 35} />}
    </>
  );
}

function Rose({ x, y, size, turn }: { x: number; y: number; size: number; turn: number }) {
  const s = size / 2;
  const petal = (a: number, d: number, rr: number, fill: string) => (
    <Circle cx={Math.cos(a) * d} cy={Math.sin(a) * d} r={rr} fill={fill} stroke="#7E0B26" strokeWidth={0.7} />
  );
  return (
    <G transform={`translate(${x} ${y}) rotate(${turn})`}>
      <Ellipse cx={-s * 0.95} cy={s * 0.55} rx={s * 0.62} ry={s * 0.26} fill="#3F7F45" transform={`rotate(-30 ${-s * 0.95} ${s * 0.55})`} />
      <Ellipse cx={s * 0.95} cy={s * 0.6} rx={s * 0.6} ry={s * 0.25} fill="#4E8B4F" transform={`rotate(35 ${s * 0.95} ${s * 0.6})`} />
      {[0, 1, 2, 3, 4].map((i) => (
        <G key={i}>{petal((i / 5) * Math.PI * 2 - Math.PI / 2, s * 0.42, s * 0.5, '#C8183F')}</G>
      ))}
      <Circle r={s * 0.55} fill="#DB2B4F" stroke="#7E0B26" strokeWidth={0.7} />
      <Path
        d={`M${s * 0.05},${-s * 0.05} a${s * 0.12},${s * 0.12} 0 1 1 ${s * 0.18},${s * 0.12} a${s * 0.28},${s * 0.28} 0 1 1 ${-s * 0.5},${-s * 0.18} a${s * 0.42},${s * 0.42} 0 0 1 ${s * 0.7},${-s * 0.12}`}
        stroke="#7E0B26"
        strokeWidth={0.9}
        fill="none"
        strokeLinecap="round"
      />
    </G>
  );
}
