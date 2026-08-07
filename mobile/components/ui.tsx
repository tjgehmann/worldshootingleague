import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, radius, space, type } from '@/lib/theme';

export function Header({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerText}>{title}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const isDisabled = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.navy : colors.textInverse} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'secondary' && { color: colors.navy },
          ]}
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
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        autoCapitalize={props.autoCapitalize ?? 'none'}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * The bout strip from the original mockups: one block per series, green when
 * won, orange while still open, grey when it no longer counts.
 */
export function BoutStrip({
  states,
}: {
  states: ('won' | 'lost' | 'tie' | 'open' | 'void')[];
}) {
  return (
    <View style={styles.strip}>
      {states.map((s, i) => (
        <View
          key={i}
          style={[
            styles.stripCell,
            s === 'won' && { backgroundColor: colors.win },
            s === 'lost' && { backgroundColor: colors.loss },
            s === 'tie' && { backgroundColor: colors.textMuted },
            s === 'open' && { backgroundColor: colors.pending },
            s === 'void' && { backgroundColor: colors.border },
          ]}
        />
      ))}
    </View>
  );
}

export function Banner({ tone, children }: { tone: 'info' | 'warn' | 'error'; children: ReactNode }) {
  return (
    <View
      style={[
        styles.banner,
        tone === 'warn' && { backgroundColor: '#FFF4E0', borderColor: colors.pending },
        tone === 'error' && { backgroundColor: '#FDECEC', borderColor: colors.loss },
      ]}
    >
      <Text style={styles.bannerText}>{children}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.navy} />
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={styles.centered}>
      <Text style={type.muted}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.navy,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    alignItems: 'center',
  },
  headerText: {
    color: colors.textInverse,
    fontSize: 20,
    letterSpacing: 1.5,
    fontWeight: '300',
  },
  sectionTitle: {
    ...type.heading,
    marginTop: space.lg,
    marginBottom: space.sm,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
    minHeight: 48,
  },
  buttonPrimary: { backgroundColor: colors.navy },
  buttonSecondary: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.navy },
  buttonDanger: { backgroundColor: colors.loss },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { color: colors.textInverse, fontSize: 15, fontWeight: '600' },
  field: { marginBottom: space.md },
  fieldLabel: { ...type.muted, marginBottom: space.xs, fontWeight: '600' },
  fieldHint: { ...type.muted, marginTop: space.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  strip: { flexDirection: 'row', gap: 2 },
  stripCell: { width: 22, height: 18, borderRadius: 2, backgroundColor: colors.border },
  banner: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  bannerText: { ...type.body, lineHeight: 21 },
  centered: { padding: space.xl, alignItems: 'center', justifyContent: 'center' },
});
