import * as React from 'react';

import { colors as lightColors } from '@/src/theme/colors';

export type ColorPalette = { [K in keyof typeof lightColors]: string };

export type ThemeName = 'light' | 'dark';

export const darkColors: ColorPalette = {
  accent: '#F3DA3E',
  accentGlow: 'rgba(243, 218, 62, 0.22)',
  accentLineToday: '#6AAE6D',
  accentLineWeekend: '#5A8E5C',
  accentLineWeekday: '#3D6B3F',
  accentLinePastBorder: '#4A7D4C',
  accentSoft: '#2D2500',
  background: '#0F1A12',
  backgroundDeep: '#0A130D',
  backgroundGlow: 'rgba(80, 140, 60, 0.16)',
  border: '#2A3A2C',
  borderSoft: '#1E2D20',
  buttonText: '#1E3A1A',
  error: '#E06060',
  heroBottom: '#1A3B24',
  heroEyebrow: '#8FC46E',
  heroText: '#E8F0E4',
  heroTextMuted: 'rgba(232, 240, 228, 0.72)',
  heroTop: '#244D32',
  overlay: 'rgba(0, 0, 0, 0.55)',
  primary: '#5EA858',
  primaryDeep: '#A8D49A',
  secondaryGlow: 'rgba(80, 160, 70, 0.18)',
  surface: '#162019',
  surfaceMuted: '#1C2A1F',
  surfaceOverlay: 'rgba(22, 32, 25, 0.88)',
  tabActive: '#7EC47A',
  tabBackground: '#111C14',
  tabInactive: '#6B7E6D',
  textMuted: '#7A8E7C',
  textPrimary: '#DDE8DA',
  textSecondary: '#9BAE9D',
} as const;

type ThemeContextValue = {
  colors: ColorPalette;
  isDark: boolean;
  themeName: ThemeName;
};

const ThemeContext = React.createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
  themeName: 'light',
});

export function ThemeProvider({
  children,
  themeName,
}: {
  children: React.ReactNode;
  themeName: ThemeName;
}) {
  const value = React.useMemo<ThemeContextValue>(
    () => ({
      colors: themeName === 'dark' ? darkColors : lightColors,
      isDark: themeName === 'dark',
      themeName,
    }),
    [themeName],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return React.useContext(ThemeContext);
}

export function useColors() {
  return React.useContext(ThemeContext).colors;
}
