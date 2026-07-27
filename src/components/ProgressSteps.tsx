import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

export type ProgressStep = {
  /** Label shown for the step. */
  label: string;
  /** Optional note shown under the label (e.g. a retry hint) when active. */
  note?: string;
};

type ProgressStepsProps = {
  steps: ProgressStep[];
  /** Index of the step currently in progress. Steps before it are done. */
  activeIndex: number;
  fullScreen?: boolean;
};

/**
 * A vertical staged progress indicator used while loading large payloads.
 *
 * Each step shows a checkmark when completed, a spinner while active and a
 * muted dot while pending. It gives the user honest feedback ("Hämtar… →
 * Bearbetar…") during the long first load of big events.
 */
export function ProgressSteps({ steps, activeIndex, fullScreen = false }: ProgressStepsProps) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.container, fullScreen ? styles.fullScreen : null]}>
      <View style={styles.card}>
        {steps.map((step, index) => {
          const isDone = index < activeIndex;
          const isActive = index === activeIndex;

          return (
            <View key={step.label} style={styles.row}>
              <View style={styles.iconSlot}>
                {isActive ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Ionicons
                    color={isDone ? colors.primary : colors.textMuted}
                    name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                  />
                )}
              </View>

              <View style={styles.textSlot}>
                <Text
                  style={[
                    styles.label,
                    isActive ? styles.labelActive : null,
                    isDone ? styles.labelDone : null,
                  ]}
                >
                  {step.label}
                </Text>
                {isActive && step.note ? <Text style={styles.note}>{step.note}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      alignItems: 'stretch',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
    },
    fullScreen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    card: {
      alignSelf: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 20,
      borderWidth: 1,
      gap: spacing.md,
      maxWidth: 480,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      width: '100%',
    },
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    iconSlot: {
      alignItems: 'center',
      justifyContent: 'center',
      height: 24,
      width: 24,
    },
    textSlot: {
      flex: 1,
    },
    label: {
      ...typography.body,
      color: colors.textMuted,
    },
    labelActive: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
    },
    labelDone: {
      color: colors.textSecondary,
    },
    note: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });
}
