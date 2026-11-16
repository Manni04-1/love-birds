import { Platform, useColorScheme } from 'react-native';

const light = {
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
  danger: '#B42318',
  onDanger: '#FFFFFF',
};

export type Colors = { [K in keyof typeof light]: string };

const dark: Colors = {
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
  danger: '#FF7A6E',
  onDanger: '#2A0A16',
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 12, md: 16, lg: 20, xl: 26, pill: 999 } as const;

/** Room to leave at the bottom of tab screens so content clears the tab bar. */
export const tabBarInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
