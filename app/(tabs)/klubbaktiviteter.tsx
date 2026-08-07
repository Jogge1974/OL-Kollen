import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

  const { error, isLoading, sections } = useOrganisationActivities(organisationId);

  const totalCount = sections ? sections.club.length + sections.district.length + sections.soft.length : 0;
  const heroChips =
    sections && !isLoading && !error
      ? [{ icon: 'albums-outline' as const, label: 'Aktiviteter', value: String(totalCount) }]
      : undefined;

  const openActivity = (activity: ClubActivity) => router.push({ params: { id: activity.id }, pathname: '/klubbaktivitet/[id]' });

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

    if (!sections) {
      return null;
    }

    return (
      <>
        <ActivityGroup
          activities={sections.club}
          colors={colors}
          onOpen={openActivity}
          styles={styles}
          title={`Aktiviteter ${sections.clubName ?? clubName ?? ''}`.trim()}
        />

        {sections.districtName ? (
          <ActivityGroup
            activities={sections.district}
            colors={colors}
            onOpen={openActivity}
            styles={styles}
            title={`Aktiviteter ${sections.districtName}`}
          />
        ) : null}

        <ActivityGroup activities={sections.soft} colors={colors} onOpen={openActivity} styles={styles} title="Aktiviteter SOFT" />
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
          topRightContent={
            organisationId ? (
              <Pressable
                onPress={() => void Linking.openURL(`https://eventor.orientering.se/Activities?organisationId=${organisationId}`)}
                style={styles.eventorBadge}
              >
                <Ionicons color={colors.heroText} name="open-outline" size={13} />
                <Text style={styles.eventorBadgeText}>Alla i Eventor</Text>
              </Pressable>
            ) : undefined
          }
        />

        {renderBody()}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivityGroup({
  activities,
  colors,
  onOpen,
  styles,
  title,
}: {
  activities: ClubActivity[];
  colors: ColorPalette;
  onOpen: (activity: ClubActivity) => void;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupHeaderText}>{title}</Text>
        <View style={styles.groupHeaderLine} />
      </View>
      {activities.length > 0 ? (
        <View style={styles.list}>
          {activities.map((activity) => (
            <ActivityRow activity={activity} colors={colors} key={activity.id} onPress={() => onOpen(activity)} styles={styles} />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyGroupText}>Inga aktiviteter för tillfället.</Text>
      )}
    </View>
  );
}

function ActivityRow({
  activity,
  colors,
  onPress,
  styles,
}: {
  activity: ClubActivity;
  colors: ColorPalette;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const deadline = describeDeadline(activity.registrationDeadlineIso);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}>
      <View style={styles.cardBody}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {activity.name}
        </Text>

        <View style={styles.cardMetaRow}>
          {deadline ? (
            deadline.urgent ? (
              <View style={styles.deadlineBadge}>
                <Ionicons color={colors.error} name="alarm-outline" size={12} />
                <Text style={styles.deadlineBadgeText}>{deadline.label}</Text>
              </View>
            ) : (
              <View style={styles.cardMetaItem}>
                <Ionicons color={colors.primary} name="time-outline" size={14} />
                <Text style={styles.cardMetaText}>{deadline.label}</Text>
              </View>
            )
          ) : null}
          <View style={styles.cardMetaItem}>
            <Ionicons color={colors.primary} name="people-outline" size={14} />
            <Text style={styles.cardMetaText}>{activity.registrationCount} anm.</Text>
          </View>
        </View>
      </View>

      <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
    </Pressable>
  );
}

type DeadlineInfo = { label: string; tone: 'open' | 'closed'; urgent: boolean };

function describeDeadline(iso: string | null): DeadlineInfo | null {
  if (!iso) {
    return null;
  }

  const deadlineTime = new Date(iso).getTime();
  if (!Number.isFinite(deadlineTime)) {
    return null;
  }

  if (deadlineTime < Date.now()) {
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

  if (days <= 10) {
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
    cardMetaTextMuted: {
      color: colors.textMuted,
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
    emptyGroupText: {
      ...typography.body,
      color: colors.textSecondary,
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
    group: {
      gap: spacing.sm,
    },
    groupHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    groupHeaderLine: {
      backgroundColor: colors.border,
      flex: 1,
      height: 1,
    },
    groupHeaderText: {
      ...typography.captionStrong,
      color: colors.primary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
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
    safeArea: {
      backgroundColor: colors.background,
      flex: 1,
    },
  });
}
