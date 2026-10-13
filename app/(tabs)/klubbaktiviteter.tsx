import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/src/components/EmptyState';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { AppButton } from '@/src/components/AppButton';
import { ACTIVITIES_API_ORG_ID, isActivityExpired } from '@/src/api/eventorActivities';
import { useOrganisationActivities } from '@/src/hooks/useOrganisationActivities';
import { useAuthStore } from '@/src/store/authStore';
import { openExternalLink } from '@/src/store/externalLinkStore';
import { ColorPalette, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { ClubActivity } from '@/src/types/eventorActivities';

export default function KlubbaktiviteterScreen() {
  const { colors, isDark, themeName } = useTheme();
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  const styles = React.useMemo(() => createStyles(colors, isDark, isSoft), [colors, isDark, isSoft]);

  const user = useAuthStore((state) => state.user);
  const organisationId = user?.organisationIds[0] ?? null;
  const clubName = user?.organisationName ?? null;
  const canFetchActivities = organisationId === ACTIVITIES_API_ORG_ID;

  const { activities, availableYears, error, isLoading, reload, selectedYear, setSelectedYear } = useOrganisationActivities(
    canFetchActivities ? organisationId : null,
  );
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    reload();
    setIsRefreshing(false);
  }, [reload]);

  const activeCount = activities.filter((activity) => !isActivityExpired(activity)).length;
  const heroChips =
    user && organisationId && canFetchActivities && !isLoading && !error
      ? [
          { icon: 'albums-outline' as const, label: 'Aktiviteter', value: String(activities.length) },
          { icon: 'flash-outline' as const, label: 'Aktiva', value: String(activeCount) },
        ]
      : undefined;

  const openActivity = (activity: ClubActivity) =>
    router.push({ params: { id: activity.id, year: String(selectedYear) }, pathname: '/klubbaktivitet/[id]' });

  const renderBody = () => {
    if (!user) {
      return  <AppButton icon="person-add-outline" label="Välj användare i Inställningar" onPress={() => router.push('/settings')} />
    }

    if (!organisationId) {
      return (
        <EmptyState
          description="Ingen klubb hittades på ditt konto i Eventor, så några klubbaktiviteter kan inte visas."
          title="Ingen klubb"
        />
      );
    }

    if (!canFetchActivities) {
      return (
        <View style={styles.restrictedBox}>
          <EmptyState description="Klubbaktiviteter kan bara visas i appen för OK Tyr just nu. Öppna din klubbs aktiviteter i Eventor istället. Vill du visa din klubbs aktiviteter här behöver din klubb ansluta till Kontrollen. Skicka ett meddelande i Inställningar/Om Kontrollen för att höra vad som krävs." title="Aktiviteter kan inte visas" />
          <AppButton
            label="Öppna i Eventor"
            onPress={() => openExternalLink(`https://eventor.orientering.se/Activities?organisationId=${organisationId}`)}
          />
        </View>
      );
    }

    if (isLoading) {
      return (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Hämtar aktiviteter…</Text>
        </View>
      );
    }

    if (error) {
      return <EmptyState description={error} title="Kunde inte hämta aktiviteter" />;
    }

    if (activities.length === 0) {
      return <EmptyState description="Det finns inga registrerade aktiviteter för det valda året." title="Inga aktiviteter" />;
    }

    const activeActivities = activities.filter((activity) => !isActivityExpired(activity));
    const pastActivities = activities.filter((activity) => isActivityExpired(activity));

    return (
      <>
        {activeActivities.length > 0 ? (
          <View style={styles.list}>
            {activeActivities.map((activity) => (
              <ActivityRow activity={activity} colors={colors} key={activity.id} onPress={() => openActivity(activity)} styles={styles} />
            ))}
          </View>
        ) : (
          <Text style={styles.noActiveText}>Inga aktiva aktiviteter just nu.</Text>
        )}

        {pastActivities.length > 0 ? (
          <View style={styles.pastSection}>
            <View style={styles.pastHeader}>
              <Text style={styles.pastHeaderText}>Tidigare aktiviteter</Text>
              <View style={styles.pastHeaderLine} />
            </View>
            <View style={styles.list}>
              {pastActivities.map((activity) => (
                <ActivityRow activity={activity} colors={colors} isPast key={activity.id} onPress={() => openActivity(activity)} styles={styles} />
              ))}
            </View>
          </View>
        ) : null}
      </>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          canFetchActivities ? <RefreshControl onRefresh={() => void handleRefresh()} refreshing={isRefreshing} tintColor={colors.primary} /> : undefined
        }
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeroHeader
          chips={heroChips}
          eyebrow="KLUBBEN"
          subtitle={clubName ?? 'Aktiviteter och händelser i din klubb'}
          title="Klubbaktiviteter"
          topRightContent={
            organisationId ? (
              <Pressable
                onPress={() => openExternalLink(`https://eventor.orientering.se/Activities?organisationId=${organisationId}`)}
                style={styles.eventorBadge}
              >
                <Ionicons color={colors.heroText} name="open-outline" size={13} />
                <Text style={styles.eventorBadgeText}>Öppna i Eventor</Text>
              </Pressable>
            ) : undefined
          }
        />

        {user && organisationId && canFetchActivities ? (
          <ScrollView contentContainerStyle={styles.yearRow} horizontal showsHorizontalScrollIndicator={false}>
            {availableYears.map((year) => (
              <Pressable
                key={year}
                onPress={() => setSelectedYear(year)}
                style={[styles.yearChip, selectedYear === year ? styles.yearChipActive : null]}
              >
                <Text style={[styles.yearChipText, selectedYear === year ? styles.yearChipTextActive : null]}>{year}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {user && organisationId && canFetchActivities ? (
          <AppButton
            label="Till alla aktiviteter i Eventor"
            onPress={() => openExternalLink(`https://eventor.orientering.se/Activities?organisationId=${organisationId}`)}
          />
        ) : null}

        {renderBody()}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivityRow({
  activity,
  colors,
  isPast = false,
  onPress,
  styles,
}: {
  activity: ClubActivity;
  colors: ColorPalette;
  isPast?: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const deadline = describeDeadline(activity.registrationDeadline);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, isPast ? styles.cardPast : null, pressed ? styles.cardPressed : null]}>
      <View style={styles.cardBody}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {activity.name}
        </Text>

        <View style={styles.cardMetaRow}>
          {deadline.tone === 'closed' ? (
            <View style={styles.closedBadge}>
              <Ionicons color="#fff" name="lock-closed" size={12} />
              <Text style={styles.closedBadgeText}>{deadline.label}</Text>
            </View>
          ) : deadline.urgent ? (
            <View style={styles.deadlineBadge}>
              <Ionicons color={colors.error} name="alarm-outline" size={12} />
              <Text style={styles.deadlineBadgeText}>{deadline.label}</Text>
            </View>
          ) : (
            <View style={styles.cardMetaItem}>
              <Ionicons color={colors.primary} name="time-outline" size={14} />
              <Text style={styles.cardMetaText}>{deadline.label}</Text>
            </View>
          )}
          <View style={styles.cardMetaItem}>
            <Ionicons color={colors.primary} name="people-outline" size={14} />
            <Text style={styles.cardMetaText}>{activity.registrationCount} anmälda</Text>
          </View>
        </View>
      </View>

      <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
    </Pressable>
  );
}

type DeadlineInfo = { label: string; tone: 'open' | 'closed'; urgent: boolean };

function describeDeadline(deadline: string | null): DeadlineInfo {
  if (!deadline) {
    return { label: 'Ingen anmälningstid', tone: 'open', urgent: false };
  }

  const deadlineTime = new Date(deadline).getTime();
  if (!Number.isFinite(deadlineTime)) {
    return { label: 'Ingen anmälningstid', tone: 'open', urgent: false };
  }

  const now = Date.now();
  if (deadlineTime < now) {
    return { label: 'Anmälan stängd', tone: 'closed', urgent: true };
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDeadlineDay = new Date(deadlineTime);
  startOfDeadlineDay.setHours(0, 0, 0, 0);
  const days = Math.round((startOfDeadlineDay.getTime() - startOfToday.getTime()) / 86400000);

  if (days <= 0) {
    return { label: 'Stänger idag', tone: 'open', urgent: true };
  }

  if (days === 1) {
    return { label: '1 dag kvar', tone: 'open', urgent: true };
  }

  if (days <= 3) {
    return { label: `${days} dagar kvar`, tone: 'open', urgent: true };
  }

  return { label: `Anmälan om ${days} dagar`, tone: 'open', urgent: false };
}

function createStyles(colors: ColorPalette, isDark: boolean, isSoft: boolean) {
  return StyleSheet.create({
    card: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.md,
    },
    cardBody: {
      flex: 1,
      gap: spacing.xs,
    },
    cardMetaItem: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
    },
    cardMetaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    cardMetaText: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    cardPast: {
      backgroundColor: isDark ? 'rgba(224, 96, 96, 0.08)' : 'rgba(183, 59, 59, 0.05)',
      borderColor: isDark ? 'rgba(224, 96, 96, 0.35)' : 'rgba(183, 59, 59, 0.30)',
    },
    cardPressed: {
      opacity: 0.85,
    },
    cardTitle: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
    },
    closedBadge: {
      alignItems: 'center',
      backgroundColor: colors.error,
      borderRadius: 999,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    closedBadgeText: {
      ...typography.captionStrong,
      color: '#fff',
      fontSize: 11,
    },
    content: {
      gap: spacing.lg,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    deadlineBadge: {
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(224, 96, 96, 0.15)' : 'rgba(183, 59, 59, 0.10)',
      borderColor: isDark ? 'rgba(224, 96, 96, 0.50)' : 'rgba(183, 59, 59, 0.40)',
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    deadlineBadgeText: {
      ...typography.captionStrong,
      color: colors.error,
      fontSize: 11,
    },
    eventorBadge: {
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.16)',
      borderColor: 'rgba(255, 255, 255, 0.45)',
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    eventorBadgeText: {
      ...typography.captionStrong,
      color: colors.heroText,
      fontSize: 12,
    },
    list: {
      gap: spacing.sm,
    },
    loadingBox: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
    },
    loadingText: {
      ...typography.body,
      color: colors.textSecondary,
    },
    noActiveText: {
      ...typography.body,
      color: colors.textSecondary,
    },
    pastHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    pastHeaderLine: {
      backgroundColor: colors.border,
      flex: 1,
      height: 1,
    },
    pastHeaderText: {
      ...typography.captionStrong,
      color: colors.error,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    pastSection: {
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    restrictedBox: {
      gap: spacing.md,
    },
    safeArea: {
      backgroundColor: colors.background,
      flex: 1,
    },
    yearChip: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    yearChipActive: {
      backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
      borderColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
    },
    yearChipText: {
      color: colors.textPrimary,
      fontFamily: typography.bodyStrong.fontFamily,
      fontSize: 14,
      lineHeight: 17,
    },
    yearChipTextActive: {
      color: colors.heroText,
    },
    yearRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingBottom: 2,
    },
  });
}
