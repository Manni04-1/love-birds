import { createContext, useContext } from 'react';
import { Platform, useColorScheme } from 'react-native';

const rose = {
  page: '#FFF6F8',
  surface: '#FFFFFF',
  surface2: '#FBE5EC',
  ink: '#3B1425',
  muted: '#86586B',
  line: '#F0D2DC',
  accent: '#D3325F',
  accentSoft: '#FADBE4',
  onAccent: '#FFFFFF',
  accent2: '#F08A5D',
  onAccent2: '#3B1425',
  accent3: '#7B5CC4',
  onAccent3: '#FFFFFF',
  danger: '#B42318',
  onDanger: '#FFFFFF',
};

export type Colors = { [K in keyof typeof rose]: string };

export type ThemeName = 'rose' | 'steampunk' | 'meadow' | 'serengeti' | 'diani' | 'starry' | 'golden';

const PALETTES: Record<ThemeName, { light: Colors; dark: Colors }> = {
  rose: {
    light: rose,
    dark: {
      page: '#1E0E17',
      surface: '#2A1520',
      surface2: '#371E2B',
      ink: '#FBE8EF',
      muted: '#C99DB0',
      line: '#47283A',
      accent: '#FF5C8A',
      accentSoft: '#4A1D30',
      onAccent: '#2A0A16',
      accent2: '#FF9E73',
      onAccent2: '#2A0A16',
      accent3: '#B79CFF',
      onAccent3: '#2A0A16',
      danger: '#FF7A6E',
      onDanger: '#2A0A16',
    },
  },
  steampunk: {
    light: {
      page: '#F3EBDD',
      surface: '#FFFAF1',
      surface2: '#EADCC3',
      ink: '#2B1D12',
      muted: '#7A6248',
      line: '#E0CFB2',
      accent: '#9A4E2A',
      accentSoft: '#F0DCC6',
      onAccent: '#FFFFFF',
      accent2: '#C9A227',
      onAccent2: '#2B1D12',
      accent3: '#2F7F73',
      onAccent3: '#FFFFFF',
      danger: '#A4281B',
      onDanger: '#FFFFFF',
    },
    dark: {
      page: '#120C08',
      surface: '#261A11',
      surface2: '#36261A',
      ink: '#F6E8CF',
      muted: '#C6A982',
      line: '#4E3925',
      accent: '#E38D4F',
      accentSoft: '#4E2F1B',
      onAccent: '#1B120B',
      accent2: '#E3BC4E',
      onAccent2: '#1B120B',
      accent3: '#5FC0AC',
      onAccent3: '#1B120B',
      danger: '#FF8A70',
      onDanger: '#1B120B',
    },
  },
  meadow: {
    light: {
      page: '#F4F9EE',
      surface: '#FFFFFF',
      surface2: '#E3F0D9',
      ink: '#1D3320',
      muted: '#587456',
      line: '#D5E6C9',
      accent: '#357A32',
      accentSoft: '#DDEFD3',
      onAccent: '#FFFFFF',
      accent2: '#F2B33D',
      onAccent2: '#1D3320',
      accent3: '#3B7FC4',
      onAccent3: '#FFFFFF',
      danger: '#B42318',
      onDanger: '#FFFFFF',
    },
    dark: {
      page: '#0F1A10',
      surface: '#172518',
      surface2: '#203222',
      ink: '#E6F3DF',
      muted: '#9DBB97',
      line: '#2B412C',
      accent: '#79C46F',
      accentSoft: '#24402A',
      onAccent: '#0C170D',
      accent2: '#F5C45E',
      onAccent2: '#0C170D',
      accent3: '#7EB8F2',
      onAccent3: '#0C170D',
      danger: '#FF7A6E',
      onDanger: '#0C170D',
    },
  },
  serengeti: {
    light: {
      page: '#FBF3E3',
      surface: '#FFFCF6',
      surface2: '#F3E3C6',
      ink: '#3A230F',
      muted: '#86684A',
      line: '#EAD6B4',
      accent: '#B5541A',
      accentSoft: '#F7DFC4',
      onAccent: '#FFFFFF',
      accent2: '#6E7F2A',
      onAccent2: '#FFFFFF',
      accent3: '#9A4C8E',
      onAccent3: '#FFFFFF',
      danger: '#A4281B',
      onDanger: '#FFFFFF',
    },
    dark: {
      page: '#1B120A',
      surface: '#271A0F',
      surface2: '#352416',
      ink: '#F8E7CF',
      muted: '#C9A57F',
      line: '#46301D',
      accent: '#F08A3C',
      accentSoft: '#4C2C14',
      onAccent: '#1B0F05',
      accent2: '#B3C35A',
      onAccent2: '#1B0F05',
      accent3: '#D58BCB',
      onAccent3: '#1B0F05',
      danger: '#FF8A70',
      onDanger: '#1B0F05',
    },
  },
  diani: {
    light: {
      page: '#F0F9F8',
      surface: '#FFFFFF',
      surface2: '#DCF0EE',
      ink: '#0F2E33',
      muted: '#4E7479',
      line: '#CDE6E3',
      accent: '#0B7A7A',
      accentSoft: '#D3EEEC',
      onAccent: '#FFFFFF',
      accent2: '#F0B64A',
      onAccent2: '#0F2E33',
      accent3: '#D9573F',
      onAccent3: '#FFFFFF',
      danger: '#B42318',
      onDanger: '#FFFFFF',
    },
    dark: {
      page: '#08191B',
      surface: '#0F2427',
      surface2: '#163236',
      ink: '#DDF4F2',
      muted: '#8DBAB8',
      line: '#1F3F43',
      accent: '#3CC7C2',
      accentSoft: '#123F42',
      onAccent: '#041314',
      accent2: '#F5C566',
      onAccent2: '#041314',
      accent3: '#FF8E7A',
      onAccent3: '#041314',
      danger: '#FF7A6E',
      onDanger: '#041314',
    },
  },
  starry: {
    light: {
      page: '#F3F1FB',
      surface: '#FFFFFF',
      surface2: '#E4E0F5',
      ink: '#1B1840',
      muted: '#625D8C',
      line: '#DAD5F0',
      accent: '#4B3FB5',
      accentSoft: '#E0DCF7',
      onAccent: '#FFFFFF',
      accent2: '#E8B93C',
      onAccent2: '#1B1840',
      accent3: '#C2417F',
      onAccent3: '#FFFFFF',
      danger: '#B42318',
      onDanger: '#FFFFFF',
    },
    dark: {
      page: '#0B0B22',
      surface: '#141433',
      surface2: '#1D1D45',
      ink: '#ECEBFF',
      muted: '#A6A3D6',
      line: '#2A2A58',
      accent: '#9C8CFF',
      accentSoft: '#2B2660',
      onAccent: '#0B0B22',
      accent2: '#F2C94C',
      onAccent2: '#0B0B22',
      accent3: '#FF86C0',
      onAccent3: '#0B0B22',
      danger: '#FF7A6E',
      onDanger: '#0B0B22',
    },
  },
  golden: {
    light: {
      page: '#FFF5E8',
      surface: '#FFFBF4',
      surface2: '#FBE4C2',
      ink: '#2E1A0E',
      muted: '#87603D',
      line: '#F1D8B5',
      accent: '#B4530F',
      accentSoft: '#FCE1C2',
      onAccent: '#FFFFFF',
      accent2: '#E8A33A',
      onAccent2: '#2E1A0E',
      accent3: '#4E6B32',
      onAccent3: '#FFFFFF',
      danger: '#A4281B',
      onDanger: '#FFFFFF',
    },
    dark: {
      page: '#160D07',
      surface: '#22150C',
      surface2: '#301E11',
      ink: '#FCEAD2',
      muted: '#D2A57A',
      line: '#432C19',
      accent: '#FFA54A',
      accentSoft: '#4A2B12',
      onAccent: '#160D07',
      accent2: '#FFD27A',
      onAccent2: '#160D07',
      accent3: '#A3C77E',
      onAccent3: '#160D07',
      danger: '#FF8A70',
      onDanger: '#160D07',
    },
  },
};

/** The themes you can pick in Settings. Each has a light and a dark look that follows the phone. */
export const THEMES: { name: ThemeName; label: string; emoji: string; blurb: string }[] = [
  { name: 'rose', label: 'Rose', emoji: '🌹', blurb: 'Soft pinks and floating hearts' },
  { name: 'steampunk', label: 'Steampunk', emoji: '⚙️', blurb: 'Brass, copper and turning gears' },
  { name: 'meadow', label: 'Meadow', emoji: '🌼', blurb: 'Green hills and wildflowers' },
  { name: 'serengeti', label: 'Serengeti', emoji: '🦒', blurb: 'Golden plains at sunset' },
  { name: 'diani', label: 'Diani Beach', emoji: '🏝️', blurb: 'Turquoise water and white sand' },
  { name: 'starry', label: 'Starry Night', emoji: '🌙', blurb: 'Deep blue skies and twinkling stars' },
  { name: 'golden', label: 'Golden Hour', emoji: '🧡', blurb: 'Warm sunlight, night sky and a ribbon of hearts' },
];

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && value in PALETTES;
}

const ThemeContext = createContext<ThemeName>('rose');

/** Wraps the app in the signed-in person's theme. */
export const ThemeNameProvider = ThemeContext.Provider;

export function useThemeName(): ThemeName {
  return useContext(ThemeContext);
}

export function paletteFor(name: ThemeName, dark: boolean): Colors {
  return PALETTES[name][dark ? 'dark' : 'light'];
}

export function useColors(): Colors {
  const name = useContext(ThemeContext);
  return paletteFor(name, useColorScheme() === 'dark');
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 12, md: 16, lg: 20, xl: 26, pill: 999 } as const;

/**
 * Room to leave at the bottom of tab screens so content clears the tab bar.
 * On iPhone the tab bar floats over the screen. On Android the screen already ends above it, so it needs none.
 */
export const tabBarInset = Platform.select({ ios: 50, default: 0 }) ?? 0;

/* Colour helpers --------------------------------------------------------- */

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (x) => x + x) : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A theme colour you can see through: alpha('#D3325F', 0.2) is 'rgba(211,50,95,0.2)'. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** A colour part way between two others: t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const out = x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0'));
  return `#${out.join('')}`;
}

/* Fonts ------------------------------------------------------------------ */

let customFonts = false;

/** Called once the app's fonts have loaded. Until then (or if they fail) text uses the phone's font. */
export function setCustomFonts(on: boolean) {
  customFonts = on;
}

/** The fonts you can pick in Settings. Each of you picks your own. */
export type FontName = 'classic' | 'playful' | 'handwritten';

export const FONTS: { name: FontName; label: string; blurb: string }[] = [
  { name: 'classic', label: 'Classic', blurb: 'Clean and easy to read' },
  { name: 'playful', label: 'Playful', blurb: 'Round and bubbly' },
  { name: 'handwritten', label: 'Handwritten', blurb: 'Headings like a love note' },
];

export function isFontName(value: unknown): value is FontName {
  return value === 'classic' || value === 'playful' || value === 'handwritten';
}

const FontContext = createContext<FontName>('classic');

/** Wraps the app in the signed-in person's font. */
export const FontNameProvider = FontContext.Provider;

export function useFontName(): FontName {
  return useContext(FontContext);
}

/**
 * The font for a weight. Classic is Bricolage Grotesque for headings and Nunito Sans for
 * everything else; Playful is Fredoka throughout; Handwritten puts headings in Kalam.
 * Returns the family plus a plain weight, because Android can't combine a custom family with fontWeight.
 */
export function fontFor(weight: string | number | undefined, display = false, font: FontName = 'classic'): { fontFamily?: string; fontWeight?: 'normal' } {
  if (!customFonts) return {};
  const w = Number(weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : weight) || 400;
  if (font === 'playful') {
    const family = display || w >= 800 ? 'Fredoka_700Bold' : w >= 700 ? 'Fredoka_600SemiBold' : w >= 600 ? 'Fredoka_500Medium' : 'Fredoka_400Regular';
    return { fontFamily: family, fontWeight: 'normal' };
  }
  if (display) {
    if (font === 'handwritten') return { fontFamily: 'Kalam_700Bold', fontWeight: 'normal' };
    return { fontFamily: w >= 800 ? 'BricolageGrotesque_800ExtraBold' : 'BricolageGrotesque_700Bold', fontWeight: 'normal' };
  }
  const family = w >= 800 ? 'NunitoSans_800ExtraBold' : w >= 700 ? 'NunitoSans_700Bold' : w >= 600 ? 'NunitoSans_600SemiBold' : 'NunitoSans_400Regular';
  return { fontFamily: family, fontWeight: 'normal' };
}
