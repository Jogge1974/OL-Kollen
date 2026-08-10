import * as React from 'react';

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { EmptyState } from '@/src/components/EmptyState';
import { AnalysisModal, AnalysisModalState, openEventAnalysisModal } from '@/src/components/AnalysisModal';
import { AnnouncementBanner } from '@/src/components/AnnouncementBanner';
import { AnnouncementsModal } from '@/src/components/AnnouncementsModal';
import { EventSummaryCard } from '@/src/components/EventSummaryCard';
import { LoadingState } from '@/src/components/LoadingState';
import { PersonActivitySectionList } from '@/src/components/PersonActivitySectionList';
import { PublishedListModal, PublishedListModalState, openPublishedListModal } from '@/src/components/PublishedListModal';
import { SplitTimesModal, SplitTimesModalState, openEventSplitTimesModal } from '@/src/components/SplitTimesModal';
import { UpcomingStartsPanel } from '@/src/components/UpcomingStartsPanel';
import { fetchEventorEvents } from '@/src/api/eventorApi';
import { useAnnouncements } from '@/src/hooks/useAnnouncements';
import { useOrganisationActivities } from '@/src/hooks/useOrganisationActivities';
import { usePersonEventorLists } from '@/src/hooks/usePersonEventorLists';
import { useAuthStore } from '@/src/store/authStore';
import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventItem } from '@/src/types/eventor';

export default function HomeScreen() {
  const pathname = usePathname();
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const user = useAuthStore((state) => state.user);
  const { allAnnouncements, announcements, dismiss: dismissAnnouncement } = useAnnouncements();
  const { sections: activitySections, reload: reloadActivities } = useOrganisationActivities(user?.organisationIds[0] ?? null);
  const [showAnnouncements, setShowAnnouncements] = React.useState(false);
  const [todayEvents, setTodayEvents] = React.useState<EventItem[]>([]);
  const [todayEventsError, setTodayEventsError] = React.useState<string | null>(null);
  const [isLoadingTodayEvents, setIsLoadingTodayEvents] = React.useState(true);
  const [activeAnalysisModal, setActiveAnalysisModal] = React.useState<AnalysisModalState | null>(null);
  const [activeResultListModal, setActiveResultListModal] = React.useState<PublishedListModalState | null>(null);
  const [activeSplitTimesModal, setActiveSplitTimesModal] = React.useState<SplitTimesModalState | null>(null);
  const {
    isLoadingResults,
    isLoadingStarts,
    refetch: refetchPersonLists,
    resultsError,
    resultsSections,
    startsError,
    startsSections,
  } = usePersonEventorLists({
    initialFilter: 'all',
    personId: user?.personId ?? null,
  });

  const [todayIso, setTodayIso] = React.useState(() => getLocalIsoDate());
  const exactTodayEvents = React.useMemo(() => todayEvents.filter((event) => event.startDate === todayIso), [todayEvents, todayIso]);
  const nationalTodayEvents = React.useMemo(
    () => exactTodayEvents.filter((event) => [0, 1, 2].includes(event.classificationId)).sort(sortEventsByName),
    [exactTodayEvents],
  );
  const latestPastEvents = React.useMemo(() => resultsSections.slice(0, 2), [resultsSections]);

  const closingSoon = React.useMemo(() => {
    if (!activitySections) {
      return { count: 0, total: 0 };
    }
    const all = [...activitySections.club, ...activitySections.district, ...activitySections.soft];
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    let count = 0;
    for (const activity of all) {
      if (!activity.registrationDeadlineIso) {
        continue;
      }
      const deadline = new Date(activity.registrationDeadlineIso).getTime();
      if (!Number.isFinite(deadline) || deadline < Date.now()) {
        continue;
      }
      const startOfDeadlineDay = new Date(deadline);
      startOfDeadlineDay.setHours(0, 0, 0, 0);
      const days = Math.round((startOfDeadlineDay.getTime() - startOfToday.getTime()) / 86400000);
      if (days < 5) {
        count += 1;
      }
    }
    return { count, total: all.length };
  }, [activitySections]);
  const laterCount = closingSoon.total - closingSoon.count;

  const handleOpenAnalysis = React.useCallback((eventId: string, classLabel: string, personId?: string | null) => {
    void openEventAnalysisModal(eventId, setActiveAnalysisModal, classLabel, personId ?? null);
  }, []);

  const loadTodayEvents = React.useCallback(async () => {
    const currentToday = getLocalIsoDate();
    const currentTomorrow = getLocalIsoDate(1);
    setTodayIso(currentToday);
    setIsLoadingTodayEvents(true);
    setTodayEventsError(null);

    try {
      const events = await fetchEventorEvents({
        classificationIds: [0, 1, 2],
        districtIds: [],
        fromDate: currentToday,
        toDate: currentTomorrow,
      });

      setTodayEvents(events.filter((event) => event.startDate === currentToday).sort(sortEventsAsc));
    } catch (error) {
      setTodayEvents([]);
      setTodayEventsError(error instanceof Error ? error.message : 'Okänt fel vid hämtning av dagens tävlingar.');
    } finally {
      setIsLoadingTodayEvents(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadTodayEvents();
      reloadActivities();
    }, [loadTodayEvents, reloadActivities]),
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void loadTodayEvents();
      }
    });

    return () => subscription.remove();
  }, [loadTodayEvents]);

  const refreshAll = React.useCallback(async () => {
    const currentToday = getLocalIsoDate();
    const currentTomorrow = getLocalIsoDate(1);
    setTodayIso(currentToday);
    setIsLoadingTodayEvents(true);
    setTodayEventsError(null);
    reloadActivities(true);

    try {
      await Promise.all([
        fetchEventorEvents({
          classificationIds: [0, 1, 2],
          districtIds: [],
          fromDate: currentToday,
          toDate: currentTomorrow,
        }).then((events) => setTodayEvents(events.filter((event) => event.startDate === currentToday).sort(sortEventsAsc))),
        user?.personId ? refetchPersonLists() : Promise.resolve(),
      ]);
    } catch (error) {
      setTodayEvents([]);
      setTodayEventsError(error instanceof Error ? error.message : 'Okänt fel vid hämtning av dagens tävlingar.');
    } finally {
      setIsLoadingTodayEvents(false);
    }
  }, [reloadActivities, refetchPersonLists, user?.personId]);

  const greetingName = user?.firstName ?? user?.fullName ?? 'orienterare';

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl colors={[colors.primary]} refreshing={isLoadingTodayEvents} tintColor={colors.primary} onRefresh={() => void refreshAll()} />}
      >
        {announcements.map((item) => (
          <AnnouncementBanner key={item.id} announcement={item} onDismiss={dismissAnnouncement} />
        ))}

        <LinearGradient colors={[colors.heroTop, colors.primary, colors.backgroundDeep]} style={styles.hero}>
          <View style={styles.sunGlow} />
          <View style={styles.leafGlowLeft} />
          <View style={styles.leafGlowRight} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text numberOfLines={1} style={styles.heroEyebrow}>{user ? `Hej ${greetingName}` : 'Orientering'}</Text>
              <Text adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1} style={styles.heroTitle}>Kontrollen</Text>
              <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.heroDescription}>
                Ett komplement till Eventor.
              </Text>
            </View>
            {user?.accessLevel ? <View style={styles.accessPill}><Text style={styles.accessPillText}>{formatAccessLevel(user.accessLevel)}</Text></View> : null}
            {allAnnouncements.length > 0 ? (
              <Pressable accessibilityLabel="Visa meddelanden" hitSlop={8} onPress={() => setShowAnnouncements(true)} style={styles.bellButton}>
                <MaterialCommunityIcons color={colors.heroText} name="message-text-outline" size={22} />
                {announcements.length > 0 ? (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>{announcements.length}</Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}
          </View>
        </LinearGradient>

        <View style={styles.shortcutSection}>
          <View style={styles.shortcutGrid}>
            <ShortcutCard icon="calendar-outline" label="Kalender" onPress={() => router.push('/calendar')} />
            <ShortcutCard icon="trophy-outline" label="Sverigelistan" onPress={() => router.push('/sverigelista')} />
            <ShortcutCard icon="person-outline" label="Min sida" onPress={() => router.push('/profile')} />
          </View>
        </View>

        {closingSoon.count > 0 ? (
          <Pressable onPress={() => router.push('/klubbaktiviteter')} style={styles.activityAlertCard}>
            <View style={styles.activityAlertIcon}>
              <Ionicons color="#fff" name="alarm-outline" size={20} />
            </View>
            <View style={styles.activityAlertBody}>
              <Text style={styles.activityAlertTitle}>
                {closingSoon.count} (av {closingSoon.total}) aktiviteter stänger snart
              </Text>
            </View>
            <Ionicons color="#fff" name="chevron-forward" size={18} />
          </Pressable>
        ) : null}

        {closingSoon.count === 0 && laterCount > 0 ? (
          <Pressable onPress={() => router.push('/klubbaktiviteter')} style={styles.activityInfoCard}>
            <View style={styles.activityInfoIcon}>
              <Ionicons color="#33290A" name="albums-outline" size={20} />
            </View>
            <View style={styles.activityAlertBody}>
              <Text style={styles.activityInfoTitle}>
                {laterCount} {laterCount === 1 ? 'aktuell aktivitet' : 'aktuella aktiviteter'}
              </Text>
            </View>
            <Ionicons color="#33290A" name="chevron-forward" size={18} />
          </Pressable>
        ) : null}

        {user ? (
          <UpcomingStartsPanel error={startsError} isLoading={isLoadingStarts} sections={startsSections} />
        ) : (
          <SectionCard icon="time-outline" title="Mina kommande starter" subtitle="Logga in för att se dina starter.">
            <View style={styles.loginPrompt}>
              <Text style={styles.loginPromptText}>När du loggar in visas nästa start, dina resultat och analys direkt här.</Text>
              <AppButton label="Logga in" onPress={() => router.push('/profile')} />
            </View>
          </SectionCard>
        )}

        <View style={styles.sectionSpacer}>
          <SectionCard icon="calendar-outline" title="Dagens tävlingar">
          {isLoadingTodayEvents ? <LoadingState label="Hämtar tävlingar från Eventor..." /> : null}

          {!isLoadingTodayEvents && todayEventsError && nationalTodayEvents.length === 0 ? (
            <EmptyState
              action={<AppButton label="Försök igen" onPress={() => void refreshAll()} />}
              description={todayEventsError}
              title="Det gick inte att hämta tävlingar"
            />
          ) : null}

          {!isLoadingTodayEvents && !todayEventsError && nationalTodayEvents.length === 0 ? (
            <EmptyState
              action={<AppButton label="Öppna kalendern" onPress={() => router.push('/calendar')} />}
              description="Inga nationella tävlingar idag"
              title="Inga tävlingar idag"
            />
          ) : null}

          {nationalTodayEvents.length > 0 ? (
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.sectionScroll} contentContainerStyle={styles.sectionScrollContent}>
              {nationalTodayEvents.map((event) => (
                <EventSummaryCard key={event.id} item={event} onOpenList={setActiveResultListModal} />
              ))}
            </ScrollView>
          ) : null}
          </SectionCard>
        </View>

        <View style={styles.sectionSpacer}>
        <SectionCard icon="ribbon-outline" title="Mina senaste tävlingar">
          {user ? (
            <PersonActivitySectionList
              emptyLabel="Inga senaste tävlingar att visa just nu."
              error={resultsError}
              isLoading={isLoadingResults}
              kind="results"
              onOpenAnalysis={handleOpenAnalysis}
              onOpenResultList={(eventId: string, classLabel: string, eventRaceId?: string | null) =>
                void openPublishedListModal('results', 'public', eventId, null, null, setActiveResultListModal, classLabel, eventRaceId ?? null)
              }
              onOpenSplitTimes={(eventId: string, classLabel: string) => void openEventSplitTimesModal(eventId, setActiveSplitTimesModal, classLabel)}
              onPressEvent={(eventId: string) => router.push({ params: { id: eventId, returnTo: pathname }, pathname: '/event/[id]' })}
              sections={latestPastEvents}
            />
          ) : (
            <View style={styles.loginPrompt}>
              <Text style={styles.loginPromptText}>Logga in för att se dina senaste tävlingar här.</Text>
              <AppButton label="Logga in" onPress={() => router.push('/profile')} />
            </View>
          )}
        </SectionCard>
        </View>

      </ScrollView>

      <PublishedListModal onClose={() => setActiveResultListModal(null)} onOpenAnalysis={handleOpenAnalysis} state={activeResultListModal} />
      <SplitTimesModal onClose={() => setActiveSplitTimesModal(null)} onOpenAnalysis={handleOpenAnalysis} state={activeSplitTimesModal} />
      <AnalysisModal onClose={() => setActiveAnalysisModal(null)} state={activeAnalysisModal} />
      <AnnouncementsModal announcements={allAnnouncements} onClose={() => setShowAnnouncements(false)} visible={showAnnouncements} />
    </SafeAreaView>
  );
}

function ShortcutCard({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.shortcutCard, pressed ? styles.shortcutCardPressed : null]}>
      <View style={styles.shortcutIconWrap}>
        <Ionicons color={colors.primaryDeep} name={icon} size={18} />
      </View>
      <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={styles.shortcutLabel}>{label}</Text>
    </Pressable>
  );
}

function SectionCard({ children, icon, subtitle, title }: { children: React.ReactNode; icon?: keyof typeof Ionicons.glyphMap; subtitle?: string; title: string }) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <LinearGradient
      colors={[colors.heroBottom, colors.heroTop, colors.primary]}
      end={{ x: 0, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={styles.sectionCard}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderCopy}>
          <View style={styles.sectionTitleRow}>
            {icon ? <Ionicons color={colors.heroText} name={icon} size={16} /> : null}
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </LinearGradient>
  );
}

function sortEventsAsc(left: EventItem, right: EventItem) {
  const byDate = left.startDate.localeCompare(right.startDate);
  if (byDate !== 0) {
    return byDate;
  }

  return (left.startClock ?? '').localeCompare(right.startClock ?? '') || left.name.localeCompare(right.name, 'sv');
}

function sortEventsDesc(left: EventItem, right: EventItem) {
  return sortEventsAsc(right, left);
}

function sortEventsByName(left: EventItem, right: EventItem) {
  return left.name.localeCompare(right.name, 'sv');
}

function getLocalIsoDate(offsetDays = 0) {
  const now = new Date();
  if (offsetDays) now.setDate(now.getDate() + offsetDays);
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatAccessLevel(level: string) {
  if (level === 'premium') {
    return 'Premium';
  }

  if (level === 'admin') {
    return 'Admin';
  }

  return 'Premium';
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  accessPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  accessPillText: {
    ...typography.captionStrong,
    color: colors.heroText,
  },
  activityAlertBody: {
    flex: 1,
    gap: 2,
  },
  activityAlertCard: {
    alignItems: 'center',
    backgroundColor: '#E5484D',
    borderRadius: 18,
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.xs,
    padding: spacing.md,
  },
  activityAlertIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  activityAlertText: {
    ...typography.caption,
    color: 'rgba(255, 255, 255, 0.92)',
  },
  activityAlertTitle: {
    ...typography.bodyStrong,
    color: '#fff',
  },
  activityInfoCard: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 18,
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.xs,
    padding: spacing.md,
  },
  activityInfoIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  activityInfoTitle: {
    ...typography.bodyStrong,
    color: '#33290A',
  },
  bellButton: {
    padding: spacing.xs,
    position: 'relative',
  },
  bellBadge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 4,
    paddingVertical: 1,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  bellBadgeText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    fontSize: 10,
  },
  container: {
    gap: spacing.md,
    overflow: 'hidden',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  hero: {
    borderRadius: 28,
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.lg,
    position: 'relative',
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  heroDescription: {
    ...typography.body,
    color: colors.heroTextMuted,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 340,
  },
  heroEyebrow: {
    ...typography.eyebrow,
    color: colors.heroEyebrow,
    fontSize: 11,
  },
  heroTitle: {
    ...typography.heroTitle,
    color: colors.heroText,
    fontSize: 40,
    lineHeight: 42,
  },
  heroTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  leafGlowLeft: {
    backgroundColor: colors.secondaryGlow,
    borderRadius: 999,
    bottom: 120,
    height: 210,
    left: -60,
    position: 'absolute',
    width: 210,
  },
  leafGlowRight: {
    backgroundColor: colors.backgroundGlow,
    borderRadius: 999,
    bottom: -20,
    height: 180,
    position: 'absolute',
    right: 30,
    width: 180,
  },
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sectionBody: {
    gap: spacing.sm,
  },
  sectionSpacer: {
    marginTop: spacing.md,
  },
  sectionEmptyText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  sectionCard: {
    borderColor: colors.primaryDeep,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
    padding: spacing.sm,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  sectionScroll: {
    maxHeight: 250,
  },
  sectionScrollContent: {
    gap: spacing.xs,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.heroTextMuted,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.heroText,
    fontSize: 17,
    lineHeight: 21,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  shortcutCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 18,
    borderWidth: 1.5,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 92,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  shortcutCardPressed: {
    opacity: 0.9,
  },
  shortcutSection: {
    gap: spacing.sm,
  },
  shortcutGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  shortcutIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  shortcutLabel: {
    ...typography.captionStrong,
    alignSelf: 'stretch',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  sunGlow: {
    backgroundColor: colors.accentGlow,
    borderRadius: 999,
    height: 260,
    position: 'absolute',
    right: -40,
    top: 10,
    width: 260,
  },
  loginPrompt: {
    gap: spacing.sm,
  },
  loginPromptText: {
    ...typography.body,
    color: colors.heroTextMuted,
  },
});
}
