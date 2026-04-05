import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { AppTextField } from '@/src/components/AppTextField';
import { RankingTrendChart } from '@/src/components/RankingTrendChart';
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
  const [showLoginForm, setShowLoginForm] = React.useState(false);
  const { rememberMe, setRememberMe } = useRememberMe(true);

  const error = useAuthStore((state) => state.error);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const rememberedUsername = useAuthStore((state) => state.rememberedUsername);
  const signInWithEventor = useAuthStore((state) => state.signInWithEventor);
  const user = useAuthStore((state) => state.user);
  const hydrateSession = useAuthStore((state) => state.hydrateSession);

  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
  const hydratePreferences = usePreferencesStore((state) => state.hydratePreferences);
  const removeFavorite = usePreferencesStore((state) => state.removeFavorite);
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

  const handleLogin = async () => {
    try {
      await signInWithEventor({ password, rememberMe, username });
      setPassword('');
      setShowLoginForm(false);
    } catch {
      // Store state already exposes a clean error message.
    }
  };

  React.useEffect(() => {
    if (!user && rememberedUsername && !username) {
      setUsername(rememberedUsername);
    }
  }, [rememberedUsername, user, username]);

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);

    try {
      await Promise.all([hydrateSession(), hydratePreferences(), refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [hydratePreferences, hydrateSession, refetch]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl onRefresh={() => void handleRefresh()} refreshing={isRefreshing} tintColor={colors.primary} />}
      >
        <View style={styles.headerCard}>
          <Text style={styles.title}>Min sida</Text>
          <Text style={styles.subtitle}>Här hanterar du Eventor-inloggning och ser dina favoritmarkerade tävlingar.</Text>
        </View>

        {!user ? (
          <View style={styles.panel}>
            {!showLoginForm ? (
              <AppButton label="Logga in" onPress={() => setShowLoginForm(true)} />
            ) : (
              <>
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

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <AppButton
                  disabled={!username.trim() || !password.trim()}
                  label="Logga in"
                  loading={isSubmitting}
                  onPress={() => void handleLogin()}
                />

                <AppButton label="Avbryt" onPress={() => setShowLoginForm(false)} variant="secondary" />

                <Text style={styles.helperText}>
                  Inloggningen använder Eventors dokumenterade authenticatePerson-endpoint. Lyckad inloggning sparas lokalt om du markerar Kom ihåg mig.
                </Text>
              </>
            )}
          </View>
        ) : (
          <View style={styles.panel}>
            <View style={styles.loggedInHeader}>
              <View style={styles.loggedInCopy}>
                <Text style={styles.loggedInName}>{user.fullName ?? 'Inloggad användare'}</Text>
                <Text style={styles.loggedInMeta}>Accessnivå: {user.accessLevel}</Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>Eventor</Text>
              </View>
            </View>

            <View style={styles.infoGrid}>
              <ProfileRow label="PersonId" value={user.personId ?? 'Saknas i svaret'} />
              <ProfileRow label="Födelsedatum" value={user.birthDate ?? 'Ej tillgängligt'} />
              <ProfileRow label="E-post" value={user.email ?? 'Ej tillgängligt'} />
              <ProfileRow label="Klubb" value={user.organisationName ?? (user.organisationIds[0] ?? 'Ej tillgängligt')} />
              <ProfileRow label="Användarnamn" value={user.username} />
            </View>
          </View>
        )}

        {user ? (
          <View style={styles.panel}>
            <View style={styles.sverigelistanHeader}>
              <Text style={styles.panelTitle}>Sverigelistan</Text>
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
                  <View style={styles.rankSummaryCard}>
                    <Text style={styles.rankSummaryLabel}>Plac. (förra mån.)</Text>
                    <View style={styles.rankSummaryValueRow}>
                      <View style={styles.rankSummaryValueWrap}>
                        <Text style={styles.rankSummaryValue}>{currentEntry.Rank}</Text>
                        {previousEntry ? <Text style={styles.rankSummaryComparison}>({previousEntry.Rank})</Text> : null}
                      </View>
                      {renderTrendBadge(trendDirection)}
                    </View>
                  </View>

                  <View style={styles.rankSummaryCard}>
                    <Text style={styles.rankSummaryLabel}>{className ? `Plac. ${className}` : 'Plac. klass'}</Text>
                    <View style={styles.rankSummaryValueWrap}>
                      <Text style={styles.rankSummaryValue}>{currentClassRank ?? '—'}</Text>
                      {previousClassRank ? <Text style={styles.rankSummaryComparison}>({previousClassRank})</Text> : null}
                    </View>
                  </View>

                  <View style={styles.rankSummaryCard}>
                    <Text style={styles.rankSummaryLabel}>Poäng (förra mån.)</Text>
                    <View style={styles.rankSummaryValueWrap}>
                      <Text style={styles.rankSummaryValue}>{formatPoints(currentEntry.Points)}</Text>
                      {previousEntry ? <Text style={styles.rankSummaryComparison}>({formatPoints(previousEntry.Points)})</Text> : null}
                    </View>
                  </View>
                </View>

                <Text style={styles.helperText}>Senast uppdaterad {formatUpdatedDate(currentEntry.Updated)}.</Text>
                <RankingTrendChart classPoints={classTrend} points={monthlyTrend} />
              </>
            )}
          </View>
        ) : null}

        {user ? (
          <View style={styles.panel}>
            <View style={styles.favoritesHeader}>
              <Text style={styles.panelTitle}>Favoriter</Text>
              <View style={styles.favoriteCountBadge}>
                <Text style={styles.favoriteCountText}>{favoriteEvents.length}</Text>
              </View>
            </View>

            {favoriteEvents.length === 0 ? (
              <Text style={styles.helperText}>Du har inte favoritmarkerat någon tävling ännu.</Text>
            ) : (
              <View style={styles.favoriteList}>
                {favoriteEvents.map((event) => (
                  <View key={event.id} style={styles.favoriteRow}>
                    <Pressable
                      onPress={() => router.push({ params: { id: event.id }, pathname: '/event/[id]' })}
                      style={({ pressed }) => [styles.favoriteLink, pressed ? styles.favoriteLinkPressed : null]}
                    >
                      <Text numberOfLines={2} style={styles.favoriteName}>
                        {event.name}
                      </Text>
                      <Text style={styles.favoriteMeta}>{[event.dateLabel, event.classificationLabel].filter(Boolean).join(' • ')}</Text>
                    </Pressable>

                    <Pressable onPress={() => void removeFavorite(event.id)} style={styles.favoriteRemoveButton}>
                      <Ionicons color={colors.primaryDeep} name="star" size={16} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
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
    paddingHorizontal: 12,
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
    gap: spacing.md,
    padding: spacing.md,
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
  loggedInHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  loggedInCopy: {
    flex: 1,
    gap: 2,
  },
  loggedInName: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  loggedInMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'capitalize',
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
    flex: 1,
    gap: 4,
    padding: spacing.sm,
  },
  rankSummaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rankSummaryLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  rankSummaryValue: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  rankSummaryComparison: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  rankSummaryValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  rankSummaryValueWrap: {
    alignItems: 'baseline',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
  },
  sverigelistanHeader: {
    alignItems: 'flex-start',
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
});
