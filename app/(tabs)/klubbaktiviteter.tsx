import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/src/components/EmptyState';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { useOrganisationActivities } from '@/src/hooks/useOrganisationActivities';
import { useAuthStore } from '@/src/store/authStore';
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

  const { activities, availableYears, error, isLoading, selectedYear, setSelectedYear } = useOrganisationActivities(organisationId);

  const totalCount = activities.length;
  const activeCount = activities.filter((activity) => !isActivityExpired(activity)).length;
  const heroChips =
    user && organisationId && !isLoading && !error
      ? [
          { icon: 'albums-outline' as const, label: 'Aktiviteter', value: String(totalCount) },
          { icon: 'flash-outline' as const, label: 'Aktiva', value: String(activeCount) },
        ]
      : undefined;

  const renderBody = () => {
    if (!user) {
      return <EmptyState description="Logga in för att se din klubbs aktiviteter." title="Inte inloggad" />;
    }

    if (!organisationId) {
      return (
        <EmptyState
          description="Ingen klubb hittades på ditt konto i Eventor, så några klubbaktiviteter kan inte visas."
          title="Ingen klubb"
        />
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

    const openActivity = (activity: ClubActivity) =>
      router.push({ params: { id: activity.id, year: String(selectedYear) }, pathname: '/klubbaktivitet/[id]' });
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeroHeader
          chips={heroChips}
          eyebrow="KLUBBEN"
          subtitle={clubName ?? 'Aktiviteter och händelser i din klubb'}
          title="Klubbaktiviteter"
        />

        {user && organisationId ? (
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
          <View style={styles.cardMetaItem}>
            <Ionicons color={deadline.tone === 'closed' ? colors.textMuted : colors.primary} name="time-outline" size={14} />
            <Text style={[styles.cardMetaText, deadline.tone === 'closed' ? styles.cardMetaTextMuted : null]}>{deadline.label}</Text>
          </View>
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

type DeadlineInfo = { label: string; tone: 'open' | 'closed' };

function isActivityExpired(activity: ClubActivity): boolean {
  if (!activity.visibleTo) {
    return false;
  }

  const visibleTo = new Date(activity.visibleTo).getTime();
  return Number.isFinite(visibleTo) && visibleTo < Date.now();
}

function describeDeadline(deadline: string | null): DeadlineInfo {
  if (!deadline) {
    return { label: 'Ingen anmälningstid', tone: 'open' };
  }

  const deadlineTime = new Date(deadline).getTime();
  if (!Number.isFinite(deadlineTime)) {
    return { label: 'Ingen anmälningstid', tone: 'open' };
  }

  const now = Date.now();
  if (deadlineTime < now) {
    return { label: 'Anmälan stängd', tone: 'closed' };
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDeadlineDay = new Date(deadlineTime);
  startOfDeadlineDay.setHours(0, 0, 0, 0);
  const days = Math.round((startOfDeadlineDay.getTime() - startOfToday.getTime()) / 86400000);

  if (days <= 0) {
    return { label: 'Anmälan stänger idag', tone: 'open' };
  }

  if (days === 1) {
    return { label: '1 dag kvar till anmälan går ut', tone: 'open' };
  }

  return { label: `${days} dagar kvar till anmälan går ut`, tone: 'open' };
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
    cardMetaTextMuted: {
      color: colors.textMuted,
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
    content: {
      gap: spacing.lg,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
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
