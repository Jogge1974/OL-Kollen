import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

type LoadingStateProps = {
  fullScreen?: boolean;
  label?: string;
};

export function LoadingState({ fullScreen = false, label = 'Laddar...' }: LoadingStateProps) {
  return (
    <View style={[styles.container, fullScreen ? styles.fullScreen : null]}>
      <View style={styles.card}>
        <ActivityIndicator color={colors.primary} size="small" />
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  fullScreen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
