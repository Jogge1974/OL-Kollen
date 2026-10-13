import * as React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

type AppButtonProps = {
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  loading?: boolean;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function AppButton({ disabled = false, icon, label, loading = false, onPress, style, textStyle, variant = 'primary' }: AppButtonProps) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isDisabled = disabled || loading;
  const contentColor = variant === 'secondary' || variant === 'ghost' ? colors.primaryDeep : colors.buttonText;

  return (
    <Pressable
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : null,
        variant === 'secondary' ? styles.secondary : null,
        variant === 'ghost' ? styles.ghost : null,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={contentColor} size="small" /> : icon ? <Ionicons color={contentColor} name={icon} size={18} /> : null}
      <Text style={[styles.label, variant === 'secondary' || variant === 'ghost' ? styles.secondaryLabel : null, textStyle]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    base: {
      alignItems: 'center',
      borderRadius: 18,
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'center',
      minHeight: 54,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    primary: {
      backgroundColor: colors.accent,
    },
    secondary: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderWidth: 1,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    pressed: {
      opacity: 0.88,
    },
    disabled: {
      opacity: 0.55,
    },
    label: {
      ...typography.button,
      color: colors.buttonText,
    },
    secondaryLabel: {
      color: colors.textPrimary,
    },
  });
}
