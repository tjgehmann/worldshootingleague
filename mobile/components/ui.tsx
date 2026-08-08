import { useMemo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme, type Theme } from '@/lib/theme';

/** Builds a stylesheet against the active palette. */
function useStyles<T extends StyleSheet.NamedStyles<T>>(factory: (t: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme)), [theme, factory]);
}

// ------------------------------------------------------------------ text --

export function Kicker({ children, tone }: { children: ReactNode; tone?: string }) {
  const t = useTheme();
  return (
    <Text style={[t.text.kicker, { color: tone ?? t.colors.inkFaint, marginBottom: t.space.xs }]}>
      {children}
    </Text>
  );
}

export function LargeTitle({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={[t.text.largeTitle, { color: t.colors.ink, marginBottom: t.space.xl }]}>
      {children}
    </Text>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[t.text.label, { color: t.colors.inkFaint }]}>{children}</Text>;
}

export function Meta({
  children,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  style?: ViewStyle;
  numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text style={[t.text.meta, { color: t.colors.inkFaint }, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Hint({ children, center }: { children: ReactNode; center?: boolean }) {
  const t = useTheme();
  return (
    <Text
      style={[
        t.text.meta,
        { color: t.colors.inkFaint, marginTop: t.space.sm, lineHeight: 18 },
        center && { textAlign: 'center' },
      ]}
    >
      {children}
    </Text>
  );
}

// --------------------------------------------------------------- surfaces --

export function Card({
  children,
  style,
  tone,
}: {
  children: ReactNode;
  style?: ViewStyle;
  tone?: 'positive';
}) {
  const t = useTheme();
  const s = useStyles(cardStyles);
  return (
    <View
      style={[
        s.card,
        tone === 'positive' && { backgroundColor: t.colors.positiveTint },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const cardStyles = (t: Theme) => ({
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.xl,
    padding: t.space.lg,
    marginBottom: t.space.md,
    // Depth comes from brightness in dark and from a shadow in light.
    ...(t.dark
      ? {}
      : {
          shadowColor: '#0B0D13',
          shadowOpacity: 0.06,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        }),
  } as ViewStyle,
});

export function Hairline({ style }: { style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        { height: StyleSheet.hairlineWidth * 2, backgroundColor: t.colors.hairline, marginVertical: t.space.md },
        style,
      ]}
    />
  );
}

export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: t.colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: t.colors.accent, fontWeight: '700', fontSize: size * 0.37 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

/**
 * Two characters, always: the first letters of the first two words, or the
 * first two letters of a single word. Club short names ("SVK") are one word,
 * and a lone "S" in a round grey tile reads as nothing at all.
 */
function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

// ------------------------------------------------------------------ state --

export type PillTone = 'turn' | 'wait' | 'won' | 'lost';

export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  const t = useTheme();
  const map: Record<PillTone, { bg: string; fg: string }> = {
    turn: { bg: t.colors.warningTint, fg: t.colors.warning },
    wait: { bg: t.colors.surfaceAlt, fg: t.colors.inkFaint },
    won: { bg: t.colors.positiveTint, fg: t.colors.positive },
    lost: { bg: t.colors.negativeTint, fg: t.colors.negative },
  };
  const { bg, fg } = map[tone];

  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: t.radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={{ color: fg, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' }}>
        {children}
      </Text>
    </View>
  );
}

export type SegmentState = 'won' | 'lost' | 'tie' | 'open' | 'void';

/**
 * One slim bar per series. Deliberately neutral for anything still open —
 * urgency belongs to the match as a whole and is carried by the status pill,
 * not repeated five times.
 */
export function Segments({ states }: { states: SegmentState[] }) {
  const t = useTheme();
  const fill: Record<SegmentState, string> = {
    won: t.colors.positive,
    lost: t.colors.negative,
    tie: t.colors.inkFaint,
    open: t.colors.surfaceAlt,
    void: t.colors.surfaceAlt,
  };

  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {states.map((state, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 5,
            borderRadius: 3,
            backgroundColor: fill[state],
            opacity: state === 'void' ? 0.4 : 1,
          }}
        />
      ))}
    </View>
  );
}

/**
 * The scoreboard. Two figures facing each other across a hairline — the whole
 * product in one component.
 */
export function HeadToHead({
  leftLabel,
  leftValue,
  leftMeta,
  leftWon,
  rightLabel,
  rightValue,
  rightMeta,
  rightWon,
  rightBlind,
}: {
  leftLabel: string;
  leftValue: string;
  leftMeta?: string;
  leftWon?: boolean;
  rightLabel: string;
  rightValue: string;
  rightMeta?: string;
  rightWon?: boolean;
  rightBlind?: boolean;
}) {
  const t = useTheme();

  const value = (v: string, won?: boolean, blind?: boolean) => [
    t.text.score,
    {
      color: blind ? t.colors.inkFaint : won ? t.colors.positive : t.colors.ink,
    },
    blind && { fontSize: 34, letterSpacing: 4 },
    !won && !blind && { color: t.colors.ink },
  ];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Label>{leftLabel}</Label>
        <Text style={value(leftValue, leftWon)}>{leftValue}</Text>
        {leftMeta ? <Meta>{leftMeta}</Meta> : null}
      </View>

      <View
        style={{
          width: StyleSheet.hairlineWidth * 2,
          backgroundColor: t.colors.hairline,
          marginHorizontal: t.space.lg,
          marginVertical: t.space.xs,
        }}
      />

      <View style={{ flex: 1, gap: 3, alignItems: 'flex-end' }}>
        <Label>{rightLabel}</Label>
        <Text style={value(rightValue, rightWon, rightBlind)}>{rightValue}</Text>
        {rightMeta ? <Meta>{rightMeta}</Meta> : null}
      </View>
    </View>
  );
}

// --------------------------------------------------------------- controls --

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'quiet' | 'positive' | 'text';
  size?: 'md' | 'sm';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const isDisabled = disabled || busy;

  const bg: Record<string, string> = {
    primary: t.colors.accentSolid,
    quiet: t.colors.surfaceAlt,
    positive: t.colors.positive,
    text: 'transparent',
  };
  const fg: Record<string, string> = {
    primary: t.colors.onSolid,
    quiet: t.colors.ink,
    positive: t.colors.onPositive,
    text: t.colors.accent,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!busy }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          height: size === 'sm' ? 44 : 52,
          borderRadius: size === 'sm' ? t.radius.md : t.radius.lg,
          backgroundColor: bg[variant],
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: t.space.sm,
          opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <Text style={{ color: fg[variant], fontSize: size === 'sm' ? 15 : 16, fontWeight: '600', letterSpacing: -0.2 }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  big,
  style,
  ...props
}: TextInputProps & { label: string; hint?: string; big?: boolean; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View style={[{ marginBottom: t.space.md }, style]}>
      <Text style={[t.text.label, { color: t.colors.inkFaint, marginBottom: 7 }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={t.colors.inkFaint}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        style={{
          backgroundColor: t.colors.surfaceAlt,
          borderRadius: t.radius.lg,
          paddingHorizontal: t.space.lg,
          paddingVertical: 14,
          color: t.colors.ink,
          fontSize: big ? 21 : 16,
          fontWeight: big ? '600' : '400',
        }}
      />
      {hint ? <Hint>{hint}</Hint> : null}
    </View>
  );
}

export function Note({
  tone = 'plain',
  children,
}: {
  tone?: 'plain' | 'warn' | 'error';
  children: ReactNode;
}) {
  const t = useTheme();
  const bg = tone === 'warn' ? t.colors.warningTint : tone === 'error' ? t.colors.negativeTint : t.colors.surface;
  const fg = tone === 'warn' ? t.colors.warning : tone === 'error' ? t.colors.negative : t.colors.inkMuted;

  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: t.radius.lg,
        padding: t.space.lg,
        marginBottom: t.space.md,
      }}
    >
      <Text style={{ color: fg, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function StatRow({ items }: { items: { value: string; label: string }[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: t.space.sm }}>
      {items.map((item) => (
        <View
          key={item.label}
          style={{
            flex: 1,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radius.md,
            paddingVertical: t.space.md,
            paddingHorizontal: t.space.sm,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              color: t.colors.ink,
              fontSize: 19,
              fontWeight: '700',
              letterSpacing: -0.4,
              fontVariant: ['tabular-nums'],
            }}
          >
            {item.value}
          </Text>
          <Text style={[t.text.label, { color: t.colors.inkFaint, fontSize: 10.5, marginTop: 2 }]}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Meter({ percent }: { percent: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: t.colors.surfaceAlt,
        overflow: 'hidden',
        marginTop: t.space.md,
      }}
    >
      <View
        style={{
          height: '100%',
          width: `${Math.max(0, Math.min(100, percent))}%`,
          backgroundColor: t.colors.positive,
          borderRadius: 3,
        }}
      />
    </View>
  );
}

// ----------------------------------------------------------------- states --

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, padding: t.space.xxl, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.ground }}>
      <ActivityIndicator color={t.colors.accent} />
    </View>
  );
}

export function Empty({ text: message }: { text: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, padding: t.space.xxl, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.ground }}>
      <Text style={{ color: t.colors.inkFaint, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
        {message}
      </Text>
    </View>
  );
}
