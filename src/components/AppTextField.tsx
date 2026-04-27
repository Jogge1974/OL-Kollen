import * as React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

type AppTextFieldProps = TextInputProps & {
  label: string;
  onClearText?: () => void;
};

export function AppTextField({ label, onClearText, style, value, ...props }: AppTextFieldProps) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const hasClearButton = Boolean(onClearText && typeof value === 'string' && value.length > 0);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput placeholderTextColor={colors.textMuted} style={[styles.input, hasClearButton ? styles.inputWithClear : null, style]} value={value} {...props} />
        {hasClearButton ? (
          <Pressable hitSlop={8} onPress={onClearText} style={styles.clearButton}>
            <Ionicons color={colors.textMuted} name="close-circle" size={18} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrapper: {
      gap: spacing.xs,
    },
    clearButton: {
      position: 'absolute',
      right: 10,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    label: {
      ...typography.captionStrong,
      color: colors.textPrimary,
    },
    inputWrap: {
      position: 'relative',
    },
    input: {
      ...typography.body,
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      color: colors.textPrimary,
      minHeight: 40,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
    },
    inputWithClear: {
      paddingRight: 38,
    },
  });
}
