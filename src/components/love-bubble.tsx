import { useId, useState, type ReactNode } from 'react';
import { useColorScheme, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';

import type { BubbleStyle } from '@/lib/types';

/**
 * The chat bubble looks:
 * - hearts: a fuchsia bubble with little hearts
 * - roses: a soft bubble wrapped in thorny vines, with roses on two corners
 * - stars: a night-sky bubble with stars, a crescent moon and a gold dotted edge
 * - waves: a sea-blue bubble with foam along the bottom, a starfish and a shell
 * - letter: a love letter on parchment, with stitching and a red wax seal
 * - clouds: a fluffy cloud with a little rainbow
 * - daisies: a bubble wrapped in a daisy chain
 * - bamboo: a bamboo cane along the top, with a panda peeking over the corner
 */

const RADIUS = 20;
const TAIL = 6;

/** Colours for text and links inside each look. */
export function bubbleInk(look: BubbleStyle, dark: boolean) {
  switch (look) {
    case 'hearts':
    case 'stars':
    case 'waves':
      return { text: '#FFFFFF', fine: 'rgba(255,255,255,0.8)' };
    case 'letter':
      return dark ? { text: '#F6E6C8', fine: '#CDB38C' } : { text: '#4A2C14', fine: '#8A6A48' };
    case 'clouds':
      return dark ? { text: '#EAF2FF', fine: '#A9B9D6' } : { text: '#1F3557', fine: '#5B7194' };
    case 'daisies':
      return dark ? { text: '#F3F7E6', fine: '#BFCB9C' } : { text: '#2F3A14', fine: '#6A7A40' };
    case 'bamboo':
      return dark ? { text: '#E8F3DF', fine: '#A9C39A' } : { text: '#1F3A1A', fine: '#55704A' };
    default:
      return dark ? { text: '#FBE9EC', fine: '#D9B3BC' } : { text: '#3B1020', fine: '#86586B' };
  }
}

/** Space the decorations need around the bubble, per side. */
export function bubbleGutter(look: BubbleStyle) {
  if (look === 'bamboo') return 14;
  if (look === 'roses' || look === 'daisies' || look === 'clouds') return 12;
  return 10;
}

type Layer = { w: number; h: number; g: number; mine: boolean; dark: boolean; id: string };

/** What each look draws behind the words and on top of them. */
const LAYERS: Record<BubbleStyle, { back: (p: Layer) => ReactNode; front: (p: Layer) => ReactNode }> = {
  hearts: { back: (p) => <HeartsBack {...p} />, front: (p) => <HeartsFront {...p} /> },
  roses: { back: (p) => <RosesBack {...p} />, front: (p) => <RosesFront {...p} /> },
  stars: { back: (p) => <StarsBack {...p} />, front: (p) => <StarsFront {...p} /> },
  waves: { back: (p) => <WavesBack {...p} />, front: (p) => <WavesFront {...p} /> },
  letter: { back: (p) => <LetterBack {...p} />, front: (p) => <LetterFront {...p} /> },
  clouds: { back: (p) => <CloudsBack {...p} />, front: (p) => <CloudsFront {...p} /> },
  daisies: { back: (p) => <DaisiesBack {...p} />, front: (p) => <DaisiesFront {...p} /> },
  bamboo: { back: (p) => <BambooBack {...p} />, front: (p) => <BambooFront {...p} /> },
};

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
          {(LAYERS[look] ?? LAYERS.roses).back({ w: size.w, h: size.h, g: gutter, mine, dark, id })}
        </Svg>
      )}
      <View style={[corners, { overflow: 'hidden', minWidth: 44 }]}>{children}</View>
      {size && (
        <Svg width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          {(LAYERS[look] ?? LAYERS.roses).front({ w: size.w, h: size.h, g: gutter, mine, dark, id })}
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

function HeartsBack({ w, h, g, mine, id }: Layer) {
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

function HeartsFront({ w, g, mine }: Layer) {
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

function RosesBack({ w, h, g, mine, dark }: Layer) {
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

function RosesFront({ w, h, g, mine, dark }: Layer) {
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

// ---------------------------------------------------------------------------
// Shared bits for the newer looks
// ---------------------------------------------------------------------------

/** The same "random" numbers for a bubble of a given size, so it doesn't shimmer as it re-draws. */
function seeded(seed: number) {
  let t = Math.floor(seed) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function Clipped({ id, shape, children }: { id: string; shape: string; children: ReactNode }) {
  return (
    <>
      <Defs>
        <ClipPath id={`clip${id}`}>
          <Path d={shape} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#clip${id})`}>{children}</G>
    </>
  );
}

function sparkle(cx: number, cy: number, s: number) {
  const q = s * 0.22;
  return `M${cx},${cy - s} Q${cx + q},${cy - q} ${cx + s},${cy} Q${cx + q},${cy + q} ${cx},${cy + s} Q${cx - q},${cy + q} ${cx - s},${cy} Q${cx - q},${cy - q} ${cx},${cy - s} Z`;
}

// ---------------------------------------------------------------------------
// Stars: a night sky with a crescent moon
// ---------------------------------------------------------------------------

function StarsBack({ w, h, g, mine, id }: Layer) {
  const bw = w - g * 2;
  const bh = h - g * 2;
  const shape = bubblePath(g, g, bw, bh, mine);
  const rand = seeded(bw * 7 + bh);
  const dots = Array.from({ length: Math.max(6, Math.round((bw * bh) / 260)) }, () => ({ x: g + rand() * bw, y: g + rand() * bh, r: 0.5 + rand() * 0.9, o: 0.3 + rand() * 0.6 }));
  return (
    <>
      <Defs>
        <LinearGradient id={`night${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2B2A78" />
          <Stop offset="1" stopColor="#141238" />
        </LinearGradient>
      </Defs>
      <Path d={shape} fill={`url(#night${id})`} />
      <Clipped id={id} shape={shape}>
        {dots.map((d, i) => (
          <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#FFFFFF" opacity={d.o} />
        ))}
        <Path d={sparkle(mine ? g + 14 : g + bw - 14, g + bh - 10, 4)} fill="#FFE9A6" opacity={0.7} />
      </Clipped>
    </>
  );
}

function StarsFront({ w, h, g, mine }: Layer) {
  const bw = w - g * 2;
  const bh = h - g * 2;
  // A gold dotted edge, like a string of fairy lights.
  const mx = mine ? g + 4 : w - g - 4;
  const my = g + 2;
  const flip = mine ? 1 : -1;
  return (
    <>
      <Path d={bubblePath(g - 2.5, g - 2.5, bw + 5, bh + 5, mine)} stroke="#F2C94C" strokeWidth={1.6} strokeDasharray="0.1 5" strokeLinecap="round" fill="none" />
      <G transform={`translate(${mx} ${my}) rotate(${flip * -20})`}>
        <Path d="M0,-11 A11,11 0 1,0 0,11 A8,10 0 1,1 0,-11 Z" fill="#FFE07A" stroke="#C99A1E" strokeWidth={0.8} />
      </G>
      <Path d={sparkle(mx + flip * 15, my - 3, 5)} fill="#FFF3C4" />
      <Path d={sparkle(mx + flip * 24, my + 4, 3)} fill="#FFF3C4" opacity={0.8} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Waves: the sea, with foam, a starfish and a shell
// ---------------------------------------------------------------------------

function WavesBack({ w, h, g, mine, id }: Layer) {
  const bw = w - g * 2;
  const bh = h - g * 2;
  const shape = bubblePath(g, g, bw, bh, mine);
  const crest = (y: number, amp: number, len: number, shift: number) => {
    let d = `M${g - len + shift},${y}`;
    for (let x = g - len + shift; x < g + bw + len; x += len) d += ` q${len / 4},${-amp} ${len / 2},0 t${len / 2},0`;
    return d + ` L${g + bw + len},${g + bh + 4} L${g - len},${g + bh + 4} Z`;
  };
  return (
    <>
      <Defs>
        <LinearGradient id={`sea${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1BA7B8" />
          <Stop offset="1" stopColor="#0B6E8C" />
        </LinearGradient>
      </Defs>
      <Path d={shape} fill={`url(#sea${id})`} />
      <Clipped id={id} shape={shape}>
        <Path d={crest(g + bh - 7, 4, 26, 0)} fill="#FFFFFF" opacity={0.16} />
        <Path d={crest(g + bh - 3, 3, 20, 9)} fill="#FFFFFF" opacity={0.22} />
        <Circle cx={g + bw * 0.7} cy={g + 6} r={1.6} fill="#FFFFFF" opacity={0.35} />
        <Circle cx={g + bw * 0.78} cy={g + 11} r={1} fill="#FFFFFF" opacity={0.35} />
      </Clipped>
    </>
  );
}

function star5(cx: number, cy: number, outer: number, inner: number, turn = 0) {
  return (
    Array.from({ length: 10 }, (_, i) => {
      const a = (i * Math.PI) / 5 - Math.PI / 2 + turn;
      const r = i % 2 ? inner : outer;
      return `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
    }).join(' ') + ' Z'
  );
}

function WavesFront({ w, h, g, mine }: Layer) {
  const sx = mine ? g + 3 : w - g - 3;
  const sy = g + 1;
  const shx = mine ? w - g - 2 : g + 2;
  const shy = h - g - 1;
  return (
    <>
      <Path d={star5(sx, sy, 10, 4.4, mine ? 0.3 : -0.3)} fill="#FF8C5A" stroke="#C4512A" strokeWidth={0.9} strokeLinejoin="round" />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2 + (mine ? 0.3 : -0.3);
        return <Circle key={i} cx={sx + Math.cos(a) * 5.5} cy={sy + Math.sin(a) * 5.5} r={0.8} fill="#FFE1CF" />;
      })}
      {h - g * 2 > 30 ? (
        <G transform={`translate(${shx} ${shy}) rotate(${mine ? -20 : 20})`}>
          <Path d="M-8,3 Q-9,-7 0,-9 Q9,-7 8,3 Q0,6 -8,3 Z" fill="#FFE6D6" stroke="#D99A7A" strokeWidth={0.8} />
          <Path d="M0,4 L0,-8 M0,4 L-5,-6 M0,4 L5,-6 M0,4 L-7.5,-1 M0,4 L7.5,-1" stroke="#D99A7A" strokeWidth={0.7} />
        </G>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Letter: parchment, stitching and a wax seal
// ---------------------------------------------------------------------------

function LetterBack({ w, h, g, mine, dark, id }: Layer) {
  const bw = w - g * 2;
  const bh = h - g * 2;
  const shape = bubblePath(g, g, bw, bh, mine);
  const lines: number[] = [];
  for (let y = g + 18; y < g + bh - 4; y += 18) lines.push(y);
  return (
    <>
      <Path d={shape} fill={dark ? '#3A2A1A' : '#FBF1DC'} stroke={dark ? '#5A432A' : '#E5D3AE'} strokeWidth={1} />
      <Clipped id={id} shape={shape}>
        {lines.map((y) => (
          <Path key={y} d={`M${g + 8},${y} H${g + bw - 8}`} stroke={dark ? '#5A432A' : '#E9DABA'} strokeWidth={0.8} />
        ))}
      </Clipped>
      <Path d={bubblePath(g + 4, g + 4, bw - 8, bh - 8, mine)} stroke={dark ? '#B98A57' : '#C9A578'} strokeWidth={1} strokeDasharray="4 3" fill="none" />
    </>
  );
}

function LetterFront({ w, g, mine }: Layer) {
  const cx = mine ? g + 4 : w - g - 4;
  const cy = g + 3;
  // A wax seal: a wobbly red disc with a heart pressed in, and a ribbon tail.
  const blob = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const r = 10 + (i % 2 ? 1.1 : -0.6);
    return `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
  return (
    <>
      <Path d={`M${cx - 3},${cy + 6} L${cx - 7},${cy + 17} L${cx - 3},${cy + 14} L${cx},${cy + 18} Z`} fill="#9E1B2F" />
      <Path d={`M${cx + 2},${cy + 6} L${cx + 6},${cy + 17} L${cx + 8},${cy + 13} L${cx + 11},${cy + 15} Z`} fill="#B3243A" />
      <Path d={blob + ' Z'} fill="#C62839" stroke="#8E1424" strokeWidth={0.8} />
      <Circle cx={cx} cy={cy} r={7} fill="none" stroke="#E0525F" strokeWidth={0.8} opacity={0.8} />
      <Path d={heartPath(cx, cy + 0.5, 8)} fill="#8E1424" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Clouds: a fluffy cloud with a rainbow
// ---------------------------------------------------------------------------

function CloudsBack({ w, h, g, mine, dark }: Layer) {
  const bw = w - g * 2;
  const bh = h - g * 2;
  const r = Math.min(RADIUS, bh / 2, bw / 2);
  const { pts } = perimeter(g, g, bw, bh, r, 14);
  const fill = dark ? '#33415E' : '#FFFFFF';
  const line = dark ? '#4A5A7D' : '#D6E4F5';
  return (
    <>
      {/* Puffs all round the edge, then the body over their inner halves. */}
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x + p.nx * 1.5} cy={p.y + p.ny * 1.5} r={7 + (i % 3) * 1.2} fill={fill} stroke={line} strokeWidth={1} />
      ))}
      <Path d={bubblePath(g, g, bw, bh, mine)} fill={fill} />
    </>
  );
}

function CloudsFront({ w, h, g, mine, dark }: Layer) {
  const cx = mine ? g + 8 : w - g - 8;
  const cy = g + 4;
  const colors = ['#FF6B6B', '#FFB347', '#FFE066', '#7BD389', '#6CB4F5', '#B28DFF'];
  return (
    <>
      {colors.map((col, i) => (
        <Path key={i} d={`M${cx - 13 + i * 1.6},${cy} A${13 - i * 1.6},${13 - i * 1.6} 0 0 1 ${cx + 13 - i * 1.6},${cy}`} stroke={col} strokeWidth={1.7} fill="none" opacity={dark ? 0.85 : 1} />
      ))}
      <Circle cx={cx - 12} cy={cy + 1} r={4} fill={dark ? '#5A6A8E' : '#FFFFFF'} stroke={dark ? '#6E7FA5' : '#D6E4F5'} strokeWidth={0.8} />
      <Circle cx={cx + 12} cy={cy + 1} r={4} fill={dark ? '#5A6A8E' : '#FFFFFF'} stroke={dark ? '#6E7FA5' : '#D6E4F5'} strokeWidth={0.8} />
      {h - g * 2 > 30 ? <Path d={heartPath(mine ? w - g - 6 : g + 6, h - g + 4, 7)} fill="#7FB3F0" opacity={0.85} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Daisies: a daisy chain all the way round
// ---------------------------------------------------------------------------

function DaisiesBack({ w, h, g, mine, dark }: Layer) {
  return <Path d={bubblePath(g, g, w - g * 2, h - g * 2, mine)} fill={dark ? '#2C3519' : '#F8FBE9'} stroke={dark ? '#45522A' : '#E2EBC2'} strokeWidth={1} />;
}

function Daisy({ x, y, r, turn }: { x: number; y: number; r: number; turn: number }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${turn})`}>
      {Array.from({ length: 8 }, (_, i) => (
        <Ellipse key={i} cx={0} cy={-r * 0.62} rx={r * 0.26} ry={r * 0.5} fill="#FFFFFF" stroke="#D8D8C8" strokeWidth={0.5} transform={`rotate(${i * 45})`} />
      ))}
      <Circle r={r * 0.34} fill="#F7C531" stroke="#D99A12" strokeWidth={0.6} />
    </G>
  );
}

function DaisiesFront({ w, h, g, mine, dark }: Layer) {
  const bw = w - g * 2;
  const bh = h - g * 2;
  const r = Math.min(RADIUS, bh / 2, bw / 2);
  const { pts, total } = perimeter(g, g, bw, bh, r, 2);
  const count = Math.max(6, Math.round(total / 30));
  const stem = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
  const flowers = Array.from({ length: count }, (_, i) => pts[Math.min(pts.length - 1, Math.round(((i / count) * total) / 2))]);
  return (
    <>
      <Path d={stem} stroke={dark ? '#7FA65A' : '#5F8F3A'} strokeWidth={1.4} fill="none" />
      {flowers.map((p, i) =>
        i % 2 ? (
          <Ellipse key={`l${i}`} cx={p.x + p.nx * 2} cy={p.y + p.ny * 2} rx={4} ry={1.8} fill={dark ? '#86B062' : '#6FA34A'} transform={`rotate(${((Math.atan2(p.nx, -p.ny) * 180) / Math.PI + 30).toFixed(0)} ${(p.x + p.nx * 2).toFixed(1)} ${(p.y + p.ny * 2).toFixed(1)})`} />
        ) : (
          <Daisy key={`d${i}`} x={p.x} y={p.y} r={i % 4 ? 5.5 : 7} turn={i * 17} />
        ),
      )}
      <Daisy x={mine ? w - g - 2 : g + 2} y={g + 1} r={9.5} turn={10} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Bamboo: a cane along the top and a panda peeking over the corner
// ---------------------------------------------------------------------------

function BambooBack({ w, h, g, mine, dark }: Layer) {
  return <Path d={bubblePath(g, g, w - g * 2, h - g * 2, mine)} fill={dark ? '#1E3320' : '#F1F8EA'} stroke={dark ? '#355737' : '#CFE3C0'} strokeWidth={1} />;
}

function BambooFront({ w, h, g, mine, dark }: Layer) {
  const bw = w - g * 2;
  const y = g + 1;
  const x0 = g - 4;
  const x1 = g + bw + 4;
  const cane = dark ? '#7FA65A' : '#7DAA4A';
  const node = dark ? '#4E7135' : '#4F7A2C';
  const leaf = dark ? '#6E9A4E' : '#5E9A3A';
  const nodes: number[] = [];
  for (let x = x0 + 22; x < x1 - 8; x += 30) nodes.push(x);
  // The panda peeks over the top corner on the speaker's side.
  const px = mine ? w - g - 10 : g + 10;
  const py = y - 4;
  return (
    <>
      <Path d={`M${x0},${y} H${x1}`} stroke={cane} strokeWidth={5} strokeLinecap="round" />
      <Path d={`M${x0 + 2},${y - 1.2} H${x1 - 2}`} stroke="#FFFFFF" strokeWidth={1} opacity={0.35} strokeLinecap="round" />
      {nodes.map((x, i) => (
        <G key={i}>
          <Path d={`M${x},${y - 3} V${y + 3}`} stroke={node} strokeWidth={1.6} strokeLinecap="round" />
          {i % 2 === 0 ? (
            <Ellipse cx={x + 6} cy={y + 5} rx={7} ry={2.2} fill={leaf} transform={`rotate(28 ${x + 6} ${y + 5})`} />
          ) : (
            <Ellipse cx={x - 5} cy={y - 5} rx={6} ry={2} fill={leaf} transform={`rotate(-25 ${x - 5} ${y - 5})`} />
          )}
        </G>
      ))}
      {/* Little bamboo up the tail-side edge. */}
      <Path d={`M${mine ? g - 1 : w - g + 1},${y + 6} V${h - g - 6}`} stroke={cane} strokeWidth={3} strokeLinecap="round" opacity={0.9} />
      <G transform={`translate(${px} ${py})`}>
        <Circle cx={-7} cy={-7} r={4} fill="#211C1A" />
        <Circle cx={7} cy={-7} r={4} fill="#211C1A" />
        <Path d="M-11,4 A11,10 0 0 1 11,4 Z" fill="#FFFFFF" stroke="#211C1A" strokeWidth={0.6} />
        <Ellipse cx={-4.2} cy={-1} rx={2.6} ry={3.4} fill="#211C1A" transform="rotate(20 -4.2 -1)" />
        <Ellipse cx={4.2} cy={-1} rx={2.6} ry={3.4} fill="#211C1A" transform="rotate(-20 4.2 -1)" />
        <Circle cx={-3.8} cy={-1.4} r={0.9} fill="#FFFFFF" />
        <Circle cx={4.6} cy={-1.4} r={0.9} fill="#FFFFFF" />
        <Ellipse cx={0} cy={2.4} rx={1.4} ry={1} fill="#211C1A" />
        {/* Paws gripping the cane. */}
        <Ellipse cx={-8} cy={4.5} rx={3.2} ry={2.4} fill="#211C1A" />
        <Ellipse cx={8} cy={4.5} rx={3.2} ry={2.4} fill="#211C1A" />
      </G>
    </>
  );
}
