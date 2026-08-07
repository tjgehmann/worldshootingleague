import { useColorScheme } from 'react-native';
import type { TextStyle } from 'react-native';

/**
 * Two palettes, not one inverted.
 *
 * Dark is the default: ranges are dim, and the app is used standing at a firing
 * point rather than at a desk. Light is built separately — cards there carry a
 * shadow instead of a lift in brightness, and the semantic colours move darker
 * so they stay legible on white.
 *
 * The accent descends from the federation navy of the original mockups
 * (#2E3180), pushed up in lightness until it holds on a near-black ground.
 */
export interface Palette {
  /** Page background. */
  ground: string;
  /** Cards sitting on the ground. */
  surface: string;
  /** Inputs and quiet buttons, one step further forward. */
  surfaceAlt: string;
  hairline: string;

  ink: string;
  inkMuted: string;
  inkFaint: string;

  /** Accent for text and icons. */
  accent: string;
  /** Accent for filled buttons — darker, so white text clears contrast. */
  accentSolid: string;
  accentTint: string;

  positive: string;
  positiveTint: string;
  /** Ink that stays legible on a positive fill. */
  onPositive: string;

  warning: string;
  warningTint: string;

  negative: string;
  negativeTint: string;

  onSolid: string;
  /** react-native StatusBar bar-style for this palette. */
  statusBar: 'light' | 'dark';
}

export const darkPalette: Palette = {
  ground: '#0B0D13',
  surface: '#161A25',
  surfaceAlt: '#1F2432',
  hairline: '#272D3C',

  ink: '#F4F6FB',
  inkMuted: '#939BB0',
  inkFaint: '#656D80',

  accent: '#8788FF',
  accentSolid: '#5250E8',
  accentTint: '#1D1F3A',

  positive: '#34D399',
  positiveTint: '#0F2A21',
  onPositive: '#04150F',

  warning: '#FBBF4A',
  warningTint: '#2E2413',

  negative: '#FF6B7A',
  negativeTint: '#331A1F',

  onSolid: '#FFFFFF',
  statusBar: 'light',
};

export const lightPalette: Palette = {
  ground: '#F7F8FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EFF1F7',
  hairline: '#E3E6EF',

  ink: '#0B0D13',
  inkMuted: '#5B6377',
  inkFaint: '#838B9E',

  accent: '#4B4DE0',
  accentSolid: '#4B4DE0',
  accentTint: '#ECECFB',

  positive: '#0E9F6E',
  positiveTint: '#E3F7EF',
  onPositive: '#FFFFFF',

  warning: '#B4740A',
  warningTint: '#FCF1DE',

  negative: '#DC3B4C',
  negativeTint: '#FCE9EB',

  onSolid: '#FFFFFF',
  statusBar: 'dark',
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 15,
  xl: 18,
  pill: 999,
} as const;

/**
 * Type scale. Scores carry tabular figures and negative tracking — they are
 * read as a comparison, so the digits have to line up and hold together.
 */
export const text = {
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  } as TextStyle,
  largeTitle: { fontSize: 30, fontWeight: '700', letterSpacing: -0.8 } as TextStyle,
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 } as TextStyle,
  name: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 } as TextStyle,
  body: { fontSize: 15 } as TextStyle,
  meta: { fontSize: 12.5 } as TextStyle,
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  } as TextStyle,
  score: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1.4,
    fontVariant: ['tabular-nums'],
  } as TextStyle,
  scoreSm: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.9,
    fontVariant: ['tabular-nums'],
  } as TextStyle,
  points: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  } as TextStyle,
} as const;

export interface Theme {
  colors: Palette;
  space: typeof space;
  radius: typeof radius;
  text: typeof text;
  dark: boolean;
}

const darkTheme: Theme = { colors: darkPalette, space, radius, text, dark: true };
const lightTheme: Theme = { colors: lightPalette, space, radius, text, dark: false };

/** Follows the OS setting; the app declares userInterfaceStyle "automatic". */
export function useTheme(): Theme {
  return useColorScheme() === 'light' ? lightTheme : darkTheme;
}

/** Height the floating tab bar occupies, so lists can clear it. */
export const TAB_BAR_CLEARANCE = 96;
