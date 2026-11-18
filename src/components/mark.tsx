import Svg, { Circle, G, Path } from 'react-native-svg';

export type BirdColors = { body: string; wing: string; eye: string; beak: string };

export const WHITE: BirdColors = { body: '#FFFFFF', wing: '#FFC2D4', eye: '#B3164F', beak: '#FF8A3D' };
export const GOLD: BirdColors = { body: '#FFD27A', wing: '#F2A93B', eye: '#7A1238', beak: '#FF8A3D' };

/** One of the two birds, facing right. flip turns it to face left. */
export function Bird({ c, flip }: { c: BirdColors; flip?: boolean }) {
  return (
    <G transform={flip ? 'translate(100 0) scale(-1 1)' : undefined}>
      <Path d="M50 87 C42 92 35 95 27 95.5 C34 92 40 88 45 83 Z" fill={c.wing} />
      <Path
        d="M50 87 C24 71 8 55 8 37 C8 21 19 11 32 10 C38 9.6 43 11 46 14 L44 27 C31 28 24.5 33.5 25 42 C25.5 56 36 70 50 87 Z"
        fill={c.body}
      />
      <Circle cx={39.5} cy={20} r={10.2} fill={c.body} />
      <Path d="M13.5 35 C12.5 48 20 60 33 69 C27.5 59.5 24.5 50 24.6 40.5 C21.5 36.5 17.5 34.5 13.5 35 Z" fill={c.wing} />
      <Path d="M47.6 15.6 L51.8 19.9 L47.6 24 Z" fill={c.beak} />
      <Circle cx={42} cy={17.6} r={1.9} fill={c.eye} />
    </G>
  );
}

/** The Love Birds mark, the same as the app icon: two birds whose bodies make a heart. */
export function LoveBirdsMark({ size = 120, tint }: { size?: number; tint?: string }) {
  const a = tint ? { body: tint, wing: tint, eye: 'transparent', beak: tint } : WHITE;
  const b = tint ? a : GOLD;
  return (
    <Svg width={size} height={size} viewBox="0 -4 100 104" accessibilityElementsHidden importantForAccessibility="no">
      <Bird c={a} />
      <Bird c={b} flip />
      <G transform="translate(45.5 -3) scale(0.38)">
        <Path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill={tint ?? '#FFFFFF'}
        />
      </G>
    </Svg>
  );
}
