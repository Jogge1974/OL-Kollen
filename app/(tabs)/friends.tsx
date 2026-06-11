import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useFocusEffect } from 'expo-router';

import { AppTextField } from '@/src/components/AppTextField';
import { EmptyState } from '@/src/components/EmptyState';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { fetchEventorEventById, fetchPersonEntriesXml, fetchPersonResultsXml, fetchPersonStartsXml } from '@/src/api/eventorApi';
import { findLiveCompetitionsBatch, findLiveCompetitionIdsBatch, getCompetitionClasses, getLiveFavoriteResults } from '@/src/services/liveresultat';
import type { LiveFavorite, LiveFavoriteResult } from '@/src/services/liveresultat';
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
  const [entryCountByFriendId, setEntryCountByFriendId] = React.useState<Record<string, { today: number; future: number; todayEventNames: string[]; todayEvents: { eventId: string; eventName: string }[] }>>({});

  // Today's starts fetched directly from Eventor (client-side fallback)
  const [todayStartsByFriendId, setTodayStartsByFriendId] = React.useState<Record<string, { eventName: string; startTime: string | null; className: string | null; organiserName: string | null }>>({});

  // Friends who have results today (client-side check from Eventor)
  const [todayResultFriendIds, setTodayResultFriendIds] = React.useState<Set<string>>(new Set());

  // Set of eventIds that have a liveresultat match today
  const [liveEventIds, setLiveEventIds] = React.useState<Set<string>>(new Set());
  // Map of eventId/eventName → liveCompetitionId + competitionName
  const [liveCompMap, setLiveCompMap] = React.useState<Map<string, number>>(new Map());
  // Live friends modal
  const [liveModalVisible, setLiveModalVisible] = React.useState(false);

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
    // key (eventId or eventName, matching the lookups below) → eventName
    const startEvents = new Map<string, string>();
    // key → organiser name (used to relax the name-match threshold to 0.3)
    const organiserByKey = new Map<string, string>();
    // key → eventId, so we can resolve the organiser via the event detail API
    // for sources that don't carry it (entries XML + backend activity).
    const eventIdByKey = new Map<string, string>();

    // From backend activity state (keyed by eventId)
    for (const entry of Object.values(activityByFriendId)) {
      if (entry.date === today && entry.type === 'friend-start' && entry.eventName) {
        startEvents.set(entry.eventId, entry.eventName);
        eventIdByKey.set(entry.eventId, entry.eventId);
      }
    }

    // From client-side today starts (keyed by eventName; carries organiser)
    for (const start of Object.values(todayStartsByFriendId)) {
      if (!startEvents.has(start.eventName)) {
        startEvents.set(start.eventName, start.eventName);
      }
      if (start.organiserName) {
        organiserByKey.set(start.eventName, start.organiserName);
      }
    }

    // From client-side entry data (keyed by eventName; carries eventId, no organiser)
    for (const counts of Object.values(entryCountByFriendId)) {
      for (const ev of counts.todayEvents) {
        if (!startEvents.has(ev.eventName)) {
          startEvents.set(ev.eventName, ev.eventName);
        }
        if (!eventIdByKey.has(ev.eventName)) {
          eventIdByKey.set(ev.eventName, ev.eventId);
        }
      }
    }

    if (startEvents.size === 0) {
      setLiveEventIds(new Set());
      setLiveCompMap(new Map());
      return;
    }

    let cancelled = false;
    void (async () => {
      // Resolve organisers via the event detail API for keys that lack one
      // (entries XML and backend activity don't include the organiser, but the
      // organiser is what lets us match e.g. 'Veteran-OL Göteborg' to
      // 'Veteral-OL IK Stern …' where the names alone score below 0.6).
      const eventIdsToResolve = [...new Set(
        [...startEvents.keys()]
          .filter((key) => !organiserByKey.has(key) && eventIdByKey.has(key))
          .map((key) => eventIdByKey.get(key) as string),
      )];
      const organiserByEventId = new Map<string, string>();
      await Promise.all(eventIdsToResolve.map(async (eventId) => {
        try {
          const detail = await fetchEventorEventById(eventId, null);
          if (detail.organiserNames.length > 0) {
            organiserByEventId.set(eventId, detail.organiserNames.join(', '));
          }
        } catch {
          // Ignore — fall back to name-only matching for this event.
        }
      }));
      for (const key of startEvents.keys()) {
        if (organiserByKey.has(key)) continue;
        const eventId = eventIdByKey.get(key);
        const organiser = eventId ? organiserByEventId.get(eventId) : undefined;
        if (organiser) organiserByKey.set(key, organiser);
      }

      if (cancelled) return;
      const events = [...startEvents.entries()].map(([eventId, eventName]) => ({
        eventId,
        eventName,
        eventDate: today,
        organizer: organiserByKey.get(eventId) ?? null,
      }));
      const [ids, comps] = await Promise.all([
        findLiveCompetitionsBatch(events),
        findLiveCompetitionIdsBatch(events),
      ]);
      if (cancelled) return;
      setLiveEventIds(ids);
      setLiveCompMap(comps);
    })();
    return () => { cancelled = true; };
  }, [activityByFriendId, todayStartsByFriendId, entryCountByFriendId]);

  // Friends who are currently "live" (orange dot) — derive their LiveFavorite payload
  const liveFriends = React.useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const result: Array<{ friend: Friend; favorite: LiveFavorite }> = [];

    for (const friend of friends) {
      const pid = String(friend.personId);
      const activity = activityByFriendId[pid];
      const hasActivity = activity != null && activity.date === today;
      const isResult = (hasActivity && activity.type === 'friend-results') || todayResultFriendIds.has(pid);
      if (isResult) continue; // results trump live status

      const isStart = hasActivity && activity.type === 'friend-start';
      const hasTodayStartFromStarts = todayStartsByFriendId[pid] != null;
      const counts = entryCountByFriendId[pid];
      const todayEntries = counts?.today ?? 0;
      const hasTodayStart = isStart || hasTodayStartFromStarts || todayEntries > 0;
      if (!hasTodayStart) continue;

      // Determine if this event is live
      let eventKey: string | null = null;
      let compId: number | null = null;
      let compName = '';

      if (isStart && liveEventIds.has(activity.eventId)) {
        eventKey = activity.eventId;
        compName = activity.eventName ?? '';
      } else if (hasTodayStartFromStarts && liveEventIds.has(todayStartsByFriendId[pid].eventName)) {
        eventKey = todayStartsByFriendId[pid].eventName;
        compName = todayStartsByFriendId[pid].eventName;
      } else if (counts && counts.todayEventNames.some((n) => liveEventIds.has(n))) {
        eventKey = counts.todayEventNames.find((n) => liveEventIds.has(n)) ?? null;
        compName = eventKey ?? '';
      }

      if (!eventKey) continue;
      compId = liveCompMap.get(eventKey) ?? null;
      if (!compId) continue;

      const className = todayStartsByFriendId[pid]?.className ?? '';
      result.push({
        friend,
        favorite: {
          competitionId: compId,
          competitionName: compName,
          className,
          name: friend.name,
          club: friend.club,
        },
      });
    }

    return result;
  }, [friends, activityByFriendId, todayStartsByFriendId, entryCountByFriendId, todayResultFriendIds, liveEventIds, liveCompMap]);

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
      pushOnLive: false,
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
        {liveFriends.length > 0 ? (
          <Pressable onPress={() => setLiveModalVisible(true)} style={({ pressed }) => [styles.liveBadge, pressed ? { opacity: 0.8 } : null]}>
            <Ionicons color="#fff" name="radio-outline" size={14} />
            <Text style={styles.liveBadgeText}>Följ vänner LIVE</Text>
          </Pressable>
        ) : null}
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

      {/* Live Friends Modal */}
      <Modal animationType="slide" onRequestClose={() => setLiveModalVisible(false)} visible={liveModalVisible}>
        <SafeAreaProvider>
          <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
            <LiveFriendsPanel
              friends={liveFriends}
              onClose={() => setLiveModalVisible(false)}
            />
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}

// --- Live Friends Panel ---

/**
 * Stable lookup key for matching a liveresultat result to a friend.
 * Normalised name + club (case/space-insensitive); className is intentionally
 * excluded because we resolve it from the response, not in advance.
 */
function liveResultKey(name: string, club: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${norm(name)}|${norm(club)}`;
}

function LiveFriendsPanel({
  friends,
  onClose,
}: {
  friends: Array<{ friend: Friend; favorite: LiveFavorite }>;
  onClose: () => void;
}) {
  const { colors, isDark, themeName } = useTheme();
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  const styles = React.useMemo(() => createStyles(colors, isDark, isSoft), [colors, isDark, isSoft]);
  const liveOrange = isDark ? '#C48800' : '#F6A60A';

  const [results, setResults] = React.useState<Map<string, LiveFavoriteResult>>(new Map());
  const [expandedFriends, setExpandedFriends] = React.useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = React.useState(true);
  const [countdown, setCountdown] = React.useState(15);

  const favorites = React.useMemo(() => friends.map((f) => f.favorite), [friends]);

  const fetchResults = React.useCallback(async () => {
    if (favorites.length === 0) return;

    // getFavoriteresult matches strictly on name + club + className. We often
    // don't know a friend's liveresultat className (e.g. friends only entered,
    // not yet started — the entries XML has no class we can rely on, and the
    // class label can differ from Eventor's). So fetch the class list per
    // competition and submit one favorite per class ("shotgun"); the backend
    // returns only the matching class for each runner.
    const competitionIds = [...new Set(favorites.map((f) => f.competitionId))];
    const classesByComp = new Map<number, string[]>();
    await Promise.all(competitionIds.map(async (compId) => {
      classesByComp.set(compId, await getCompetitionClasses(compId));
    }));

    const expanded: LiveFavorite[] = [];
    for (const fav of favorites) {
      const classes = classesByComp.get(fav.competitionId) ?? [];
      // Keep the known className first (cheap hit), then fan out to all classes.
      const classNames = new Set<string>();
      if (fav.className) classNames.add(fav.className);
      for (const c of classes) classNames.add(c);
      if (classNames.size === 0) classNames.add(fav.className); // may be ''
      for (const className of classNames) {
        expanded.push({ ...fav, className });
      }
    }

    const data = await getLiveFavoriteResults(expanded);
    const map = new Map<string, LiveFavoriteResult>();
    for (const r of data) {
      // Key by name+club only — the friend is a unique person, and the response
      // carries the real className (which we couldn't know in advance).
      map.set(liveResultKey(r.name, r.club), r);
    }
    setResults(map);
    setIsLoading(false);
  }, [favorites]);

  // Initial fetch + 15s polling
  React.useEffect(() => {
    void fetchResults();
    setCountdown(15);
    const interval = setInterval(() => { void fetchResults(); setCountdown(15); }, 15000);
    return () => clearInterval(interval);
  }, [fetchResults]);

  // Tick every second: countdown + running time
  const [nowCentis, setNowCentis] = React.useState(() => {
    const now = new Date();
    return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 100;
  });

  React.useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
      const now = new Date();
      setNowCentis((now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 100);
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const toggleExpand = (personId: number) => {
    setExpandedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  const formatStatus = (status: number) => {
    switch (status) {
      case 0: return 'OK';
      case 1: return 'DNS';
      case 2: return 'DNF';
      case 3: return 'MP';
      case 4: return 'DSQ';
      case 5: return 'OT';
      case 9: case 10: return 'I skogen';
      case 11: return 'WO';
      case 12: return 'MU';
      default: return 'Ej startat';
    }
  };

  const isRunning = (status: number) => status === 9 || status === 10;

  const formatCentis = (centis: string | number | null | undefined): string => {
    if (centis == null) return '-';
    const c = typeof centis === 'string' ? parseInt(centis, 10) : centis;
    if (isNaN(c) || c <= 0) return '-';
    const totalSec = Math.floor(c / 100);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hours > 0) return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const formatTimePlus = (centis: string | number | null | undefined): string => {
    if (centis == null) return '-';
    const c = typeof centis === 'string' ? parseInt(centis, 10) : centis;
    if (isNaN(c) || c === 0) return '±0';
    const totalSec = Math.floor(Math.abs(c) / 100);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const sign = c > 0 ? '+' : '-';
    if (mins > 0) return `${sign}${mins}:${String(secs).padStart(2, '0')}`;
    return `${sign}${secs}s`;
  };

  const getRunningTime = (startCentis: number): string => {
    const elapsed = nowCentis - startCentis;
    if (elapsed <= 0) return '0:00';
    return formatCentis(elapsed);
  };

  const formatStartClock = (startCentis: number): string => {
    const totalSec = Math.floor(startCentis / 100);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const getCollapsedSummary = (result: LiveFavoriteResult) => {
    if (result.status === 0) {
      // Finished OK — find RESULT split for formatted timeplus
      const resultSplit = result.splitresults?.find((s) => s.splitname === 'RESULT');
      const tp = resultSplit?.splittimeplus || formatTimePlus(result.timeplus);
      // The placement is only final once every runner in the class is in (none
      // left in the forest). Until then it's preliminary.
      const inForest = typeof result.inForest === 'number' ? result.inForest : 0;
      return {
        style: 'finished' as const,
        time: formatCentis(result.result),
        place: result.place || '',
        timeplus: tp,
        className: result.className || '',
        classFinished: inForest <= 0,
      };
    }
    if (result.status === 9 || result.status === 10) {
      if (result.start <= 0) {
        // No allotted start time (free start) — the runner can start whenever.
        return { line1: 'Starttid saknas', line2: '', style: 'muted' as const };
      }
      if (result.start > nowCentis) {
        return { line1: `Start ${formatStartClock(result.start)}`, line2: '', style: 'muted' as const };
      }
      return { line1: getRunningTime(result.start), line2: '', style: 'running' as const };
    }
    return { line1: formatStatus(result.status), line2: '', style: 'muted' as const };
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.liveHeader}>
        <Ionicons color={liveOrange} name="radio-outline" size={20} />
        <Text style={[styles.searchTitle, { flex: 1 }]}>Följ vänner LIVE</Text>
        <Pressable onPress={onClose} style={styles.searchCloseButton}>
          <Ionicons color={colors.primary} name="close-circle-outline" size={18} />
          <Text style={styles.searchCloseText}>Stäng</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <ActivityIndicator color={liveOrange} size="large" />
          <Text style={[styles.liveSubtext, { marginTop: 12 }]}>Hämtar livedata...</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 40 }}
          data={friends}
          keyExtractor={(item) => String(item.friend.personId)}
          renderItem={({ item }) => {
            const key = liveResultKey(item.favorite.name, item.favorite.club);
            const result = results.get(key);
            const isExpanded = expandedFriends.has(item.friend.personId);

            return (
              <View style={styles.livePanelItem}>
                <Pressable onPress={() => toggleExpand(item.friend.personId)} style={styles.livePanelHeader}>
                  <View style={styles.liveDotPulse}>
                    <View style={[styles.liveDotSmall, { backgroundColor: liveOrange }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.livePanelName}>{item.friend.name}</Text>
                    <Text style={styles.livePanelMeta}>{item.friend.club}</Text>
                  </View>
                  {result ? (() => {
                    const summary = getCollapsedSummary(result);
                    if (summary.style === 'finished') {
                      return (
                        <View style={styles.livePanelSummary}>
                          <View style={styles.liveSummaryFinishedRow}>
                            {/* Column 1: time over timeplus (same column) */}
                            <View style={styles.liveSummaryTimeCol}>
                              <Text style={styles.liveSummaryTime}>{summary.time}</Text>
                              <Text style={styles.liveSummaryTimeplus}>{summary.timeplus}</Text>
                            </View>
                            {/* Column 2: placement chip over class */}
                            <View style={styles.liveSummaryMetaCol}>
                              {summary.place ? (
                                <View style={[
                                  styles.livePlaceChip,
                                  summary.classFinished ? styles.livePlaceChipFinal : styles.livePlaceChipPrelim,
                                ]}>
                                  <Ionicons
                                    color={summary.classFinished ? colors.primary : colors.textMuted}
                                    name={summary.classFinished ? 'trophy' : 'hourglass-outline'}
                                    size={12}
                                  />
                                  <Text style={[
                                    styles.livePlaceChipText,
                                    summary.classFinished ? styles.livePlaceChipTextFinal : styles.livePlaceChipTextPrelim,
                                  ]}>
                                    {summary.classFinished ? `Plac ${summary.place}` : `Prel ${summary.place}`}
                                  </Text>
                                </View>
                              ) : null}
                              {summary.className ? (
                                <Text style={styles.liveSummaryClass}>{summary.className}</Text>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      );
                    }
                    return (
                      <View style={styles.livePanelSummary}>
                        <Text style={[
                          styles.livePanelPlace,
                          summary.style === 'running' ? { color: liveOrange } : null,
                          summary.style === 'muted' ? { color: colors.textMuted, fontSize: 13 } : null,
                        ]}>
                          {summary.line1}
                        </Text>
                        {summary.line2 ? (
                          <Text style={styles.livePanelTime}>{summary.line2}</Text>
                        ) : null}
                      </View>
                    );
                  })() : null}
                  <Ionicons color={colors.textMuted} name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={16} />
                </Pressable>

                {isExpanded && result ? (
                  <View style={styles.livePanelExpanded}>
                    <View style={styles.livePanelCompRow}>
                      <Ionicons color={colors.textMuted} name="flag-outline" size={12} />
                      <Text style={styles.livePanelCompName} numberOfLines={1}>{result.competitionName}</Text>
                      <Pressable
                        onPress={() => Linking.openURL(`https://orientering.liveidrott.se/competitions/${result.competitionId}`)}
                        style={({ pressed }) => [styles.liveCompLink, pressed ? { opacity: 0.6 } : null]}
                      >
                        <Ionicons color={liveOrange} name="open-outline" size={13} />
                        <Text style={styles.liveCompLinkText}>Till Liveresultat</Text>
                      </Pressable>
                    </View>

                    <View style={styles.livePanelBodyRow}>
                      <View style={styles.livePanelBodyCard}>
                        {/* Left: splits table */}
                        <View style={styles.liveSplitsTable}>
                          {result.splitresults && result.splitresults.length > 0 ? (
                            result.splitresults.map((s, i) => {
                              const displayName = s.splitname === 'STARTTIME' ? 'Starttid' : s.splitname === 'RESULT' ? 'Resultat' : s.splitname;
                              const iconName = s.splitname === 'STARTTIME' ? 'play-circle-outline' : s.splitname === 'RESULT' ? 'flag-outline' : 'radio-outline';
                              const isLast = i === result.splitresults.length - 1;
                              return (
                                <React.Fragment key={i}>
                                  <View style={styles.liveSplitRow}>
                                    <Ionicons color={liveOrange} name={iconName as any} size={12} style={styles.liveSplitIcon} />
                                    <Text style={styles.liveSplitName} numberOfLines={1}>{displayName}</Text>
                                    {s.splitname === 'STARTTIME' ? (
                                      <Text style={styles.liveSplitResultWide}>{result.start > 0 ? s.splitresult : 'Starttid saknas'}</Text>
                                    ) : (
                                      <>
                                        <Text style={styles.liveSplitResult}>{s.splitresult}</Text>
                                        <Text style={styles.liveSplitPlace}>{s.splitplace}</Text>
                                        <Text style={styles.liveSplitTimeplus}>{s.splittimeplus}</Text>
                                      </>
                                    )}
                                  </View>
                                  {!isLast ? <View style={styles.liveSplitDivider} /> : null}
                                </React.Fragment>
                              );
                            })
                          ) : (
                            <Text style={styles.liveSubtext}>Inga sträcktider</Text>
                          )}
                          {isRunning(result.status) && result.start > 0 && result.splitresults && result.splitresults.length > 0 && result.splitresults[result.splitresults.length - 1].splitname !== 'RESULT' ? (
                            <>
                              <View style={styles.liveSplitDivider} />
                              <View style={styles.liveSplitRow}>
                                <Ionicons color={liveOrange} name="navigate-outline" size={12} style={styles.liveSplitIcon} />
                                <Text style={[styles.liveSplitName, { color: liveOrange }]} numberOfLines={1}>...</Text>
                                <Text style={[styles.liveSplitResultWide, { color: liveOrange }]}>{getRunningTime(result.start)}</Text>
                              </View>
                            </>
                          ) : null}
                        </View>

                        {/* Vertical divider */}
                        <View style={styles.liveVerticalDivider} />

                        {/* Right: stats */}
                        <View style={styles.liveStatsSection}>
                          <View style={styles.liveStatsRow}>
                            <Ionicons color={liveOrange} name="people-outline" size={13} />
                            <Text style={styles.liveStatsLabel}>Antal i klassen</Text>
                            <Text style={styles.liveStatsValue}>{result.inClass ?? '-'}</Text>
                          </View>
                          <View style={styles.liveStatsDivider} />
                          <View style={styles.liveStatsRow}>
                            <Ionicons color={liveOrange} name="leaf-outline" size={13} />
                            <Text style={styles.liveStatsLabel}>Kvar i skogen</Text>
                            <Text style={styles.liveStatsValue}>{result.inForest ?? '-'}</Text>
                          </View>
                          <View style={styles.liveStatsDivider} />
                          <View style={styles.liveStatsRow}>
                            <Ionicons color={liveOrange} name="podium-outline" size={13} />
                            <Text style={styles.liveStatsLabel}>Möjl. slutplac.</Text>
                            <Text style={styles.liveStatsValue}>{result.worseCasePlace ?? '-'}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                ) : isExpanded ? (
                  <View style={styles.livePanelExpanded}>
                    <Text style={styles.liveSubtext}>
                                    Väntar på resultat från 'liveresultat.orientering.se'.                                    
                    </Text>
                    <Pressable
                      onPress={() => Linking.openURL(`https://orientering.liveidrott.se/competitions/${item.favorite.competitionId}`)}
                      style={({ pressed }) => [styles.liveLinkButton, pressed ? { opacity: 0.7 } : null]}
                    >
                      <Ionicons color="#fff" name="open-outline" size={14} />
                      <Text style={styles.liveLinkButtonText}>Nya Liveresultat</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}

      <Text style={styles.liveFooter}>Uppdateras om {countdown} sekunder</Text>
    </View>
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
      backgroundColor: isSoft && isDark ? colors.surfaceMuted : isSoft ? '#E0ECF8' : isDark ? colors.surfaceMuted : '#E7F4D8',
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
    // Live badge
    liveBadge: {
      alignItems: 'center',
      backgroundColor: isDark ? '#C48800' : '#F6A60A',
      borderRadius: 999,
      flexDirection: 'row',
      gap: 5,
      marginLeft: spacing.sm,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    liveBadgeText: {
      ...typography.captionStrong,
      color: '#fff',
      fontSize: 12,
    },
    // Live modal styles
    liveHeader: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    liveFooter: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 10,
      paddingBottom: spacing.sm,
      textAlign: 'center',
    },
    liveSubtext: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 12,
    },
    livePanelItem: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      marginTop: spacing.sm,
      overflow: 'hidden',
      ...(isDark ? {} : {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      }),
    },
    livePanelHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
    },
    liveDotPulse: {
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(196, 136, 0, 0.15)' : 'rgba(246, 166, 10, 0.15)',
      borderRadius: 12,
      height: 24,
      justifyContent: 'center',
      width: 24,
    },
    liveDotSmall: {
      borderRadius: 5,
      height: 10,
      width: 10,
    },
    livePanelName: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      fontSize: 14,
    },
    livePanelMeta: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
    },
    livePanelSummary: {
      alignItems: 'flex-end',
    },
    livePanelPlace: {
      ...typography.bodyStrong,
      color: colors.primaryDeep,
      fontSize: 16,
    },
    livePanelTime: {
      ...typography.caption,
      color: colors.textSecondary,
      fontSize: 11,
    },
    liveSummaryFinishedRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'flex-end',
    },
    liveSummaryTimeCol: {
      alignItems: 'flex-end',
    },
    liveSummaryMetaCol: {
      alignItems: 'flex-end',
      gap: 2,
    },
    liveSummaryTime: {
      ...typography.bodyStrong,
      color: colors.primaryDeep,
      fontSize: 15,
    },
    livePlaceChip: {
      alignItems: 'center',
      borderRadius: 6,
      flexDirection: 'row',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    livePlaceChipFinal: {
      backgroundColor: isDark ? 'rgba(76, 139, 71, 0.20)' : 'rgba(76, 139, 71, 0.12)',
    },
    livePlaceChipPrelim: {
      backgroundColor: isDark ? 'rgba(124, 134, 121, 0.20)' : 'rgba(124, 134, 121, 0.12)',
    },
    livePlaceChipText: {
      ...typography.captionStrong,
      fontSize: 13,
    },
    livePlaceChipTextFinal: {
      color: colors.primary,
    },
    livePlaceChipTextPrelim: {
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    liveSummaryTimeplus: {
      ...typography.caption,
      color: colors.textSecondary,
      fontSize: 12,
    },
    liveSummaryClass: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
    },
    livePanelExpanded: {
      backgroundColor: isDark ? 'rgba(246, 166, 10, 0.06)' : 'rgba(246, 166, 10, 0.03)',
      borderTopColor: isDark ? 'rgba(246, 166, 10, 0.2)' : 'rgba(246, 166, 10, 0.15)',
      borderTopWidth: 1,
      gap: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
    },
    livePanelCompRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    livePanelBodyRow: {
      flexDirection: 'row',
      gap: 0,
    },
    livePanelBodyCard: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      borderRadius: 10,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    liveSplitsTable: {
      flex: 1,
      gap: 0,
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    liveSplitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 4,
      borderRadius: 4,
    },
    liveSplitIcon: {
      width: 14,
    },
    liveSplitDivider: {
      backgroundColor: colors.border,
      height: 1,
      marginHorizontal: 4,
      opacity: 0.4,
    },
    liveSplitName: {
      ...typography.captionStrong,
      color: colors.textPrimary,
      fontSize: 10,
      flex: 1,
    },
    liveSplitResult: {
      ...typography.caption,
      color: colors.textSecondary,
      flexShrink: 0,
      fontSize: 13,
      fontWeight: '400',
      width: 44,
      textAlign: 'right',
    },
    liveSplitPlace: {
      ...typography.caption,
      color: colors.textMuted,
      flexShrink: 0,
      fontSize: 13,
      fontWeight: '400',
      width: 24,
      textAlign: 'right',
    },
    liveSplitTimeplus: {
      ...typography.caption,
      color: colors.textMuted,
      flexShrink: 0,
      fontSize: 13,
      fontWeight: '400',
      width: 50,
      textAlign: 'right',
    },
    liveSplitResultWide: {
      ...typography.caption,
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '400',
      flex: 1,
      textAlign: 'right',
    },
    liveVerticalDivider: {
      backgroundColor: colors.border,
      opacity: 0.6,
      width: 1,
    },
    liveStatsSection: {
      flexShrink: 0,
      gap: 0,
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    liveStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 5,
    },
    liveStatsDivider: {
      backgroundColor: colors.border,
      height: 1,
      opacity: 0.6,
    },
    liveStatsLabel: {
      ...typography.captionStrong,
      color: colors.textPrimary,
      fontSize: 10,
    },
    liveStatsValue: {
      ...typography.caption,
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '400',
      marginLeft: 'auto',
    },
    livePanelCompName: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      flex: 1,
      fontSize: 13,
    },
    livePanelStatsRow: {
      flexDirection: 'row',
      gap: 4,
    },
    livePanelStat: {
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      borderRadius: 8,
      flex: 1,
      paddingVertical: 6,
    },
    livePanelStatLabel: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 9,
    },
    livePanelStatValue: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      fontSize: 13,
    },
    livePanelRunningRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    livePanelRunningText: {
      ...typography.captionStrong,
      fontSize: 11,
    },
    livePanelSplitRow: {
      gap: 2,
    },
    livePanelSplitLabel: {
      ...typography.captionStrong,
      color: colors.textMuted,
      fontSize: 10,
    },
    livePanelSplitValue: {
      ...typography.caption,
      color: colors.textPrimary,
      fontSize: 12,
    },
    livePanelStatus: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 10,
    },
    liveLinkButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: isDark ? '#C48800' : '#F6A60A',
      borderRadius: 8,
      flexDirection: 'row',
      gap: 6,
      marginTop: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    liveLinkButtonText: {
      ...typography.captionStrong,
      color: '#fff',
      fontSize: 12,
    },
    liveCompLink: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexDirection: 'row',
      gap: 5,
      paddingVertical: 4,
    },
    liveCompLinkText: {
      ...typography.captionStrong,
      color: isDark ? '#C48800' : '#F6A60A',
      fontSize: 12,
      textDecorationLine: 'underline',
    },
  });
}

function formatLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function fetchFriendEntryCounts(friends: Friend[]): Promise<Record<string, { today: number; future: number; todayEventNames: string[]; todayEvents: { eventId: string; eventName: string }[] }>> {
  const todayIso = formatLocalIsoDate(new Date());
  const fromDate = `${todayIso} 00:00:00`;
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 9);
  const toDate = `${formatLocalIsoDate(futureDate)} 23:59:59`;

  const result: Record<string, { today: number; future: number; todayEventNames: string[]; todayEvents: { eventId: string; eventName: string }[] }> = {};

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
        const todayEvents: { eventId: string; eventName: string }[] = [];
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
              if (typeof eventName === 'string') {
                todayEventNames.push(eventName);
                todayEvents.push({ eventId, eventName });
              }
            } else {
              futureCount++;
            }
          }
        }

        if (todayCount > 0 || futureCount > 0) {
          result[String(friend.personId)] = { today: todayCount, future: futureCount, todayEventNames, todayEvents };
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
async function fetchFriendTodayStarts(friends: Friend[]): Promise<Record<string, { eventName: string; startTime: string | null; className: string | null; organiserName: string | null }>> {
  const todayIso = formatLocalIsoDate(new Date());
  const from = `${todayIso} 00:00:00`;
  const to = `${todayIso} 23:59:59`;

  const result: Record<string, { eventName: string; startTime: string | null; className: string | null; organiserName: string | null }> = {};

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
            // Extract class name
            const classMatch = xml.match(/<EventClass\b[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/);
            const className = classMatch ? classMatch[1] : null;
            // Extract organiser name — scoped to the <Organiser> element so we never
            // pick up the runner's own club (<PersonStart><Organisation><Name>).
            const orgBlock = xml.match(/<Organiser\b[\s\S]*?<\/Organiser>/)?.[0];
            const organiserName = orgBlock?.match(/<Name>([^<]+)<\/Name>/)?.[1]?.trim() ?? null;
            result[String(friend.personId)] = { eventName: eventNameMatch[1], startTime, className, organiserName };
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
          // Only count as result if there's an actual PersonResult with a finishing status
          // Exclude NotCompeting/NotYetStarted/Inactive which are not real results
          const hasFinishingResult =
            (/<PersonResult\b/.test(xml) || /<Result\b/.test(xml)) &&
            (/<CompetitorStatus\s+value="(OK|MisPunch|Overtime|Disqualified|DidNotFinish|DidNotStart)"/.test(xml) ||
              /<Status>(OK|MisPunch|Overtime|Disqualified|DidNotFinish|DidNotStart)<\/Status>/.test(xml));
          if (hasFinishingResult) {
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
