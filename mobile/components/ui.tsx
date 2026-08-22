import { useMemo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
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
        // A trailing margin as well as a leading one: a Hint is often followed
        // by the next section's Kicker, which sets no top margin of its own,
        // and the two ran together on the profile.
        {
          color: t.colors.inkFaint,
          marginTop: t.space.sm,
          marginBottom: t.space.lg,
          lineHeight: 18,
        },
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
    // A hairline separates the card from the ground in both themes. The old
    // drop shadow was what made every screen read as a stack of app cards, and
    // on card stock a shadow is the one thing that never happens.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.hairline,
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
        borderRadius: t.radius.md,
        backgroundColor: t.colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: t.colors.inkMuted,
          fontFamily: t.fonts.monoMedium,
          fontSize: size * 0.33,
          letterSpacing: 0.5,
        }}
      >
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
        borderRadius: t.radius.sm,
        paddingHorizontal: 8,
        paddingVertical: 4,
      }}
    >
      <Text
        style={{
          color: fg,
          fontFamily: t.fonts.monoMedium,
          fontSize: 10,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
        }}
      >
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
        <Text
          style={{
            color: fg[variant],
            fontFamily: t.fonts.displaySemi,
            fontSize: size === 'sm' ? 15 : 16,
            letterSpacing: -0.1,
          }}
        >
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
          fontFamily: big ? t.fonts.displayHeavy : t.fonts.body,
          fontSize: big ? 21 : 16,
          fontVariant: big ? ['tabular-nums'] : undefined,
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
      <Text style={{ color: fg, fontFamily: t.fonts.body, fontSize: 14, lineHeight: 20 }}>
        {children}
      </Text>
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
              fontFamily: t.fonts.display,
              fontSize: 19,
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
      <Text
        style={{
          color: t.colors.inkFaint,
          fontFamily: t.fonts.body,
          fontSize: 15,
          textAlign: 'center',
          lineHeight: 22,
        }}
      >
        {message}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------- the plate --

/**
 * The ten-shot string.
 *
 * `submissions.shots` is populated whenever a range can export its data, and it
 * is the one thing this league holds that nobody else does: not a score, but
 * the shape of how it was arrived at. Ten marks, scaled across the range
 * actually shot rather than across the theoretical 0–10.9, because the
 * difference between a 9.8 and a 10.7 is the whole story and a fixed axis
 * flattens it to nothing.
 *
 * Renders nothing when the range could not export — a score on bone with no
 * string underneath is still a plate.
 */
export function ShotStrip({
  shots,
  height = 34,
  onPlate = true,
}: {
  shots: number[] | null | undefined;
  height?: number;
  onPlate?: boolean;
}) {
  const t = useTheme();
  if (!shots || shots.length === 0) return null;

  const lo = Math.min(...shots) - 0.35;
  const hi = Math.max(...shots) + 0.15;
  const span = hi - lo || 1;

  const strong = onPlate ? t.colors.plateInk : t.colors.ink;
  const weak = onPlate ? t.colors.plateInkMuted : t.colors.inkFaint;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Shot string: ${shots.join(', ')}`}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height }}
    >
      {shots.map((value, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(6, Math.round(((value - lo) / span) * 100))}%`,
            borderRadius: 1,
            // Two tiers only. A third made the strip read as noise rather than
            // as ten shots, and the line that matters to a shooter is 10.
            backgroundColor: value < 10 ? weak : strong,
            opacity: value < 10 ? 0.55 : 1,
          }}
        />
      ))}
    </View>
  );
}

/**
 * Concentric rings, drawn with borders rather than SVG so the app does not take
 * a drawing dependency for one 24 pt mark. Marks anything sealed.
 */
export function RingMark({ size = 24, color }: { size?: number; color?: ColorValue }) {
  const t = useTheme();
  const stroke = color ?? t.colors.inkFaint;
  const ring = (d: number, fill?: boolean): ViewStyle => ({
    position: 'absolute',
    width: d,
    height: d,
    borderRadius: d / 2,
    borderWidth: fill ? 0 : Math.max(1, size / 18),
    borderColor: stroke,
    backgroundColor: fill ? stroke : 'transparent',
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={ring(size)} />
      <View style={ring(size * 0.56)} />
      <View style={ring(size * 0.16, true)} />
    </View>
  );
}

/**
 * A score, printed on a target card.
 *
 * The plate is the one object in the app that does not change with the theme:
 * pitch on bone in a bright hall and in a dark one, because that is what a
 * target card is. It is deliberately scarce — only whatever is unresolved right
 * now gets one, so a screen full of decided series does not shout as loudly as
 * the series being shot tonight.
 *
 * `sealed` is the blind reveal made visible. A shutter says a number exists and
 * is not yours to see yet, which is a stronger thing to look at than a grey
 * "hidden until Stefan submits".
 */
export function Plate({
  who,
  meta,
  score,
  sub,
  shots,
  sealed,
  sealedLabel,
  compact,
  style,
}: {
  who: string;
  meta?: string;
  score?: string;
  sub?: string;
  shots?: number[] | null;
  sealed?: boolean;
  sealedLabel?: string;
  compact?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();

  return (
    <View
      style={[
        {
          position: 'relative',
          overflow: 'hidden',
          flex: 1,
          minHeight: compact ? 132 : 172,
          backgroundColor: t.colors.plate,
          borderRadius: t.radius.md,
          // A printed card has an edge. It also stops the plate dissolving into
          // a light ground, which is the one place bone-on-bone could fail.
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.colors.plateRule,
          padding: compact ? t.space.md : t.space.lg,
          justifyContent: 'space-between',
        },
        style,
      ]}
    >
      <View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space.sm }}>
          <Text
            style={{
              color: t.colors.plateInkMuted,
              fontFamily: t.fonts.monoMedium,
              fontSize: compact ? 9.5 : 10.5,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {who}
          </Text>
          {meta ? (
            <Text
              style={{
                color: t.colors.plateInkMuted,
                fontFamily: t.fonts.mono,
                fontSize: compact ? 9.5 : 10.5,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              {meta}
            </Text>
          ) : null}
        </View>

        <Text
          style={{
            color: t.colors.plateInk,
            fontFamily: t.fonts.displayHeavy,
            fontSize: compact ? 38 : 56,
            letterSpacing: compact ? -1.1 : -1.8,
            fontVariant: ['tabular-nums'],
            marginTop: t.space.sm,
          }}
        >
          {score ?? '–'}
        </Text>

        {sub ? (
          <Text
            style={{
              color: t.colors.plateInkMuted,
              fontFamily: t.fonts.mono,
              fontSize: compact ? 10 : 11,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {sub}
          </Text>
        ) : null}
      </View>

      {shots?.length ? (
        <View style={{ marginTop: t.space.md }}>
          <ShotStrip shots={shots} height={compact ? 24 : 32} />
        </View>
      ) : null}

      {sealed ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radius.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.colors.hairline,
            alignItems: 'center',
            justifyContent: 'center',
            padding: t.space.md,
          }}
        >
          <RingMark size={compact ? 20 : 24} color={t.colors.inkFaint} />
          <Text
            style={{
              color: t.colors.inkFaint,
              fontFamily: t.fonts.monoMedium,
              fontSize: compact ? 9.5 : 10.5,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              textAlign: 'center',
              lineHeight: 18,
              marginTop: t.space.sm,
            }}
          >
            {sealedLabel ?? 'Sealed'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A decided series, collapsed.
 *
 * Two of these replace a full card. Only the winning number is in full ink —
 * the loser's is stated, not shouted, which is what lets four series fit where
 * two used to.
 */
export function ScoreLine({
  name,
  value,
  meta,
  won,
  you,
}: {
  name: string;
  value: string;
  meta?: string;
  won?: boolean;
  you?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.space.md, paddingVertical: 5 }}
    >
      <Text
        style={{
          color: you ? t.colors.ink : t.colors.inkMuted,
          fontFamily: you ? t.fonts.bodySemi : t.fonts.body,
          fontSize: 15,
        }}
        numberOfLines={1}
      >
        {name}
      </Text>
      {meta ? (
        <Text style={[t.text.data, { color: t.colors.inkFaint }]} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
      <View
        style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.colors.hairline }}
      />
      <Text
        style={{
          color: won ? t.colors.ink : t.colors.inkFaint,
          fontFamily: t.fonts.displayHeavy,
          fontSize: 24,
          letterSpacing: -0.6,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * The two rules a table needs: a heavy one under a header, a hairline between
 * rows. Together they do the separating a card's shadow used to.
 */
export function Rule({ heavy, style }: { heavy?: boolean; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          height: heavy ? 2 : StyleSheet.hairlineWidth,
          backgroundColor: heavy ? t.colors.rule : t.colors.hairline,
        },
        style,
      ]}
    />
  );
}

/** A column heading, in the same mono as the values underneath it. */
export function ColLabel({
  children,
  align = 'left',
  width,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  width?: number;
}) {
  const t = useTheme();
  return (
    <Text
      style={{
        color: t.colors.inkFaint,
        fontFamily: t.fonts.monoMedium,
        fontSize: 9.5,
        letterSpacing: 1.3,
        textTransform: 'uppercase',
        textAlign: align,
        width,
      }}
    >
      {children}
    </Text>
  );
}
