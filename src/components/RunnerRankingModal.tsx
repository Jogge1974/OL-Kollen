import * as React from 'react';

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { LoadingState } from '@/src/components/LoadingState';
import { fetchRunnerRankingTable, RunnerRankingTableResult } from '@/src/services/eventorRunnerRanking';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

export type RunnerRankingSelection = {
  clubName: string;
  name: string;
  personId: number;
};

type RunnerRankingModalState = RunnerRankingTableResult & {
  runnerName: string;
  runnerClub: string;
};

export function RunnerRankingModal({
  onClose,
  selection,
}: {
  onClose: () => void;
  selection: RunnerRankingSelection | null;
}) {
  const [state, setState] = React.useState<RunnerRankingModalState | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let isMounted = true;

    if (!selection) {
      setState(null);
      setReloadKey(0);
      return () => {
        isMounted = false;
      };
    }

    setState({
      headers: [],
      hasResultsTable: false,
      message: null,
      pageTitle: null,
      rows: [],
      runnerClub: selection.clubName,
      runnerName: selection.name,
      sourceUrl: '',
      success: false,
    });

    const load = async () => {
      const result = await fetchRunnerRankingTable(selection.personId);
      if (!isMounted) {
        return;
      }

      setState({
        ...result,
        runnerClub: selection.clubName,
        runnerName: selection.name,
      });
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [reloadKey, selection]);

  return (
    <Modal animationType="slide" transparent visible={Boolean(selection)}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <Text numberOfLines={1} style={styles.title}>
                Löparens tävlingar
              </Text>
              <Pressable onPress={onClose} style={styles.closeChip}>
                <Text style={styles.closeIcon}>×</Text>
                <Text style={styles.closeText}>Stäng</Text>
              </Pressable>
            </View>
            {state ? (
              <Text numberOfLines={1} style={styles.subtitle}>
                {state.runnerName} • {state.runnerClub}
              </Text>
            ) : null}
          </View>

          <View style={styles.content}>
            {state && !state.success && !state.message ? <LoadingState label="Hämtar tävlingslistan..." /> : null}
            {state?.message ? <Text style={styles.errorText}>{state.message}</Text> : null}

            {state && state.success ? (
              <>
                {state.headers.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.headersRow}>
                    {state.headers.map((header) => (
                      <View key={header} style={styles.headerChip}>
                        <Text numberOfLines={1} style={styles.headerChipText}>
                          {header}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                ) : null}

                <ScrollView contentContainerStyle={styles.rows}>
                  {state.rows.map((row, index) => (
                    <View key={`${state.sourceUrl}-${index}`} style={styles.rowCard}>
                      <Text numberOfLines={2} style={styles.rowTitle}>
                        {row.cells[0] ?? `Rad ${index + 1}`}
                      </Text>
                      <Text numberOfLines={3} style={styles.rowSubtitle}>
                        {row.cells.slice(1).join(' • ') || row.cells.join(' • ')}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : null}

            {state && !state.success && state.message ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Ingen lista kunde hämtas</Text>
                <Text style={styles.errorText}>{state.message ?? 'Okänt fel.'}</Text>
                <AppButton label="Försök igen" onPress={() => setReloadKey((value) => value + 1)} variant="secondary" />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '86%',
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTopRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
    fontSize: 17,
    minWidth: 0,
  },
  subtitle: {
    ...typography.buttonSmall,
    alignSelf: 'flex-start',
    color: colors.primary,
    fontSize: 13,
    lineHeight: 18,
  },
  closeChip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  closeIcon: {
    color: colors.primaryDeep,
    fontSize: 18,
    lineHeight: 18,
  },
  closeText: {
    ...typography.buttonSmall,
    color: colors.primary,
    fontSize: 13,
    lineHeight: 16,
  },
  content: {
    flex: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  errorText: {
    ...typography.captionStrong,
    color: colors.error,
  },
  errorTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  headerChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  headerChipText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    fontSize: 12,
  },
  headersRow: {
    paddingBottom: spacing.xs,
  },
  rowCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 3,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 18,
  },
  rows: {
    paddingBottom: spacing.lg,
  },
});
