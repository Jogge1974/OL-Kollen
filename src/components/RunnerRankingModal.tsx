import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { AppTextField } from '@/src/components/AppTextField';
import { LoadingState } from '@/src/components/LoadingState';
import { fetchRunnerRankingTable, RunnerRankingTableResult } from '@/src/services/eventorRunnerRanking';
import { refreshStoredEventorWebSessionCookie } from '@/src/services/eventorWebSession';
import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { useAuthStore } from '@/src/store/authStore';
import { SverigelistanRow } from '@/src/types/sverigelistan';

export type RunnerRankingSelection = {
  clubName: string;
  currentPoints: number;
  currentRank: number;
  gender: 'D' | 'H';
  name: string;
  personId: number;
};

type RunnerRankingModalState = RunnerRankingTableResult & {
  addition: number | null;
  runnerClub: string;
  runnerCurrentPoints: number;
  runnerCurrentRank: number;
  runnerGender: 'D' | 'H';
  runnerName: string;
};

export function RunnerRankingModal({
  comparisonRows,
  onClose,
  selection,
}: {
  comparisonRows: SverigelistanRow[];
  onClose: () => void;
  selection: RunnerRankingSelection | null;
}) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  const [state, setState] = React.useState<RunnerRankingModalState | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [manualLoginVisible, setManualLoginVisible] = React.useState(false);
  const [manualPassword, setManualPassword] = React.useState('');
  const [manualUsername, setManualUsername] = React.useState('');
  const [manualLoginError, setManualLoginError] = React.useState<string | null>(null);
  const authUser = useAuthStore((store) => store.user);
  const rememberedUsername = useAuthStore((store) => store.rememberedUsername);

  React.useEffect(() => {
    let isMounted = true;

    if (!selection) {
      setState(null);
      setReloadKey(0);
      setManualLoginVisible(false);
      setManualPassword('');
      setManualUsername('');
      setManualLoginError(null);
      return () => {
        isMounted = false;
      };
    }

      setState({
        competitions: [],
        addition: null,
        headers: [],
        hasResultsTable: false,
      loginRequired: false,
      message: null,
      overview: null,
      pageTitle: null,
      rows: [],
      runnerClub: selection.clubName,
      runnerCurrentPoints: selection.currentPoints,
      runnerCurrentRank: selection.currentRank,
      runnerGender: selection.gender,
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
        runnerCurrentPoints: selection.currentPoints,
        runnerCurrentRank: selection.currentRank,
        runnerGender: selection.gender,
        runnerName: selection.name,
      });
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [reloadKey, selection]);

  const projection = React.useMemo(() => {
    if (!state?.overview || state.overview.currentAverage == null || state.overview.projectedAverage == null) {
      return null;
    }

    const runnerCurrentPoints = state?.runnerCurrentPoints ?? 0;
    const runnerGender = state?.runnerGender ?? 'H';
    const addition = runnerCurrentPoints - state.overview.currentAverage;
    const projectedPoints = state.overview.projectedAverage + addition;
    const comparableRows = comparisonRows.filter((row) => row.Gender === runnerGender);
    const projectedPlace = 1 + comparableRows.filter((row) => row.Points < projectedPoints).length;

    return {
      addition,
      projectedPlace,
      projectedPoints,
    };
  }, [comparisonRows, state?.overview, state?.runnerCurrentPoints, state?.runnerGender]);

  React.useEffect(() => {
    if (!manualLoginVisible) {
      return;
    }

    const initialUsername = authUser?.username ?? rememberedUsername ?? '';
    setManualUsername((current) => current || initialUsername);
  }, [authUser?.username, manualLoginVisible, rememberedUsername]);

  const handleManualLogin = React.useCallback(async () => {
    if (!manualPassword.trim()) {
      setManualLoginError('Ange lösenordet innan du fortsätter.');
      return;
    }

    const username = manualUsername.trim();
    if (!username) {
      setManualLoginError('Ange användarnamn innan du fortsätter.');
      return;
    }

    setManualLoginError(null);

    const cookie = await refreshStoredEventorWebSessionCookie(username, manualPassword).catch(() => null);
    if (!cookie) {
      setManualLoginError('Inloggningen lyckades inte. Kontrollera användarnamn och lösenord.');
      return;
    }

    setManualLoginVisible(false);
    setManualPassword('');
    setReloadKey((value) => value + 1);
  }, [manualPassword, manualUsername]);

  return (
    <Modal animationType="slide" transparent visible={Boolean(selection)}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <Text numberOfLines={1} style={styles.title}>
                Sverigelistan
              </Text>
              <Pressable onPress={onClose} style={styles.closeChip}>
                <Ionicons color={colors.primary} name="close-circle-outline" size={16} />
                <Text style={styles.closeText}>Stäng</Text>
              </Pressable>
            </View>
            {state ? (
              <Text numberOfLines={1} style={styles.subtitle}>
                {state.runnerName} • {state.runnerClub}
              </Text>
            ) : null}
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {state && !state.success && !state.message ? <LoadingState label="Hämtar tävlingslistan..." /> : null}
            {state?.message ? <Text style={styles.errorText}>{state.message}</Text> : null}

            {state && state.success ? (
              <>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryTopRow}>
                    <SummaryChip
                      icon="person-outline"
                      label="Placering"
                      value={`#${state.runnerCurrentRank}`}
                    />
                    <SummaryChip icon="speedometer-outline" label="Poäng" value={formatPoints(state.runnerCurrentPoints)} />
                    <SummaryChip icon="add-circle-outline" label="Tillägg" value={formatPoints(state.addition)} />
                  </View>
                </View>

                <View style={styles.listHeaderRow}>
                  <Text style={styles.sectionTitle}>6 bästa tävlingarna</Text>
                  <Text style={styles.sectionHint}>Sorterat efter poäng</Text>
                </View>

                <View style={styles.rows}>
                  {(state.overview?.selectedRows ?? []).map((row, index) => {
                    const isExpiringSoon = row.daysUntilExpiry < 30;
                    return (
                      <View
                        key={`${row.dateISO}-${row.eventName}-${row.position ?? index}`}
                        style={[styles.rowCard, isExpiringSoon ? styles.rowCardEmphasis : null]}
                      >
                        <View style={styles.rankBadge}>
                          <Text style={styles.rankBadgeText}>#{index + 1}</Text>
                        </View>

                        <View style={styles.rowBody}>
                          <View style={styles.rowTopLine}>
                            <Text numberOfLines={1} style={[styles.rowTitle, isExpiringSoon ? styles.rowTitleEmphasis : null]}>
                              {row.eventName}
                            </Text>
                            <Text style={[styles.scoreText, isExpiringSoon ? styles.scoreTextEmphasis : null]}>{formatPoints(row.score)}</Text>
                          </View>

                          <View style={[styles.rowBottomLine, isExpiringSoon ? styles.rowBottomLineEmphasis : null]}>
                            <View style={styles.rowBottomLeft}>
                              <Text numberOfLines={1} style={[styles.rowDate, isExpiringSoon ? styles.rowDateEmphasis : null]}>
                                {row.dateLabel}
                              </Text>
                              <MetaPill label={row.className} emphasized={isExpiringSoon} />
                              <MetaPill label={row.distance} emphasized={isExpiringSoon} />
                            </View>
                            <View style={[styles.expiryBadge, isExpiringSoon ? styles.expiryBadgeActive : null]}>
                              <Text style={[styles.expiryBadgeText, isExpiringSoon ? styles.expiryBadgeTextActive : null]}>
                                {row.daysUntilExpiry} dagar kvar
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {state.overview?.soonestExpiryRow ? (
                  <View style={styles.expirySummaryCard}>
                    <Text style={styles.expirySummaryDays}>{state.overview.soonestExpiryRow.daysUntilExpiry} dagar kvar</Text>
                    <Text style={styles.expirySummaryCaption}>tills tävling ersätts</Text>
                  </View>
                ) : null}

                {state.overview?.replacementRow ? (
                  <View style={styles.nextCard}>
                    <Text style={styles.nextCardTitle}>Tävling näst i tur</Text>
                    <View style={styles.rowCardCompact}>
                      <View style={styles.rowBody}>
                        <View style={styles.rowTopLine}>
                          <Text numberOfLines={1} style={styles.rowTitle}>
                            {state.overview.replacementRow.eventName}
                          </Text>
                          <Text style={styles.scoreText}>{formatPoints(state.overview.replacementRow.score)}</Text>
                        </View>
                          <View style={styles.rowBottomLine}>
                          <View style={styles.rowBottomLeft}>
                            <Text numberOfLines={1} style={styles.rowDate}>
                              {state.overview.replacementRow.dateLabel}
                            </Text>
                            <MetaPill label={state.overview.replacementRow.className} />
                            <MetaPill label={state.overview.replacementRow.distance} />
                          </View>
                          <View style={[styles.expiryBadge, state.overview.replacementRow.daysUntilExpiry < 30 ? styles.expiryBadgeActive : null]}>
                            <Text
                              style={[
                                styles.expiryBadgeText,
                                state.overview.replacementRow.daysUntilExpiry < 30 ? styles.expiryBadgeTextActive : null,
                              ]}
                            >
                              {state.overview.replacementRow.daysUntilExpiry} dagar kvar
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.nextCard}>
                    <Text style={styles.nextCardTitle}>Tävling näst i tur</Text>
                    <Text style={styles.nextCardEmptyTitle}>Ingen tävling på tur</Text>
                    <Text style={styles.nextCardEmptyText}>
                      Det finns ingen senare tävling som kan ersätta den som ryker först.
                    </Text>
                  </View>
                )}
              </>
            ) : null}

            {state && !state.success && state.message ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Ingen lista kunde hämtas</Text>
                <Text style={styles.errorText}>{state.message ?? 'Okänt fel.'}</Text>
                <View style={styles.errorActions}>
                  <AppButton label="Försök igen" onPress={() => setReloadKey((value) => value + 1)} variant="secondary" />
                  {state.loginRequired ? (
                    <AppButton label="Ange lösenord" onPress={() => setManualLoginVisible(true)} variant="primary" />
                  ) : null}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>

      <Modal animationType="fade" transparent visible={manualLoginVisible}>
        <View style={styles.manualOverlay}>
          <Pressable style={styles.backdrop} onPress={() => setManualLoginVisible(false)} />
          <View style={styles.manualCard}>
            <Text style={styles.manualTitle}>Logga in mot Eventor</Text>
            <Text style={styles.manualText}>Ange lösenordet så försöker vi förnya webbsessionen för Sverigelistan.</Text>

            {!authUser?.username && !rememberedUsername ? (
              <AppTextField
                autoCapitalize="none"
                autoCorrect={false}
                label="Användarnamn"
                onChangeText={setManualUsername}
                placeholder="Ange ditt Eventor-användarnamn"
                value={manualUsername}
              />
            ) : (
              <View style={styles.manualUsernameBox}>
                <Text style={styles.manualUsernameLabel}>Användarnamn</Text>
                <Text style={styles.manualUsernameValue}>{manualUsername}</Text>
              </View>
            )}

            <AppTextField
              autoCapitalize="none"
              autoCorrect={false}
              label="Lösenord"
              onChangeText={setManualPassword}
              placeholder="Ange ditt lösenord"
              secureTextEntry
              value={manualPassword}
            />

            {manualLoginError ? <Text style={styles.manualError}>{manualLoginError}</Text> : null}

            <View style={styles.manualActions}>
              <AppButton label="Avbryt" onPress={() => setManualLoginVisible(false)} variant="secondary" />
              <AppButton label="Logga in" onPress={() => void handleManualLogin()} variant="primary" />
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

function SummaryChip({
  icon,
  label,
  subtitle,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  value: string;
}) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  return (
    <View style={styles.summaryChip}>
      <View style={styles.summaryChipHeader}>
        <Ionicons color={colors.primaryDeep} name={icon} size={14} />
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={styles.summaryValue}>
        {value}
      </Text>
      {subtitle ? (
        <Text numberOfLines={1} style={styles.summarySubtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function MetaPill({ label, emphasized = false }: { label: string; emphasized?: boolean }) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  return (
    <View style={[styles.metaPill, emphasized ? styles.metaPillEmphasis : null]}>
      <Text numberOfLines={1} style={[styles.metaPillText, emphasized ? styles.metaPillTextEmphasis : null]}>
        {label}
      </Text>
    </View>
  );
}

function formatPoints(points: number | null | undefined) {
  if (points === null || points === undefined || Number.isNaN(points)) {
    return '-';
  }

  return Number.isInteger(points) ? `${points}` : points.toFixed(2).replace('.', ',');
}

function createStyles(colors: ColorPalette, isDark: boolean, themeName?: string) {
  const isSoft = themeName === 'soft';
  return StyleSheet.create({
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
    height: '90%',
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
    fontSize: 16,
    lineHeight: 19,
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
  closeText: {
    ...typography.buttonSmall,
    color: colors.primary,
    fontSize: 13,
    lineHeight: 16,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  errorCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  errorActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.captionStrong,
    color: colors.error,
  },
  errorTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  expiryBadge: {
    alignItems: 'center',
    backgroundColor: isDark ? '#17301A' : isSoft ? '#EDF2FA' : '#F0F6E8',
    borderColor: isDark ? '#2E5A30' : isSoft ? '#B0C4DE' : '#C9DBB0',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  expiryBadgeActive: {
    backgroundColor: isDark ? '#301717' : '#FFF1F1',
    borderColor: isDark ? '#5A2E2E' : '#E2B1B1',
  },
  expiryBadgeText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    fontSize: 11,
  },
  expiryBadgeTextActive: {
    color: colors.error,
  },
  expirySummaryCard: {
    alignItems: 'center',
    backgroundColor: isDark ? '#301717' : '#FFF7F7',
    borderColor: isDark ? '#5A2E2E' : '#E7B5B5',
    borderRadius: 22,
    borderWidth: 1,
    gap: 2,
    paddingVertical: spacing.sm,
  },
  expirySummaryCaption: {
    ...typography.caption,
    color: colors.error,
    fontSize: 11,
  },
  expirySummaryDays: {
    ...typography.sectionTitle,
    color: colors.error,
    fontSize: 18,
  },
  listHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  manualActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  manualCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    width: '100%',
  },
  manualError: {
    ...typography.captionStrong,
    color: colors.error,
  },
  manualOverlay: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  manualText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  manualTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 17,
  },
  manualUsernameBox: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  manualUsernameLabel: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 11,
  },
  manualUsernameValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
  },
  metaPill: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  metaPillEmphasis: {
    backgroundColor: isDark ? '#301717' : '#FFF7F7',
    borderColor: isDark ? '#5A2E2E' : '#E7B5B5',
  },
  metaPillText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
    fontSize: 11,
  },
  metaPillTextEmphasis: {
    color: colors.error,
  },
  nextCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
    width: '100%',
  },
  nextCardTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 16,
  },
  nextCardEmptyTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
  },
  nextCardEmptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
  },
  rankBadge: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: isDark ? '#17301A' : isSoft ? '#E0ECF8' : '#E3F1D2',
    borderColor: isDark ? '#2E5A30' : isSoft ? '#A0C0E0' : '#AFCF88',
    borderWidth: 1,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 52,
    width: 40,
  },
  rankBadgeText: {
    ...typography.bodyStrong,
    color: colors.primaryDeep,
    fontSize: 13,
  },
  rowBody: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  rowCard: {
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: spacing.xs,
  },
  rowCardCompact: {
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    padding: spacing.sm,
  },
  rowCardEmphasis: {
    backgroundColor: isDark ? '#301717' : '#FFF3F3',
    borderColor: isDark ? '#5A2E2E' : '#E7B5B5',
  },
  rowDate: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    flexShrink: 0,
    fontSize: 11,
    minWidth: 58,
  },
  rowDateEmphasis: {
    color: colors.error,
  },
  rowBottomLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  rowBottomLineEmphasis: {
    alignItems: 'center',
  },
  rowBottomLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    flexWrap: 'nowrap',
    gap: 6,
    minWidth: 0,
  },
  rowTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    minWidth: 0,
  },
  rowTitleEmphasis: {
    color: colors.error,
  },
  rows: {
    gap: spacing.xs,
  },
  sectionHint: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  sectionTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 14,
  },
  scorePill: {
    alignItems: 'center',
    backgroundColor: isSoft ? '#EDF2FA' : isDark ? colors.surfaceMuted : '#F1F8EA',
    borderColor: isSoft ? '#B0C4DE' : isDark ? colors.border : '#C8DAB0',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  scorePillText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    fontSize: 11,
  },
  scoreText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
  },
  scoreTextEmphasis: {
    color: colors.error,
  },
  summaryCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  summaryChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  summaryChipHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'flex-start',
  },
  summaryLabel: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 11,
  },
  summarySubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  summaryTopRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryBottomRow: {
    flexDirection: 'row',
  },
  summaryValue: {
    ...typography.bodyStrong,
    color: colors.primaryDeep,
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
});
}
