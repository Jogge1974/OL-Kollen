import * as React from 'react';
import { router, usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { PersonActivitySectionList } from '@/src/components/PersonActivitySectionList';
import { ColorPalette, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { PersonActivitySection } from '@/src/types/personLists';

type UpcomingStartsPanelProps = {
  error: string | null;
  isLoading: boolean;
  sections: PersonActivitySection[];
};

export function UpcomingStartsPanel({ error, isLoading, sections }: UpcomingStartsPanelProps) {
  const pathname = usePathname();
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  if (!error && sections.length === 0) {
    return null;
  }

  return (
    <View style={styles.panel}>
      <View style={styles.titleRow}>
        <Ionicons color={isDark ? colors.accent : '#B8960A'} name="time-outline" size={18} />
        <Text style={styles.title}>Kommande starter</Text>
      </View>
      <PersonActivitySectionList
        emptyLabel="Det finns inga kommande starter just nu."
        error={error}
        isLoading={isLoading}
        kind="starts"
        onPressEvent={(eventId) => router.push({ params: { id: eventId, returnTo: pathname }, pathname: '/event/[id]' })}
        sections={sections}
      />
    </View>
  );
}

function createStyles(colors: ColorPalette, isDark: boolean) {
  return StyleSheet.create({
    panel: {
      backgroundColor: isDark ? colors.accentSoft : '#FFFBE6',
      borderColor: isDark ? colors.accent : '#D4A800',
      borderRadius: 24,
      borderWidth: 1.5,
      elevation: 3,
      gap: spacing.sm,
      padding: spacing.md,
      shadowColor: '#000',
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: isDark ? 0.35 : 0.1,
      shadowRadius: 10,
    },
    titleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    title: {
      ...typography.sectionTitle,
      color: colors.textPrimary,
      fontSize: 17,
      lineHeight: 21,
      paddingTop: 2,
    },
  });
}
