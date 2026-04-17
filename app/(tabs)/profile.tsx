import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { AppTextField } from '@/src/components/AppTextField';
import { FavoritesAndResultsPanel } from '@/src/components/FavoritesAndResultsPanel';
import { AnalysisModal, AnalysisModalState, openEventAnalysisModal } from '@/src/components/AnalysisModal';
import { RankingTrendChart } from '@/src/components/RankingTrendChart';
import { PublishedListModal, PublishedListModalState, openPublishedListModal } from '@/src/components/PublishedListModal';
import { SplitTimesModal, SplitTimesModalState, openEventSplitTimesModal } from '@/src/components/SplitTimesModal';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { UpcomingStartsPanel } from '@/src/components/UpcomingStartsPanel';
import { usePersonEventorLists } from '@/src/hooks/usePersonEventorLists';
import { useRememberMe } from '@/src/hooks/useRememberMe';
import { useSverigelistan } from '@/src/hooks/useSverigelistan';
import { useAuthStore } from '@/src/store/authStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { SverigelistanTrendDirection } from '@/src/types/sverigelistan';

export default function ProfileScreen() {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [saveEncryptedLogin, setSaveEncryptedLogin] = React.useState(false);
  const [showSverigelistanTrend, setShowSverigelistanTrend] = React.useState(false);
  const { rememberMe, setRememberMe } = useRememberMe(true);
  const [activeAnalysisModal, setActiveAnalysisModal] = React.useState<AnalysisModalState | null>(null);
  const [activeResultListModal, setActiveResultListModal] = React.useState<PublishedListModalState | null>(null);
  const [activeSplitTimesModal, setActiveSplitTimesModal] = React.useState<SplitTimesModalState | null>(null);

  const error = useAuthStore((state) => state.error);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const rememberedUsername = useAuthStore((state) => state.rememberedUsername);
  const signInWithEventor = useAuthStore((state) => state.signInWithEventor);
  const user = useAuthStore((state) => state.user);
  const hydrateSession = useAuthStore((state) => state.hydrateSession);

  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
  const hydratePreferences = usePreferencesStore((state) => state.hydratePreferences);
  const removeFavorite = usePreferencesStore((state) => state.removeFavorite);
  const clearAllFavorites = usePreferencesStore((state) => state.clearAllFavorites);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const {
    className,
    classTrend,
    currentClassRank,
    currentEntry,
    error: sverigelistanError,
    hasSupabase,
    isLoading: isSverigelistanLoading,
    monthlyTrend,
    previousClassRank,
    previousEntry,
    refetch,
    trendDirection,
  } = useSverigelistan({
    birthDate: user?.birthDate ?? null,
    gender: user?.gender ?? null,
    runnerId: user?.personId ?? null,
  });
  const {
    availableYears,
    isLoadingResults,
    isLoadingStarts,
    refetch: refetchPersonLists,
    resultsCompetitionCount,
    resultsError,
    resultsFilter,
    resultsSections,
    resultsYear,
    setResultsFilter,
    setResultsYear,
    startsError,
    startsSections,
  } = usePersonEventorLists({
    personId: user?.personId ?? null,
  });

  const handleLogin = async () => {
    try {
      await signInWithEventor({ password, rememberMe, saveEncryptedLogin, username });
      setPassword('');
    } catch {
      // Store state already exposes a clean error message.
    }
  };

  const hasInitializedUsername = React.useRef(false);

  React.useEffect(() => {
    if (!user && rememberedUsername && !hasInitializedUsername.current) {
      hasInitializedUsername.current = true;
      setUsername(rememberedUsername);
    }
  }, [rememberedUsername, user]);

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);

    try {
      await Promise.all([hydrateSession(), hydratePreferences(), refetch(), refetchPersonLists()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [hydratePreferences, hydrateSession, refetch, refetchPersonLists]);

  const handleOpenResultList = React.useCallback(
    (eventId: string, classLabel: string, eventRaceId?: string | null) => {
      void openPublishedListModal('results', 'public', eventId, null, null, setActiveResultListModal, classLabel, eventRaceId ?? null);
    },
    [],
  );

  const handleOpenSplitTimes = React.useCallback((eventId: string, classLabel: string) => {
    void openEventSplitTimesModal(eventId, setActiveSplitTimesModal, classLabel);
  }, []);

  const handleOpenAnalysis = React.useCallback((eventId: string, classLabel: string, personId?: string | null) => {
    void openEventAnalysisModal(eventId, setActiveAnalysisModal, classLabel, personId ?? null);
  }, []);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl onRefresh={() => void handleRefresh()} refreshing={isRefreshing} tintColor={colors.primary} />}
      >
        <ScreenHeroHeader
          badge={user ? { text: 'Free' } : undefined}
          chips={
            user
              ? [
                  { icon: 'trophy-outline', label: 'Plac.', value: currentEntry ? `${currentEntry.Rank}` : '—' },
                  { icon: 'flag-outline', label: 'Ant. starter', value: `${resultsCompetitionCount}` },
                  { icon: 'heart-outline', label: 'Favoriter', value: `${favoriteEvents.length}` },
                ]
              : [
                  { icon: 'lock-closed-outline', label: 'Sverigelista', value: 'Auto' },
                  { icon: 'heart-outline', label: 'Favoriter', value: 'Synk' },
                  { icon: 'sync-outline', label: 'Login', value: 'Krypterat' },
                ]
          }
          eyebrow="Min sida"
          subtitle={
            user
              ? user.organisationName ?? (user.organisationIds[0] ?? 'Ingen klubb')
              : 'Logga in med Eventor för att se Sverigelistan, starter och favoriter.'
          }
          title={user ? user.fullName ?? 'Inloggad användare' : 'Logga in'}
          topRightText={user ? 'Profil' : 'Eventor'}
        />

        {!user ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Logga in med Eventor</Text>

            <AppTextField
              autoCapitalize="none"
              autoCorrect={false}
              label="UserName"
              onChangeText={setUsername}
              placeholder="Ange ditt Eventor-användarnamn"
              value={username}
            />

            <AppTextField
              autoCapitalize="none"
              autoCorrect={false}
              label="Password"
              onChangeText={setPassword}
              placeholder="Ange ditt lösenord"
              secureTextEntry
              value={password}
            />

            <View style={styles.checkboxRow}>
              <Pressable onPress={() => setRememberMe(!rememberMe)} style={styles.rememberMeRow}>
                <View style={[styles.rememberMeBox, rememberMe ? styles.rememberMeBoxChecked : null]}>
                  {rememberMe ? <Ionicons color={colors.heroText} name="checkmark" size={14} /> : null}
                </View>
                <Text style={styles.checkboxLabel}>Kom ihåg mig</Text>
              </Pressable>
            </View>

            <View style={styles.checkboxRow}>
              <Pressable onPress={() => setSaveEncryptedLogin(!saveEncryptedLogin)} style={styles.rememberMeRow}>
                <View style={[styles.rememberMeBox, saveEncryptedLogin ? styles.rememberMeBoxChecked : null]}>
                  {saveEncryptedLogin ? <Ionicons color={colors.heroText} name="checkmark" size={14} /> : null}
                </View>
                <Text style={styles.checkboxLabel}>Spara användaruppgifterna krypterat</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <AppButton
              disabled={!username.trim() || !password.trim()}
              label="Logga in"
              loading={isSubmitting}
              onPress={() => void handleLogin()}
            />

            <Text style={styles.helperText}>
              Inloggningen använder Eventors dokumenterade authenticatePerson-endpoint. Om du sparar användaruppgifterna krypterat kan appen logga in mot Sverigelistan automatiskt när webbsessionen går ut. Det kräver dock att din organisation har giltig licens till Sverigelistan
            </Text>
          </View>
        ) : null}

        {user ? (
          <Pressable
            onPress={
              !user.personId || isSverigelistanLoading || sverigelistanError || !hasSupabase || !currentEntry
                ? undefined
                : () => setShowSverigelistanTrend((value) => !value)
            }
            style={styles.panel}
          >
            <View style={styles.sverigelistanHeader}>
              <Text style={styles.panelTitle}>Sverigelistan</Text>
              {!user.personId || isSverigelistanLoading || sverigelistanError || !hasSupabase || !currentEntry ? null : (
                <Text style={styles.sverigelistanUpdated}>Uppd. {formatUpdatedDate(currentEntry.Updated)}</Text>
              )}
            </View>

            {!user.personId ? (
              <Text style={styles.helperText}>PersonId saknas på den inloggade användaren, så Sverigelistan kan inte hämtas.</Text>
            ) : isSverigelistanLoading ? (
              <Text style={styles.helperText}>Hämtar Sverigelistan...</Text>
            ) : sverigelistanError ? (
              <Text style={styles.errorText}>{sverigelistanError}</Text>
            ) : !hasSupabase ? (
              <Text style={styles.helperText}>Supabase är inte konfigurerat, så Sverigelistan kan inte visas just nu.</Text>
            ) : !currentEntry ? (
              <Text style={styles.helperText}>Det finns ännu ingen Sverigelistan-post för den här löparen.</Text>
            ) : (
              <>
                <View style={styles.rankSummaryGrid}>
                  <View style={[styles.rankSummaryCard, styles.rankSummaryCardWide]}>
                    <Text style={styles.rankSummaryLabel}>Plac. (förra mån.)</Text>
                    <View style={styles.rankSummaryValueRow}>
                      <View style={styles.rankSummaryValueWrap}>
                        <Text style={styles.rankSummaryValue}>{currentEntry.Rank}</Text>
                        <Text style={styles.rankSummaryComparison}>({previousEntry ? previousEntry.Rank : '-'})</Text>
                      </View>
                      {renderTrendBadge(trendDirection)}
                    </View>
                  </View>

                  <View style={[styles.rankSummaryCard, styles.rankSummaryCardWide]}>
                    <Text style={styles.rankSummaryLabel}>{className ? `Plac. ${className}` : 'Plac. klass'}</Text>
                    <View style={styles.rankSummaryValueWrap}>
                      <Text style={styles.rankSummaryValue}>{currentClassRank ?? '—'}</Text>
                      {previousClassRank ? <Text style={styles.rankSummaryComparison}>({previousClassRank})</Text> : null}
                    </View>
                  </View>

                  <View style={[styles.rankSummaryCard, styles.rankSummaryCardNarrow]}>
                    <Text style={styles.rankSummaryLabel}>Poäng</Text>
                    <View style={styles.rankSummaryValueWrap}>
                      <Text style={styles.rankSummaryValue}>{formatPoints(currentEntry.Points)}</Text>
                    </View>
                  </View>
                </View>

                {showSverigelistanTrend ? (
                  <>
                    <View style={styles.trendHeaderRow}>
                      <Text style={styles.trendHeaderTitle}>Placering senaste månaderna</Text>
                      <Text style={styles.trendToggleLink}>&lt;&lt; Visa mindre</Text>
                    </View>
                    <RankingTrendChart classPoints={classTrend} points={monthlyTrend} showTitle={false} />
                  </>
                ) : (
                  <Text style={styles.trendToggleLink}>Visa mer &gt;&gt;</Text>
                )}
              </>
            )}
          </Pressable>
        ) : null}

        {user ? <UpcomingStartsPanel error={startsError} isLoading={isLoadingStarts} sections={startsSections} /> : null}

        {user ? (
          <FavoritesAndResultsPanel
            availableYears={availableYears}
            favoriteEvents={favoriteEvents}
            onClearFavorites={clearAllFavorites}
            onOpenAnalysis={handleOpenAnalysis}
            onOpenResultList={handleOpenResultList}
            onOpenSplitTimes={handleOpenSplitTimes}
            onRemoveFavorite={removeFavorite}
            resultsError={resultsError}
            resultsFilter={resultsFilter}
            resultsLoading={isLoadingResults}
            resultsSections={resultsSections}
            resultsYear={resultsYear}
            setResultsFilter={setResultsFilter}
            setResultsYear={setResultsYear}
          />
        ) : null}

        <PublishedListModal onClose={() => setActiveResultListModal(null)} onOpenAnalysis={handleOpenAnalysis} state={activeResultListModal} />
        <AnalysisModal onClose={() => setActiveAnalysisModal(null)} state={activeAnalysisModal} />
        <SplitTimesModal onClose={() => setActiveSplitTimesModal(null)} onOpenAnalysis={handleOpenAnalysis} state={activeSplitTimesModal} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function renderTrendBadge(direction: SverigelistanTrendDirection) {
  if (direction === 'unknown') {
    return null;
  }

  const iconName = direction === 'better' ? 'arrow-up' : direction === 'worse' ? 'arrow-down' : 'arrow-forward';
  const iconColor = direction === 'better' ? colors.primary : direction === 'worse' ? colors.error : colors.textSecondary;

  return (
    <View style={styles.trendBadge}>
      <Ionicons color={iconColor} name={iconName} size={22} />
    </View>
  );
}

function formatPoints(points: number) {
  return points.toLocaleString('sv-SE', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function formatUpdatedDate(updated: string) {
  const parsed = new Date(updated);
  if (Number.isNaN(parsed.getTime())) {
    return updated;
  }

  return parsed.toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
  },
  profileHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
    marginRight: spacing.xs,
  },
  profileHeaderCopy: {
    flex: 1,
    gap: 2,
    paddingRight: spacing.md,
  },
  profileName: {
    ...typography.screenTitle,
    color: colors.primaryDeep,
  },
  profileClub: {
    ...typography.caption,
    color: colors.primaryDeep,
    marginLeft: 1,
  },
  panelTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  checkboxRow: {
    flexDirection: 'row',
  },
  rememberMeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rememberMeBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  rememberMeBoxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 20,
  },
  errorText: {
    ...typography.captionStrong,
    color: colors.error,
  },
  statusBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusBadgeText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
  },
  infoGrid: {
    gap: spacing.sm,
  },
  infoRow: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
    gap: spacing.xs,
    padding: spacing.md,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  infoValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  favoritesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rankSummaryCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    flex: 1,
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 6,
  },
  rankSummaryCardNarrow: {
    flex: 0.82,
  },
  rankSummaryCardWide: {
    flex: 1.08,
  },
  rankSummaryGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  rankSummaryLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 13,
    textAlign: 'center',
    width: '100%',
  },
  rankSummaryValue: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
  rankSummaryComparison: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  rankSummaryValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
    width: '100%',
  },
  rankSummaryValueWrap: {
    alignItems: 'baseline',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
    justifyContent: 'center',
  },
  sverigelistanHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sverigelistanUpdated: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 13,
  },
  trendBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
  },
  favoriteCountBadge: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 34,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  favoriteCountText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
  },
  favoriteList: {
    gap: spacing.sm,
  },
  favoriteRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  favoriteLink: {
    flex: 1,
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  favoriteLinkPressed: {
    opacity: 0.85,
  },
  favoriteName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  favoriteMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  favoriteRemoveButton: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  trendHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trendHeaderTitle: {
    ...typography.captionStrong,
    color: colors.textPrimary,
  },
  trendToggleLink: {
    ...typography.captionStrong,
    color: colors.textMuted,
    alignSelf: 'flex-end',
    paddingRight: 2,
    paddingVertical: 2,
  },
});



