import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppTextField } from '@/src/components/AppTextField';
import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

const PERSON_SEARCH_URL = 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/person-search';

export type PersonSearchResult = {
  birthYear: number | null;
  club: string;
  gender: string;
  name: string;
  nationality: string;
  personId: number;
};

type PersonSearchPickerProps = {
  onSelect: (result: PersonSearchResult) => void;
};

// Same search card as the friend picker in Vän-vyn (search by name/club against
// the person-search edge function), reused here so the user can pick "who am I".
export function PersonSearchPicker({ onSelect }: PersonSearchPickerProps) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = React.useState('');
  const [club, setClub] = React.useState('');
  const [results, setResults] = React.useState<PersonSearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  const canSearch = name.trim().length >= 3 || club.trim().length >= 3;

  React.useEffect(() => {
    if (!canSearch) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (name.trim().length >= 3) params.set('name', name.trim());
        if (club.trim().length >= 3) params.set('club', club.trim());
        const response = await fetch(`${PERSON_SEARCH_URL}?${params.toString()}`);
        if (!response.ok) {
          setResults([]);
          return;
        }
        const json = await response.json();
        setResults(json.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      clearTimeout(timeout);
      setIsSearching(false);
    };
  }, [name, club, canSearch]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.fieldsRow}>
        <View style={styles.fieldWrap}>
          <AppTextField
            autoCapitalize="words"
            autoCorrect={false}
            label="Namn"
            onChangeText={setName}
            onClearText={() => setName('')}
            placeholder="För- eller efternamn"
            value={name}
          />
        </View>
        <View style={styles.fieldWrap}>
          <AppTextField
            autoCapitalize="none"
            autoCorrect={false}
            label="Klubb"
            onChangeText={setClub}
            onClearText={() => setClub('')}
            placeholder="Klubbnamn"
            value={club}
          />
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => `${item.personId}`}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          isSearching ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.md }} />
          ) : !canSearch ? (
            <Text style={styles.emptyText}>Skriv minst 3 tecken i namn eller klubb.</Text>
          ) : (
            <Text style={styles.emptyText}>Inga personer matchar sökningen.</Text>
          )
        }
        contentContainerStyle={styles.results}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item)}
            style={({ pressed }) => [styles.resultItem, pressed ? styles.resultItemPressed : null]}
          >
            <View style={styles.resultContent}>
              <Text numberOfLines={1} style={styles.resultName}>
                {item.name}
              </Text>
              <Text numberOfLines={1} style={styles.resultSub}>
                {item.birthYear ? `f. ${item.birthYear} • ` : ''}
                {item.club}
              </Text>
            </View>
            <Ionicons color={colors.textMuted} name="chevron-forward" size={20} />
          </Pressable>
        )}
        scrollEnabled={false}
      />
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
      paddingVertical: spacing.md,
      textAlign: 'center',
    },
    fieldWrap: {
      flex: 1,
    },
    fieldsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    resultContent: {
      flex: 1,
      gap: 2,
    },
    resultItem: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    resultItemPressed: {
      opacity: 0.85,
    },
    resultName: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
    },
    resultSub: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    results: {
      gap: 8,
      paddingTop: spacing.sm,
    },
    wrapper: {
      gap: spacing.sm,
    },
  });
}
