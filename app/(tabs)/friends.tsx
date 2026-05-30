import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFocusEffect } from 'expo-router';

import { AppTextField } from '@/src/components/AppTextField';
import { EmptyState } from '@/src/components/EmptyState';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { fetchPersonEntriesXml, fetchPersonResultsXml, fetchPersonStartsXml } from '@/src/api/eventorApi';
import { findLiveCompetitionsBatch } from '@/src/services/liveresultat';
import { useAuthStore } from '@/src/store/authStore';
import { useFriendActivityStore } from '@/src/store/friendActivityStore';
import { Friend, useFriendsStore } from '@/src/store/friendsStore';
import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

const PERSON_SEARCH_URL = 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/person-search';

import { XMLParser } from 'fast-xml-parser';

const entryParser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

type PersonSearchResult = {
  birthYear: number | null;
  club: string;
  gender: string;
  name: string;
  nationality: string;
  personId: number;
};

export default function FriendsScreen() {
  const { colors, isDark, themeName } = useTheme();
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  const styles = React.useMemo(() => createStyles(colors, isDark, isSoft), [colors, isDark, isSoft]);
  const user = useAuthStore((state) => state.user);
  const friends = useFriendsStore((state) => state.friends);
  const addFriend = useFriendsStore((state) => state.addFriend);
  const removeFriend = useFriendsStore((state) => state.removeFriend);
  const isLoggedIn = Boolean(user);

  const [searchVisible, setSearchVisible] = React.useState(false);
  const [legendVisible, setLegendVisible] = React.useState(false);
  const [searchName, setSearchName] = React.useState('');
  const [searchClub, setSearchClub] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<PersonSearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  const friendPersonIds = React.useMemo(() => new Set(friends.map((f) => f.personId)), [friends]);

  // Subscribe reactively so FlatList re-renders when activity state changes
  const activityByFriendId = useFriendActivityStore((s) => s.activityByFriendId);
  const fetchTodayActivity = useFriendActivityStore((s) => s.fetchTodayActivity);

  // Entry counts per friend (future only, excluding today)
  const [entryCountByFriendId, setEntryCountByFriendId] = React.useState<Record<string, { today: number; future: number; todayEventNames: string[] }>>({});

  // Today's starts fetched directly from Eventor (client-side fallback)
  const [todayStartsByFriendId, setTodayStartsByFriendId] = React.useState<Record<string, { eventName: string; startTime: string | null }>>({});

  // Friends who have results today (client-side check from Eventor)
  const [todayResultFriendIds, setTodayResultFriendIds] = React.useState<Set<string>>(new Set());

  // Set of eventIds that have a liveresultat match today
  const [liveEventIds, setLiveEventIds] = React.useState<Set<string>>(new Set());

  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [statusLoading, setStatusLoading] = React.useState(true);

  useFocusEffect(
    React.useCallback(() => {
      if (friends.length > 0) {
        setStatusLoading(true);
        const p1 = fetchTodayActivity(friends.map((f) => String(f.personId)));
        const p2 = fetchFriendEntryCounts(friends).then(setEntryCountByFriendId);
        const p3 = fetchFriendTodayStarts(friends).then(setTodayStartsByFriendId);
        const p4 = fetchFriendTodayResults(friends).then(setTodayResultFriendIds);
        void Promise.all([p1, p2, p3, p4]).finally(() => setStatusLoading(false));
      }
    }, [friends, fetchTodayActivity, user]),
  );

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    setStatusLoading(true);
    try {
      await fetchTodayActivity(friends.map((f) => String(f.personId)));
      const [entryCounts, todayStarts, resultIds] = await Promise.all([
        fetchFriendEntryCounts(friends),
        fetchFriendTodayStarts(friends),
        fetchFriendTodayResults(friends),
      ]);
      setEntryCountByFriendId(entryCounts);
      setTodayStartsByFriendId(todayStarts);
      setTodayResultFriendIds(resultIds);
    } finally {
      setIsRefreshing(false);
      setStatusLoading(false);
    }
  }, [friends, fetchTodayActivity]);

  // Check liveresultat for events where friends have a start today
  React.useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const startEvents = new Map<string, string>();

    // From backend activity state
    for (const entry of Object.values(activityByFriendId)) {
      if (entry.date === today && entry.type === 'friend-start' && entry.eventName) {
        startEvents.set(entry.eventId, entry.eventName);
      }
    }

    // From client-side today starts
    for (const start of Object.values(todayStartsByFriendId)) {
      if (!startEvents.has(start.eventName)) {
        startEvents.set(start.eventName, start.eventName);
      }
    }

    // From client-side entry data (today's entries)
    for (const counts of Object.values(entryCountByFriendId)) {
      for (const name of counts.todayEventNames) {
        if (!startEvents.has(name)) {
          startEvents.set(name, name);
        }
      }
    }

    if (startEvents.size === 0) {
      setLiveEventIds(new Set());
      return;
    }
    const events = [...startEvents.entries()].map(([eventId, eventName]) => ({ eventId, eventName, eventDate: today }));
    void findLiveCompetitionsBatch(events).then(setLiveEventIds);
  }, [activityByFriendId, todayStartsByFriendId, entryCountByFriendId]);

  const uniqueClubs = React.useMemo(() => new Set(friends.map((f) => f.club)).size, [friends]);
  const genderSummary = React.useMemo(() => {
    const men = friends.filter((f) => f.gender === 'H').length;
    const women = friends.filter((f) => f.gender === 'D').length;
    if (men > 0 && women > 0) return `${men}H / ${women}D`;
    if (men > 0) return `${men} herrar`;
    if (women > 0) return `${women} damer`;
    return '0';
  }, [friends]);

  const canSearch = searchName.trim().length >= 3 || searchClub.trim().length >= 3;

  React.useEffect(() => {
    if (!canSearch) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (searchName.trim().length >= 3) params.set('name', searchName.trim());
        if (searchClub.trim().length >= 3) params.set('club', searchClub.trim());
        const response = await fetch(`${PERSON_SEARCH_URL}?${params.toString()}`);
        if (!response.ok) { setSearchResults([]); return; }
        const json = await response.json();
        setSearchResults(json.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => { clearTimeout(timeout); setIsSearching(false); };
  }, [searchName, searchClub, canSearch]);

  const handleAddFriend = React.useCallback((result: PersonSearchResult) => {
    const friend: Friend = {
      birthYear: result.birthYear,
      club: result.club,
      gender: result.gender,
      name: result.name,
      personId: result.personId,
      pushOnEntry: false,
      pushOnResult: true,
      pushOnStart: true,
    };
    void addFriend(friend);
  }, [addFriend]);

  const handleRemoveFriend = React.useCallback((personId: number) => {
    void removeFriend(personId);
  }, [removeFriend]);

  if (!isLoggedIn) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ScreenHeroHeader subtitle="" title="Vänner" />
        <View style={styles.emptyContainer}>
          <EmptyState
            description="Logga in med Eventor för att använda vänner."
            title="Vänner kräver inloggning"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.headerWrap}>
        <ScreenHeroHeader
          chips={[
            { icon: 'people-outline', label: 'Antal', value: `${friends.length} vänner` },
            { icon: 'man-outline', label: 'Fördelning', value: genderSummary },
            { icon: 'shield-outline', label: 'Klubbar', value: `${uniqueClubs} st` },
          ]}
          eyebrow="Bevakning"
          title="Vänner"
        />
      </View>

      <View style={styles.toolbar}>
        <Pressable onPress={() => { setSearchName(''); setSearchClub(''); setSearchVisible(true); }} style={({ pressed }) => [styles.searchBadge, pressed ? styles.searchBadgePressed : null]}>
          <Ionicons color={colors.primaryDeep} name="search-outline" size={14} />
          <Text style={styles.searchBadgeText}>Sök vänner</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setLegendVisible(true)} style={({ pressed }) => [styles.legendInfoBadge, pressed ? { opacity: 0.7 } : null]}>
          <Ionicons color={colors.primaryDeep} name="information-circle-outline" size={20} />
        </Pressable>
      </View>

      {friends.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            description="Tryck på Sök vänner för att hitta och lägga till vänner."
            title="Inga vänner ännu"
          />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={friends}
          keyExtractor={(item) => String(item.personId)}
          onRefresh={handleRefresh}
          refreshing={isRefreshing}
          renderItem={({ item }) => {
            const today = new Date().toISOString().slice(0, 10);
            const activity = activityByFriendId[String(item.personId)];
            const hasActivity = activity != null && activity.date === today;
            const isResultFromBackend = hasActivity && activity.type === 'friend-results';
            const isResultFromClient = todayResultFriendIds.has(String(item.personId));
            const isResult = isResultFromBackend || isResultFromClient;
            const isStart = hasActivity && activity.type === 'friend-start';
            const counts = entryCountByFriendId[String(item.personId)];
            const todayEntries = counts?.today ?? 0;
            const futureEntries = counts?.future ?? 0;
            const hasTodayStartFromStarts = todayStartsByFriendId[String(item.personId)] != null;

            // A friend has a start today if: backend says so, OR client fetched today starts, OR entry data shows today
            // But NOT if a result already exists — result takes priority
            const hasTodayStart = !isResult && (isStart || hasTodayStartFromStarts || todayEntries > 0);

            // Determine if the friend's start time has passed
            // startNotified means the cron confirmed start was imminent (within 5 min) — treat as started
            // Also check client-side start time from /starts/person
            const clientStartTime = hasTodayStartFromStarts ? todayStartsByFriendId[String(item.personId)].startTime : null;
            const hasStarted = hasTodayStart && (
              (isStart && (activity.startNotified || hasStartTimePassed(activity.startTime))) ||
              hasStartTimePassed(clientStartTime)
            );

            // Check if the event has liveresultat
            const isLiveFromActivity = isStart && liveEventIds.has(activity.eventId);
            const isLiveFromStarts = hasTodayStartFromStarts &&
              liveEventIds.has(todayStartsByFriendId[String(item.personId)].eventName);
            const isLiveFromEntries = todayEntries > 0 && counts != null &&
              counts.todayEventNames.some((name) => liveEventIds.has(name));
            const isLive = hasTodayStart && (isLiveFromActivity || isLiveFromStarts || isLiveFromEntries);
            const liveOrange = isDark ? '#C48800' : '#F6A60A';

            // Start dot color: orange if live, otherwise accent (yellow)
            const startDotColor = isLive ? liveOrange : colors.accent;

            // Border: result → primary border, started → accent/orange border, not-yet-started → no border
            const showBorder = isResult || hasStarted;
            const borderColor = isResult ? colors.primary : startDotColor;

            // Other entries (future, excluding today's activity)
            const otherEntries = futureEntries;

            return (
            <Pressable
              onPress={() => router.push(`/friend/${item.personId}`)}
              style={({ pressed }) => [styles.friendCard, showBorder ? { borderColor, borderWidth: 1.5 } : null, pressed ? styles.friendCardPressed : null]}
            >
              {statusLoading ? (
                <View style={styles.entryDotsColumn}>
                  <ActivityIndicator color={colors.textMuted} size={10} />
                </View>
              ) : hasTodayStart ? (
                <View style={styles.entryDotsColumn}>
                  <View style={[styles.activityDot, { backgroundColor: isResult ? colors.primary : startDotColor }]} />
                  {otherEntries >= 1 ? (
                    <View style={[styles.entryDot, { backgroundColor: colors.primary }]} />
                  ) : null}
                  {otherEntries >= 2 ? (
                    <Text style={[styles.entryDotPlus, { color: colors.primary }]}>+</Text>
                  ) : null}
                </View>
              ) : isResult ? (
                <View style={styles.entryDotsColumn}>
                  <View style={[styles.activityDot, { backgroundColor: colors.primary }]} />
                  {otherEntries >= 1 ? (
                    <View style={[styles.entryDot, { backgroundColor: colors.primary }]} />
                  ) : null}
                  {otherEntries >= 2 ? (
                    <Text style={[styles.entryDotPlus, { color: colors.primary }]}>+</Text>
                  ) : null}
                </View>
              ) : futureEntries > 0 ? (
                <View style={styles.entryDotsColumn}>
                  <View style={[styles.entryDot, { backgroundColor: colors.primary }]} />
                  {futureEntries >= 2 ? (
                    <View style={[styles.entryDot, { backgroundColor: colors.primary }]} />
                  ) : null}
                  {futureEntries >= 3 ? (
                    <Text style={[styles.entryDotPlus, { color: colors.primary }]}>+</Text>
                  ) : null}
                </View>
              ) : (
                <View style={styles.iconSpacer} />
              )}
              <View style={styles.friendInfo}>
                <Text numberOfLines={1} style={styles.friendName}>{item.name}</Text>
                <Text numberOfLines={1} style={styles.friendClub}>
                  {item.birthYear ? `f. ${item.birthYear} \u2022 ` : ''}{item.club}
                </Text>
              </View>
              <Pressable
                hitSlop={8}
                onPress={() => handleRemoveFriend(item.personId)}
                style={({ pressed }) => [styles.removeButton, pressed ? styles.removeButtonPressed : null]}
              >
                <Ionicons color={colors.error} name="close-circle-outline" size={20} />
              </Pressable>
              <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
            </Pressable>
            );
          }}
        />
      )}

      <Modal animationType="fade" onRequestClose={() => setSearchVisible(false)} transparent visible={searchVisible}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.searchOverlay}>
          <Pressable style={styles.searchBackdrop} onPress={() => setSearchVisible(false)} />
          <View style={styles.searchSheet}>
            <View style={styles.searchHeader}>
              <Text style={styles.searchTitle}>Sök vänner</Text>
              <Pressable onPress={() => setSearchVisible(false)} style={styles.searchCloseButton}>
                <Ionicons color={colors.primary} name="close-circle-outline" size={18} />
                <Text style={styles.searchCloseText}>Stäng</Text>
              </Pressable>
            </View>

            <View style={styles.searchFieldsRow}>
              <View style={styles.searchFieldWrap}>
                <AppTextField
                  autoCapitalize="words"
                  autoCorrect={false}
                  label="Namn"
                  onChangeText={setSearchName}
                  onClearText={() => setSearchName('')}
                  placeholder="För- eller efternamn"
                  value={searchName}
                />
              </View>
              <View style={styles.searchFieldWrap}>
                <AppTextField
                  autoCapitalize="none"
                  autoCorrect={false}
                  label="Klubb"
                  onChangeText={setSearchClub}
                  onClearText={() => setSearchClub('')}
                  placeholder="Klubbnamn"
                  value={searchClub}
                />
              </View>
            </View>

            <FlatList
              contentContainerStyle={styles.searchResults}
              data={searchResults}
              initialNumToRender={12}
              keyExtractor={(item) => `${item.personId}`}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                isSearching
                  ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.md }} />
                  : !canSearch
                    ? <Text style={styles.searchEmptyText}>Skriv minst 3 tecken i namn eller klubb.</Text>
                    : <Text style={styles.searchEmptyText}>Inga personer matchar sökningen.</Text>
              }
              renderItem={({ item }) => {
                const isAlreadyFriend = friendPersonIds.has(item.personId);
                return (
                  <Pressable
                    onPress={() => {
                      if (isAlreadyFriend) {
                        handleRemoveFriend(item.personId);
                      } else {
                        handleAddFriend(item);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.searchResultItem,
                      isAlreadyFriend ? styles.searchResultItemSelected : null,
                      pressed ? styles.searchResultItemPressed : null,
                    ]}
                  >
                    <View style={styles.searchResultContent}>
                      <Text numberOfLines={1} style={[styles.searchResultName, isAlreadyFriend ? styles.searchResultNameSelected : null]}>
                        {item.name}
                      </Text>
                      <Text numberOfLines={1} style={styles.searchResultSub}>
                        {item.birthYear ? `f. ${item.birthYear} • ` : ''}{item.club}
                      </Text>
                    </View>
                    {isAlreadyFriend ? (
                      <Ionicons color={colors.primary} name="checkmark-circle" size={20} />
                    ) : (
                      <Ionicons color={colors.textMuted} name="add-circle-outline" size={20} />
                    )}
                  </Pressable>
                );
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setLegendVisible(false)} transparent visible={legendVisible}>
        <View style={styles.searchOverlay}>
          <Pressable style={styles.searchBackdrop} onPress={() => setLegendVisible(false)} />
          <View style={styles.legendSheet}>
            <View style={styles.searchHeader}>
              <Text style={styles.searchTitle}>Teckenförklaring</Text>
              <Pressable onPress={() => setLegendVisible(false)} style={styles.searchCloseButton}>
                <Ionicons color={colors.primary} name="close-circle-outline" size={18} />
                <Text style={styles.searchCloseText}>Stäng</Text>
              </Pressable>
            </View>

            <View style={styles.legendList}>
              <View style={styles.legendRow}>
                <View style={[styles.legendSample, { borderColor: colors.primary, borderWidth: 1.5 }]}>
                  <View style={[styles.activityDot, { backgroundColor: colors.primary }]} />
                </View>
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendLabel}>Resultat idag</Text>
                  <Text style={styles.legendDesc}>Vännen har ett publicerat resultat idag</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendSample}>
                  <View style={[styles.activityDot, { backgroundColor: colors.accent }]} />
                </View>
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendLabel}>Har starttid idag</Text>
                  <Text style={styles.legendDesc}>Vännen har en starttid idag men har inte startat ännu</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={[styles.legendSample, { borderColor: colors.accent, borderWidth: 1.5 }]}>
                  <View style={[styles.activityDot, { backgroundColor: colors.accent }]} />
                </View>
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendLabel}>Har startat idag</Text>
                  <Text style={styles.legendDesc}>Vännens starttid har passerat – tävlar just nu (eller är i mål)</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendSample}>
                  <View style={[styles.activityDot, { backgroundColor: isDark ? '#C48800' : '#F6A60A' }]} />
                </View>
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendLabel}>Har starttid idag – liveresultat finns</Text>
                  <Text style={styles.legendDesc}>Vännen har starttid idag och kan troligtvis gå att följa via Liveresultat</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={[styles.legendSample, { borderColor: isDark ? '#C48800' : '#F6A60A', borderWidth: 1.5 }]}>
                  <View style={[styles.activityDot, { backgroundColor: isDark ? '#C48800' : '#F6A60A' }]} />
                </View>
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendLabel}>Har startat idag – liveresultat finns</Text>
                  <Text style={styles.legendDesc}>Vännen har startat och kan troligtvis gå att följa via Liveresultat</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendSample}>
                  <View style={styles.entryDotsColumn}>
                    <View style={[styles.entryDot, { backgroundColor: colors.primary }]} />
                  </View>
                </View>
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendLabel}>1 anmälan</Text>
                  <Text style={styles.legendDesc}>Vännen är anmäld till 1 kommande tävling</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendSample}>
                  <View style={styles.entryDotsColumn}>
                    <View style={[styles.entryDot, { backgroundColor: colors.primary }]} />
                    <View style={[styles.entryDot, { backgroundColor: colors.primary }]} />
                  </View>
                </View>
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendLabel}>2 anmälningar</Text>
                  <Text style={styles.legendDesc}>Vännen är anmäld till 2 kommande tävlingar</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendSample}>
                  <View style={styles.entryDotsColumn}>
                    <View style={[styles.entryDot, { backgroundColor: colors.primary }]} />
                    <View style={[styles.entryDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.entryDotPlus, { color: colors.primary }]}>+</Text>
                  </View>
                </View>
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendLabel}>3+ anmälningar</Text>
                  <Text style={styles.legendDesc}>Vännen är anmäld till 3 eller fler kommande tävlingar</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette, isDark: boolean, isSoft: boolean) {
  return StyleSheet.create({
    headerWrap: {
      paddingHorizontal: spacing.sm,
    },
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    toolbar: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    searchBadge: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.primaryDeep,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    searchBadgePressed: {
      opacity: 0.85,
    },
    searchBadgeText: {
      ...typography.captionStrong,
      color: colors.primaryDeep,
    },
    legendInfoBadge: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    emptyContainer: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    listContent: {
      gap: spacing.xs,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.xs,
    },
    friendCard: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.md,
    },
    friendCardPressed: {
      opacity: 0.85,
    },
    activityDot: {
      borderRadius: 3.5,
      height: 7,
      width: 7,
    },
    iconSpacer: {
      width: 10,
    },
    entryDotsColumn: {
      alignItems: 'center',
      gap: 2,
      justifyContent: 'center',
      width: 10,
    },
    entryDot: {
      borderRadius: 3.5,
      height: 7,
      width: 7,
    },
    entryDotPlus: {
      fontSize: 9,
      fontWeight: '700',
      lineHeight: 9,
    },
    friendInfo: {
      flex: 1,
      gap: 2,
    },
    friendName: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
    },
    friendClub: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    removeButton: {
      padding: 4,
    },
    removeButtonPressed: {
      opacity: 0.7,
    },

    // Search modal
    searchOverlay: {
      backgroundColor: 'rgba(20, 24, 30, 0.45)',
      flex: 1,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    searchBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    searchSheet: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      gap: spacing.sm,
      maxHeight: '80%',
      padding: spacing.lg,
    },
    searchFieldsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    searchFieldWrap: {
      flex: 1,
    },
    searchHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    searchTitle: {
      ...typography.sectionTitle,
      color: colors.textPrimary,
    },
    searchCloseButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    searchCloseText: {
      ...typography.captionStrong,
      color: colors.primary,
    },
    searchResults: {
      gap: 8,
      paddingBottom: 120,
      paddingTop: spacing.sm,
    },
    searchEmptyText: {
      ...typography.body,
      color: colors.textSecondary,
      paddingVertical: spacing.md,
      textAlign: 'center',
    },
    searchResultItem: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    searchResultItemPressed: {
      opacity: 0.85,
    },
    searchResultItemSelected: {
      backgroundColor: isSoft ? '#E0ECF8' : isDark ? colors.surfaceMuted : '#E7F4D8',
      borderColor: colors.primary,
    },
    searchResultContent: {
      flex: 1,
      gap: 2,
    },
    searchResultName: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
    },
    searchResultNameSelected: {
      color: colors.primaryDeep,
    },
    searchResultSub: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    legendSheet: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.lg,
    },
    legendList: {
      gap: spacing.md,
    },
    legendRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
    },
    legendSample: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    legendTextWrap: {
      flex: 1,
      gap: 2,
    },
    legendLabel: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
    },
    legendDesc: {
      ...typography.caption,
      color: colors.textSecondary,
    },
  });
}

function formatLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function fetchFriendEntryCounts(friends: Friend[]): Promise<Record<string, { today: number; future: number; todayEventNames: string[] }>> {
  const todayIso = formatLocalIsoDate(new Date());
  const fromDate = `${todayIso} 00:00:00`;
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 9);
  const toDate = `${formatLocalIsoDate(futureDate)} 23:59:59`;

  const result: Record<string, { today: number; future: number; todayEventNames: string[] }> = {};

  await Promise.all(
    friends.map(async (friend) => {
      try {
        const xml = await fetchPersonEntriesXml(String(friend.personId), null, fromDate, toDate);
        const parsed = entryParser.parse(xml) as { EntryList?: { Entry?: unknown } };
        const entries = parsed.EntryList?.Entry;
        const entryArray = entries == null ? [] : Array.isArray(entries) ? entries : [entries];

        // Count unique events, separating today from future
        const seenEventIds = new Set<string>();
        let todayCount = 0;
        let futureCount = 0;
        const todayEventNames: string[] = [];
        for (const entry of entryArray) {
          const event = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>).Event : null;
          const eventIdNode = typeof event === 'object' && event !== null ? (event as Record<string, unknown>).EventId : null;
          const eventId = typeof eventIdNode === 'string' ? eventIdNode : typeof eventIdNode === 'number' ? String(eventIdNode) : null;
          const startDate = typeof event === 'object' && event !== null ? (event as Record<string, unknown>).StartDate : null;
          const dateStr = typeof startDate === 'object' && startDate !== null ? (startDate as Record<string, unknown>).Date : null;
          if (typeof dateStr === 'string' && dateStr >= todayIso && eventId && !seenEventIds.has(eventId)) {
            seenEventIds.add(eventId);
            if (dateStr === todayIso) {
              todayCount++;
              const eventName = typeof event === 'object' && event !== null ? (event as Record<string, unknown>).Name : null;
              if (typeof eventName === 'string') todayEventNames.push(eventName);
            } else {
              futureCount++;
            }
          }
        }

        if (todayCount > 0 || futureCount > 0) {
          result[String(friend.personId)] = { today: todayCount, future: futureCount, todayEventNames };
        }
      } catch {
        // Silently skip on error
      }
    }),
  );

  return result;
}

/**
 * Determines if a start time (Swedish local ISO string) has already passed.
 * Returns true if the time is in the past, false if in the future or unknown.
 */
function hasStartTimePassed(startTime: string | null): boolean {
  if (!startTime) return false;
  // Eventor start times are Swedish local time without timezone indicator.
  // Assume Europe/Stockholm (CEST = UTC+2 in summer, CET = UTC+1 in winter).
  let normalized = startTime;
  if (!startTime.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(startTime)) {
    const month = new Date(startTime + 'Z').getUTCMonth(); // 0-based
    const offset = (month >= 2 && month <= 9) ? '+02:00' : '+01:00';
    normalized = startTime + offset;
  }
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() <= Date.now();
}

/**
 * Fetches today's starts for each friend directly from Eventor /starts/person.
 * Returns a map of friendId → { eventName } for friends that have a start today.
 */
async function fetchFriendTodayStarts(friends: Friend[]): Promise<Record<string, { eventName: string; startTime: string | null }>> {
  const todayIso = formatLocalIsoDate(new Date());
  const from = `${todayIso} 00:00:00`;
  const to = `${todayIso} 23:59:59`;

  const result: Record<string, { eventName: string; startTime: string | null }> = {};

  const BATCH_SIZE = 5;
  for (let i = 0; i < friends.length; i += BATCH_SIZE) {
    const batch = friends.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (friend) => {
        try {
          const xml = await fetchPersonStartsXml(String(friend.personId), from, to);
          // Simple regex extraction — same approach as the backend
          const eventNameMatch = xml.match(/<Event\b[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/);
          if (eventNameMatch) {
            // Extract start time
            let startTime: string | null = null;
            const stMatch = xml.match(/<StartTime>\s*<Date>([^<]+)<\/Date>\s*<Clock>([^<]+)<\/Clock>/);
            if (stMatch) {
              startTime = `${stMatch[1].trim()}T${stMatch[2].trim()}`;
            } else {
              const stMatch2 = xml.match(/<StartTime>\s*<Date>([^<]+)<\/Date>\s*<Time>([^<]+)<\/Time>/);
              if (stMatch2) {
                startTime = `${stMatch2[1].trim()}T${stMatch2[2].trim()}`;
              }
            }
            result[String(friend.personId)] = { eventName: eventNameMatch[1], startTime };
          }
        } catch {
          // Silently skip on error
        }
      }),
    );
  }

  return result;
}

async function fetchFriendTodayResults(friends: Friend[]): Promise<Set<string>> {
  const todayIso = formatLocalIsoDate(new Date());
  const from = `${todayIso} 00:00:00`;
  const to = `${todayIso} 23:59:59`;

  const result = new Set<string>();

  const BATCH_SIZE = 5;
  for (let i = 0; i < friends.length; i += BATCH_SIZE) {
    const batch = friends.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (friend) => {
        try {
          const xml = await fetchPersonResultsXml(String(friend.personId), from, to);
          // Check if there's any result with a valid status or time
          const hasResult = /<CompetitorStatus\s+value="/.test(xml) ||
            /<Status>(OK|MisPunch|Overtime|Disqualified|DidNotFinish)<\/Status>/.test(xml) ||
            /<Time>[^<]+<\/Time>/.test(xml);
          if (hasResult) {
            result.add(String(friend.personId));
          }
        } catch {
          // Silently skip on error
        }
      }),
    );
  }

  return result;
}
