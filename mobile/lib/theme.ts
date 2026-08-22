import { useColorScheme } from 'react-native';
import type { TextStyle } from 'react-native';

/**
 * Lead and Bone.
 *
 * Two palettes, not one inverted, both taken from an indoor 10 m range rather
 * than from a component library. Lead is the cool grey concrete of the tunnel;
 * bone is the target card; pitch is the black aiming mark; amber is the
 * lane-ready light and the only accent in the app.
 *
 * Light stays the default and dark follows the system setting, as before. What
 * changed is where the colours come from: light is card stock under fluorescent
 * light, not white, and dark is lead rather than near-black.
 *
 * One rule holds across both: **the plate never changes theme.** A score
 * printed on a target card is pitch on bone in a bright hall and in a dark one,
 * because that is what the object is. Everything else flips; the plate does
 * not.
 */
export interface Palette {
  /** Page background. */
  ground: string;
  /** Cards and raised surfaces sitting on the ground. */
  surface: string;
  /** Inputs and quiet buttons, one step further forward. */
  surfaceAlt: string;
  hairline: string;
  /** The heavy rule under a table header. Structure, not decoration. */
  rule: string;

  ink: string;
  inkMuted: string;
  inkFaint: string;

  /** Accent for text and icons — the lane-ready light. */
  accent: string;
  /** Accent for filled buttons. Same amber; both themes clear contrast. */
  accentSolid: string;
  accentTint: string;

  positive: string;
  positiveTint: string;
  /** Ink that stays legible on a positive fill. */
  onPositive: string;

  /**
   * "Your turn" and "closing soon" are the same signal as the lane light, so
   * warning is amber in both themes rather than a second competing hue.
   */
  warning: string;
  warningTint: string;

  negative: string;
  negativeTint: string;

  onSolid: string;

  // ------------------------------------------------------------- the plate --
  /** The target card. Constant across themes. */
  plate: string;
  /** The black aiming mark: what a score is printed in. Constant. */
  plateInk: string;
  /** Secondary type on a plate — lane, club, timestamp. Constant. */
  plateInkMuted: string;
  /** A rule drawn on bone. Constant. */
  plateRule: string;

  /** react-native StatusBar bar-style for this palette. */
  statusBar: 'light' | 'dark';
}

export const darkPalette: Palette = {
  ground: '#1B2128',
  surface: '#242C35',
  surfaceAlt: '#2E3741',
  hairline: '#333C47',
  rule: '#E8E4DA',

  ink: '#E8E4DA',
  inkMuted: '#98A2AD',
  inkFaint: '#6B7681',

  accent: '#E2A03C',
  accentSolid: '#E2A03C',
  accentTint: '#3A2E19',

  positive: '#7FB069',
  positiveTint: '#20301C',
  onPositive: '#0C1409',

  warning: '#E2A03C',
  warningTint: '#3A2E19',

  negative: '#CE5F52',
  negativeTint: '#33201D',

  onSolid: '#15100A',

  plate: '#EFEAE0',
  plateInk: '#101418',
  plateInkMuted: '#5C5F63',
  plateRule: '#CFC9BC',

  statusBar: 'light',
};

export const lightPalette: Palette = {
  // A ladder of four steps rather than three, because bone does not move
  // between themes and has to end up unmistakably the brightest thing here:
  // recessed (inputs) below ground, cards above it, and the plate above those.
  // The first attempt made cards and plates the same colour, which cost the
  // plate the whole point of being one.
  ground: '#D7D6CE',
  surface: '#E2E1DA',
  surfaceAlt: '#C6C5BC',
  hairline: '#BBBAB0',
  rule: '#171C21',

  ink: '#171C21',
  inkMuted: '#4E565F',
  inkFaint: '#828A93',

  accent: '#96600F',
  accentSolid: '#96600F',
  accentTint: '#F0E4CE',

  positive: '#456F3A',
  positiveTint: '#DEE8D8',
  onPositive: '#FBF6EC',

  warning: '#96600F',
  warningTint: '#F0E4CE',

  negative: '#9C382C',
  negativeTint: '#F0DCD8',

  onSolid: '#FBF6EC',

  plate: '#EFEAE0',
  plateInk: '#101418',
  plateInkMuted: '#5C5F63',
  plateRule: '#CFC9BC',

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

/**
 * Corners are nearly square. The old 18 pt radius is what made every screen
 * read as a stack of app cards; equipment and printed cards are cut, not
 * rounded. Pill survives for the few things that genuinely are pills.
 */
export const radius = {
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
  pill: 999,
} as const;

/**
 * Three faces, three jobs.
 *
 * Archivo is a signage grotesque — the vernacular of a competition hall — and
 * carries headings and every score. Instrument Sans sets running text.
 * IBM Plex Mono carries data: shot strings, lane numbers, disciplines, labels,
 * anything a shooter reads as a value rather than as a sentence.
 *
 * React Native picks a weight by family name, not by fontWeight, so each weight
 * is named here and `fontWeight` is deliberately absent from the styles below.
 * Setting both double-applies on Android.
 */
export const fonts = {
  display: 'Archivo_700Bold',
  displayHeavy: 'Archivo_800ExtraBold',
  displaySemi: 'Archivo_600SemiBold',

  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemi: 'InstrumentSans_600SemiBold',

  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

/**
 * Type scale.
 *
 * Sizes are unchanged from the previous scale on purpose: shooters skew older,
 * stand in a dim hall and may be wearing shooting glasses, so body stays at 15,
 * scores at 40 and buttons at 52 pt. This is a change of voice, not of size.
 *
 * Scores carry tabular figures and negative tracking — they are read as a
 * comparison, so the digits have to line up and hold together.
 */
export const text = {
  kicker: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  } as TextStyle,
  largeTitle: { fontFamily: fonts.display, fontSize: 30, letterSpacing: -0.6 } as TextStyle,
  title: { fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.3 } as TextStyle,
  name: { fontFamily: fonts.bodySemi, fontSize: 16, letterSpacing: -0.2 } as TextStyle,
  body: { fontFamily: fonts.body, fontSize: 15 } as TextStyle,
  meta: { fontFamily: fonts.body, fontSize: 12.5 } as TextStyle,
  /** A value rather than a sentence: discipline codes, lanes, timestamps. */
  data: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    letterSpacing: 0.5,
  } as TextStyle,
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  } as TextStyle,
  score: {
    fontFamily: fonts.displayHeavy,
    fontSize: 40,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  } as TextStyle,
  scoreSm: {
    fontFamily: fonts.displayHeavy,
    fontSize: 30,
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  } as TextStyle,
  points: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  } as TextStyle,
} as const;

export interface Theme {
  colors: Palette;
  space: typeof space;
  radius: typeof radius;
  text: typeof text;
  fonts: typeof fonts;
  dark: boolean;
}

const darkTheme: Theme = { colors: darkPalette, space, radius, text, fonts, dark: true };
const lightTheme: Theme = { colors: lightPalette, space, radius, text, fonts, dark: false };

/**
 * Follows the OS setting, defaulting to light when it does not say. The app
 * declares userInterfaceStyle "automatic", so a device set to dark still gets
 * the dark palette.
 */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}

/** Height the floating tab bar occupies, so lists can clear it. */
export const TAB_BAR_CLEARANCE = 96;
