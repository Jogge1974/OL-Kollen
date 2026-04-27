import * as React from 'react';

import { colors as lightColors } from '@/src/theme/colors';

export type ColorPalette = { [K in keyof typeof lightColors]: string };

export type ThemeName = 'light' | 'dark' | 'soft' | 'soft-dark';

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

export const softColors: ColorPalette = {
  accent: '#FFDD00',
  accentGlow: 'rgba(255, 221, 0, 0.42)',
  accentLineToday: '#0F347C',
  accentLineWeekend: '#69BFEB',
  accentLineWeekday: '#B4DAEF',
  accentLinePastBorder: '#0F347C',
  accentSoft: '#FFF8DC',
  background: '#F0F6FC',
  backgroundDeep: '#E8F4FC',
  backgroundGlow: 'rgba(105, 191, 235, 0.20)',
  border: '#C8D8E8',
  borderSoft: '#DCE8F2',
  buttonText: '#001A4F',
  error: '#B73B3B',
  heroBottom: '#001A4F',
  heroEyebrow: '#FFDD00',
  heroText: '#FFFFFF',
  heroTextMuted: 'rgba(255, 255, 255, 0.82)',
  heroTop: '#0F347C',
  overlay: 'rgba(0, 26, 79, 0.38)',
  primary: '#0F347C',
  primaryDeep: '#001A4F',
  secondaryGlow: 'rgba(105, 191, 235, 0.22)',
  surface: '#FFFFFF',
  surfaceMuted: '#EDF2FA',
  surfaceOverlay: 'rgba(255, 255, 255, 0.88)',
  tabActive: '#0F347C',
  tabBackground: '#FAFCFF',
  tabInactive: '#7888A0',
  textMuted: '#6B7B8F',
  textPrimary: '#001A4F',
  textSecondary: '#3D5070',
} as const;

export const softDarkColors: ColorPalette = {
  accent: '#FFDD00',
  accentGlow: 'rgba(255, 221, 0, 0.22)',
  accentLineToday: '#69BFEB',
  accentLineWeekend: '#4A8FC0',
  accentLineWeekday: '#2A5A8A',
  accentLinePastBorder: '#3A70A0',
  accentSoft: '#1A2A4A',
  background: '#0A1025',
  backgroundDeep: '#060C1A',
  backgroundGlow: 'rgba(15, 52, 124, 0.20)',
  border: '#1E3058',
  borderSoft: '#162545',
  buttonText: '#001A4F',
  error: '#E06060',
  heroBottom: '#001A4F',
  heroEyebrow: '#FFDD00',
  heroText: '#E0EAFF',
  heroTextMuted: 'rgba(224, 234, 255, 0.72)',
  heroTop: '#0F347C',
  overlay: 'rgba(0, 0, 0, 0.55)',
  primary: '#4A8FD0',
  primaryDeep: '#8AB8E8',
  secondaryGlow: 'rgba(105, 191, 235, 0.16)',
  surface: '#101A35',
  surfaceMuted: '#152240',
  surfaceOverlay: 'rgba(16, 26, 53, 0.88)',
  tabActive: '#69BFEB',
  tabBackground: '#0C1428',
  tabInactive: '#5A708A',
  textMuted: '#7088A8',
  textPrimary: '#D8E4F5',
  textSecondary: '#8AAAC8',
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

function getColorsForTheme(themeName: ThemeName): ColorPalette {
  switch (themeName) {
    case 'dark':
      return darkColors;
    case 'soft':
      return softColors;
    case 'soft-dark':
      return softDarkColors;
    default:
      return lightColors;
  }
}

export function ThemeProvider({
  children,
  themeName,
}: {
  children: React.ReactNode;
  themeName: ThemeName;
}) {
  const value = React.useMemo<ThemeContextValue>(
    () => ({
      colors: getColorsForTheme(themeName),
      isDark: themeName === 'dark' || themeName === 'soft-dark',
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
