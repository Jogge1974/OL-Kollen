import { router, usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PersonActivitySectionList } from '@/src/components/PersonActivitySectionList';
import { colors } from '@/src/theme/colors';
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

  if (!error && sections.length === 0) {
    return null;
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Mina kommande starter</Text>
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

const styles = StyleSheet.create({
  panel: {
    backgroundColor: 'transparent',
    borderColor: colors.primary,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 19,
    paddingTop: 2,
  },
});
