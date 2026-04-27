import * as React from 'react';
import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

type EmptyStateProps = {
  action?: ReactNode;
  description: string;
  title: string;
};

export function EmptyState({ action, description, title }: EmptyStateProps) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {action}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.lg,
    },
    title: {
      ...typography.sectionTitle,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    description: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
