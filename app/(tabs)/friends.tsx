import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFocusEffect } from 'expo-router';

import { AppTextField } from '@/src/components/AppTextField';
import { EmptyState } from '@/src/components/EmptyState';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { useAuthStore } from '@/src/store/authStore';
import { useFriendActivityStore } from '@/src/store/friendActivityStore';
import { Friend, useFriendsStore } from '@/src/store/friendsStore';
import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

const PERSON_SEARCH_URL = 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/person-search';

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
  const [searchName, setSearchName] = React.useState('');
  const [searchClub, setSearchClub] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<PersonSearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  const friendPersonIds = React.useMemo(() => new Set(friends.map((f) => f.personId)), [friends]);

  // Subscribe reactively so FlatList re-renders when activity state changes
  const activityByFriendId = useFriendActivityStore((s) => s.activityByFriendId);
  const fetchTodayActivity = useFriendActivityStore((s) => s.fetchTodayActivity);
  useFocusEffect(
    React.useCallback(() => {
      if (friends.length > 0) {
        void fetchTodayActivity(friends.map((f) => String(f.personId)));
      }
    }, [friends, fetchTodayActivity]),
  );

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
          renderItem={({ item }) => {
            const today = new Date().toISOString().slice(0, 10);
            const entry = activityByFriendId[String(item.personId)];
            const hasActivity = entry != null && entry.date === today;
            const isResult = hasActivity && entry.type === 'friend-results';
            const activityColor = isResult ? colors.primary : colors.accent;
            return (
            <Pressable
              onPress={() => router.push(`/friend/${item.personId}`)}
              style={({ pressed }) => [styles.friendCard, hasActivity ? { borderColor: activityColor, borderWidth: 1.5 } : null, pressed ? styles.friendCardPressed : null]}
            >
              {hasActivity ? (
                <View style={[styles.activityDot, { backgroundColor: activityColor }]} />
              ) : null}
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
      borderRadius: 5,
      height: 10,
      width: 10,
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
  });
}
