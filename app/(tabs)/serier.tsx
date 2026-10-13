import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { DEFAULT_ORGANISATION_ID } from '@/src/hooks/useOrganisationSeries';
import { useAuthStore } from '@/src/store/authStore';
import { openExternalLink } from '@/src/store/externalLinkStore';
import { ColorPalette, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';

// Serier scraped Eventor's public Standings pages, which are now behind a
// Cloudflare bot-check that blocks plain HTTP requests (same issue that broke
// Klubbaktiviteter). There's no official API for standings to fall back to, so
// the feature is disabled and this screen just explains why.
export default function SerierScreen() {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const warningColor = isDark ? '#F0A93A' : '#D97706';

  const user = useAuthStore((state) => state.user);
  const organisationId = user?.organisationIds[0] ? Number(user.organisationIds[0]) : DEFAULT_ORGANISATION_ID;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeroHeader
          eyebrow="TÄVLINGAR"
          subtitle={user?.organisationName ?? 'Svenska Orienteringsförbundet'}
          title="Serier"
          topRightContent={
            <Pressable
              onPress={() => openExternalLink(`https://eventor.orientering.se/Standings?organisationId=${organisationId}`)}
              style={styles.eventorBadge}
            >
              <Ionicons color={colors.heroText} name="open-outline" size={13} />
              <Text style={styles.eventorBadgeText}>Alla i Eventor</Text>
            </Pressable>
          }
        />

        <View style={styles.noticeCard}>
          <Ionicons color={warningColor} name="warning" size={56} />
          <Text style={styles.noticeTitle}>Information</Text>
          <Text style={styles.noticeText}>
            Vi kan tyvärr inte visa Serier i appen längre. Eventor tillåter inte längre att den här informationen hämtas
            automatiskt.
          </Text>
          <Text style={styles.noticeText}>Du kan fortfarande se serier och ställningar direkt i Eventor.</Text>
          <Pressable
            onPress={() => openExternalLink(`https://eventor.orientering.se/Standings?organisationId=${organisationId}`)}
            style={styles.noticeButton}
          >
            <Ionicons color="#fff" name="open-outline" size={16} />
            <Text style={styles.noticeButtonText}>Öppna organisationens serier i Eventor</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette, isDark: boolean) {
  return StyleSheet.create({
    content: {
      gap: spacing.lg,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
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
    noticeButton: {
      alignItems: 'center',
      backgroundColor: isDark ? '#8A5A12' : '#D97706',
      borderRadius: 16,
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    noticeButtonText: {
      ...typography.captionStrong,
      color: '#fff',
    },
    noticeCard: {
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.10)' : 'rgba(217, 119, 6, 0.06)',
      borderColor: isDark ? 'rgba(217, 119, 6, 0.45)' : 'rgba(217, 119, 6, 0.35)',
      borderRadius: 24,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.lg,
    },
    noticeText: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    noticeTitle: {
      ...typography.sectionTitle,
      color: colors.textPrimary,
      fontSize: 22,
    },
    safeArea: {
      backgroundColor: colors.background,
      flex: 1,
    },
  });
}
