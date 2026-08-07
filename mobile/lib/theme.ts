/**
 * Colours and spacing lifted from the original 2016 mockups: navy header,
 * white sheet, green for a lead, orange for anything still waiting.
 */
export const colors = {
  navy: '#2E3180',
  navyDark: '#242766',
  slate: '#33445F',

  bg: '#FFFFFF',
  surface: '#F5F6FA',
  border: '#DDE0E8',

  text: '#111318',
  textMuted: '#6B7280',
  textInverse: '#FFFFFF',

  /** A bout already decided in your favour. */
  win: '#3FBF3F',
  /** A bout still open, or a deadline running down. */
  pending: '#F5A623',
  loss: '#D64541',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 14,
} as const;

export const type = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '700' as const, color: colors.navy },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  score: { fontSize: 34, fontWeight: '700' as const, color: colors.text },
} as const;
