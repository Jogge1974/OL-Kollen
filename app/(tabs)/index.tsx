import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { EmptyState } from '@/src/components/EmptyState';
import { AnalysisModal, AnalysisModalState, openEventAnalysisModal } from '@/src/components/AnalysisModal';
import { EventSummaryCard } from '@/src/components/EventSummaryCard';
import { LoadingState } from '@/src/components/LoadingState';
import { PersonActivitySectionList } from '@/src/components/PersonActivitySectionList';
import { PublishedListModal, PublishedListModalState, openPublishedListModal } from '@/src/components/PublishedListModal';
import { SplitTimesModal, SplitTimesModalState, openEventSplitTimesModal } from '@/src/components/SplitTimesModal';
import { UpcomingStartsPanel } from '@/src/components/UpcomingStartsPanel';
import { fetchEventorEvents } from '@/src/api/eventorApi';
import { usePersonEventorLists } from '@/src/hooks/usePersonEventorLists';
import { useAuthStore } from '@/src/store/authStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventItem } from '@/src/types/eventor';

export default function HomeScreen() {
  const pathname = usePathname();
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const user = useAuthStore((state) => state.user);
  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
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
    personId: user?.personId ?? null,
  });

  const todayIso = React.useMemo(() => getLocalIsoDate(), []);
  const tomorrowIso = React.useMemo(() => getLocalIsoDate(1), []);
  const exactTodayEvents = React.useMemo(() => todayEvents.filter((event) => event.startDate === todayIso), [todayEvents, todayIso]);
  const nationalTodayEvents = React.useMemo(
    () => exactTodayEvents.filter((event) => [0, 1, 2].includes(event.classificationId)).sort(sortEventsAsc),
    [exactTodayEvents],
  );
  const latestPastEvents = React.useMemo(() => resultsSections.slice(0, 2), [resultsSections]);
  const upcomingStartCount = React.useMemo(
    () => startsSections.reduce((sum, section) => sum + section.rows.length, 0),
    [startsSections],
  );

  const handleOpenAnalysis = React.useCallback((eventId: string, classLabel: string, personId?: string | null) => {
    void openEventAnalysisModal(eventId, setActiveAnalysisModal, classLabel, personId ?? null);
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    const loadTodayEvents = async () => {
      setIsLoadingTodayEvents(true);
      setTodayEventsError(null);

      try {
        const events = await fetchEventorEvents({
          classificationIds: [0, 1, 2],
          districtIds: [],
          fromDate: todayIso,
          toDate: tomorrowIso,
        });

        if (isMounted) {
          setTodayEvents(events.filter((event) => event.startDate === todayIso).sort(sortEventsAsc));
        }
      } catch (error) {
        if (isMounted) {
          setTodayEvents([]);
          setTodayEventsError(error instanceof Error ? error.message : 'Okänt fel vid hämtning av dagens tävlingar.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingTodayEvents(false);
        }
      }
    };

    void loadTodayEvents();

    return () => {
      isMounted = false;
    };
  }, [todayIso]);

  const refreshAll = React.useCallback(async () => {
    setIsLoadingTodayEvents(true);
    setTodayEventsError(null);

    try {
      await Promise.all([
        fetchEventorEvents({
          classificationIds: [0, 1, 2],
          districtIds: [],
          fromDate: todayIso,
          toDate: todayIso,
        }).then((events) => setTodayEvents(events.filter((event) => event.startDate === todayIso).sort(sortEventsAsc))),
        user?.personId ? refetchPersonLists() : Promise.resolve(),
      ]);
    } catch (error) {
      setTodayEvents([]);
      setTodayEventsError(error instanceof Error ? error.message : 'Okänt fel vid hämtning av dagens tävlingar.');
    } finally {
      setIsLoadingTodayEvents(false);
    }
  }, [refetchPersonLists, todayIso, user?.personId]);

  const greetingName = user?.firstName ?? user?.fullName ?? 'orienterare';

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl colors={[colors.primary]} refreshing={isLoadingTodayEvents} tintColor={colors.primary} onRefresh={() => void refreshAll()} />}
      >
        <LinearGradient colors={[colors.heroTop, colors.primary, colors.backgroundDeep]} style={styles.hero}>
          <View style={styles.sunGlow} />
          <View style={styles.leafGlowLeft} />
          <View style={styles.leafGlowRight} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>{user ? `Hej ${greetingName}` : 'Orientering'}</Text>
              <Text style={styles.heroTitle}>Kontrollen</Text>
              <Text style={styles.heroDescription}>
                Ett komplement till Eventor.
              </Text>
            </View>
            {user?.accessLevel ? <View style={styles.accessPill}><Text style={styles.accessPillText}>{formatAccessLevel(user.accessLevel)}</Text></View> : null}
          </View>

          <View style={styles.heroStatsRow}>
            <HeroStat icon="calendar-outline" label="Idag" value={`${exactTodayEvents.length}`} />
            <HeroStat icon="flag-outline" label="Starter" value={user ? `${upcomingStartCount}` : 'Logga in'} />
            <HeroStat icon="star-outline" label="Favoriter" value={`${favoriteEvents.length}`} />
          </View>
        </LinearGradient>

        <View style={styles.shortcutSection}>
          <View style={styles.shortcutGrid}>
            <ShortcutCard icon="calendar-outline" label="Kalender" onPress={() => router.push('/calendar')} />
            <ShortcutCard icon="trophy-outline" label="Sverigelistan" onPress={() => router.push('/sverigelista')} />
            <ShortcutCard icon="person-outline" label="Min sida" onPress={() => router.push('/profile')} />
          </View>
        </View>

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
          <SectionCard flat icon="calendar-outline" title="Dagens tävlingar">
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
        <SectionCard flat icon="ribbon-outline" title="Mina senaste tävlingar">
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
    </SafeAreaView>
  );
}

function HeroStat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.statPill}>
      <Ionicons color={colors.heroText} name={icon} size={16} />
      <View style={styles.statTextWrap}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.statValue}>
          {value}
        </Text>
      </View>
    </View>
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
      <Text style={styles.shortcutLabel}>{label}</Text>
    </Pressable>
  );
}

function SectionCard({ children, flat = false, icon, subtitle, title }: { children: React.ReactNode; flat?: boolean; icon?: keyof typeof Ionicons.glyphMap; subtitle?: string; title: string }) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.sectionCard, flat ? styles.sectionCardFlat : null]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderCopy}>
          <View style={styles.sectionTitleRow}>
            {icon ? <Ionicons color={colors.textMuted} name={icon} size={16} /> : null}
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
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
  heroStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
  },
  sectionCardFlat: {
    backgroundColor: 'transparent',
    borderColor: colors.primary,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
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
    color: colors.textSecondary,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
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
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 84,
    padding: spacing.sm,
  },
  shortcutCardPressed: {
    opacity: 0.9,
  },
  shortcutSection: {
    gap: spacing.sm,
  },
  shortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    color: colors.textPrimary,
    textAlign: 'center',
  },
  statLabel: {
    color: colors.heroTextMuted,
    fontSize: 10,
    lineHeight: 12,
  },
  statPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 18,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 92,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statTextWrap: {
    flex: 1,
  },
  statValue: {
    ...typography.captionStrong,
    color: colors.heroText,
    fontSize: 13,
    lineHeight: 15,
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
    color: colors.textSecondary,
  },
});
}
