import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { EmptyState } from '@/src/components/EmptyState';
import { fetchActivityDetail, getCachedActivityDetail } from '@/src/api/eventorActivities';
import { ColorPalette, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { ActivityDocument, ActivityRegistration, ClubActivity } from '@/src/types/eventorActivities';

export default function ClubActivityDetailScreen() {
  const { colors, isDark, themeName } = useTheme();
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  const styles = React.useMemo(() => createStyles(colors, isDark, isSoft), [colors, isDark, isSoft]);

  const params = useLocalSearchParams<{ id?: string }>();
  const activityId = typeof params.id === 'string' ? params.id : '';

  const [activity, setActivity] = React.useState<ClubActivity | null>(() =>
    activityId ? getCachedActivityDetail(activityId) : null,
  );
  const [isLoading, setIsLoading] = React.useState(!activity);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!activityId) {
      setActivity(null);
      setIsLoading(false);
      return;
    }

    const cached = getCachedActivityDetail(activityId);
    if (cached) {
      setActivity(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    setActivity(null);
    setIsLoading(true);
    setError(null);

    fetchActivityDetail(activityId)
      .then((result) => {
        if (!isMounted) {
          return;
        }
        setActivity(result);
      })
      .catch((caught: unknown) => {
        if (!isMounted) {
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Det gick inte att hämta aktiviteten.');
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activityId]);

  const goBack = () => router.navigate('/klubbaktiviteter');

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <>
            <Pressable onPress={goBack} style={styles.backButton}>
              <Ionicons color={colors.primary} name="chevron-back" size={20} />
              <Text style={styles.backLabel}>Klubbaktiviteter</Text>
            </Pressable>
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Hämtar aktivitet…</Text>
            </View>
          </>
        ) : !activity ? (
          <>
            <Pressable onPress={goBack} style={styles.backButton}>
              <Ionicons color={colors.primary} name="chevron-back" size={20} />
              <Text style={styles.backLabel}>Klubbaktiviteter</Text>
            </Pressable>
            <EmptyState description={error ?? 'Aktiviteten kunde inte hittas.'} title="Kunde inte öppna aktiviteten" />
          </>
        ) : (
          <ActivityDetail activity={activity} colors={colors} onBack={goBack} styles={styles} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivityDetail({
  activity,
  colors,
  onBack,
  styles,
}: {
  activity: ClubActivity;
  colors: ColorPalette;
  onBack: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const registrations = activity.registrations;
  const registrationKeys = React.useMemo(
    () => registrations.map((registration, index) => `${registration.personName}-${index}`),
    [registrations],
  );
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const allExpanded = registrationKeys.length > 0 && registrationKeys.every((key) => expanded.has(key));

  const toggleOne = React.useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleAll = React.useCallback(() => {
    setExpanded(allExpanded ? new Set() : new Set(registrationKeys));
  }, [allExpanded, registrationKeys]);

  const summaries = React.useMemo(() => computeAttributeSummaries(activity), [activity]);
  const [summaryExpanded, setSummaryExpanded] = React.useState(false);
  const registrationHint = deadlineHint(activity.registrationDeadlineIso);
  const startDisplay = shortenSwedishDate(activity.startTime) ?? 'Ingen tid angiven';
  const deadlineDisplay = shortenSwedishDate(activity.registrationDeadline) ?? 'Ingen tid angiven';
  const [activeDocument, setActiveDocument] = React.useState<ActivityDocument | null>(null);

  return (
    <>
      <LinearGradient colors={[colors.heroTop, colors.heroBottom]} style={styles.hero}>
        <Pressable onPress={onBack} style={styles.heroBack}>
          <Ionicons color={colors.heroText} name="chevron-back" size={18} />
          <Text style={styles.heroBackLabel}>Klubbaktiviteter</Text>
        </Pressable>

        <View style={styles.heroBody}>
          <Text style={styles.heroTitle}>{activity.name}</Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.heroMetaItem}>
              <Ionicons color={colors.heroTextMuted} name="calendar-outline" size={14} />
              <Text style={styles.heroMeta}>{startDisplay}</Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons color={colors.heroText} name="people" size={12} />
              <Text style={styles.heroBadgeText}>{activity.registrationCount} anmälda</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.metaCard}>
        {activity.organiser ? (
          <>
            <MetaRow colors={colors} icon="flag-outline" label="Arrangör" styles={styles} value={activity.organiser} />
            <View style={styles.metaDivider} />
          </>
        ) : null}
        <MetaRow colors={colors} icon="calendar-outline" label="Starttid" styles={styles} value={startDisplay} />
        <View style={styles.metaDivider} />
        <View style={styles.deadlineBlock}>
          <View style={styles.metaRow}>
            <Ionicons color={colors.primary} name="time-outline" size={16} />
            <Text style={styles.metaLabel}>Anmälan stänger</Text>
            <View style={styles.metaValueWrap}>
              <Text style={styles.metaValue}>{deadlineDisplay}</Text>
              {registrationHint ? (
                <View style={styles.deadlineBadge}>
                  <Ionicons color={colors.error} name="alarm-outline" size={12} />
                  <Text style={styles.deadlineBadgeText}>{registrationHint}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <View style={styles.metaDivider} />
        <MetaRow colors={colors} icon="people-outline" label="Anmälda" styles={styles} value={`${activity.registrationCount} personer`} />
      </View>

      <Pressable onPress={() => void Linking.openURL(activity.url)} style={styles.eventorButton}>
        <Ionicons color="#fff" name="open-outline" size={16} />
        <Text style={styles.eventorButtonText}>Öppna i Eventor</Text>
      </Pressable>

      {activity.informationSegments.length > 0 || activity.documents.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Information</Text>
          {activity.informationSegments.length > 0 ? (
            <Text style={styles.infoText}>
              {activity.informationSegments.map((segment, index) =>
                segment.url ? (
                  <Text
                    key={index}
                    onPress={() => setActiveDocument({ name: segment.text, url: segment.url as string })}
                    style={styles.infoLink}
                  >
                    {segment.text}
                  </Text>
                ) : (
                  <Text key={index}>{segment.text}</Text>
                ),
              )}
            </Text>
          ) : null}
          {activity.documents.length > 0 ? (
            <View style={styles.documentList}>
              {activity.documents.map((document, index) => (
                <Pressable
                  key={`${document.url}-${index}`}
                  onPress={() => setActiveDocument(document)}
                  style={({ pressed }) => [styles.documentRow, pressed ? styles.documentRowPressed : null]}
                >
                  <Ionicons color={colors.primary} name={isImageDocument(document.url) ? 'image-outline' : 'document-text-outline'} size={18} />
                  <Text numberOfLines={1} style={styles.documentName}>
                    {document.name}
                  </Text>
                  <Ionicons color={colors.textMuted} name="open-outline" size={16} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {summaries.length > 0 ? (
        <View style={styles.panel}>
          <Pressable onPress={() => setSummaryExpanded((value) => !value)} style={styles.collapsibleHeader}>
            <Text style={styles.sectionTitle}>Sammanställning</Text>
            <View style={styles.collapsibleToggle}>
              <Ionicons color={colors.primary} name={summaryExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
              <Text style={styles.collapsibleToggleText}>{summaryExpanded ? 'Stäng' : 'Visa'}</Text>
            </View>
          </Pressable>
          {summaryExpanded ? (
            <View style={styles.summaryList}>
              {summaries.map((summary) => (
                <AttributeSummaryCard colors={colors} key={summary.id} styles={styles} summary={summary} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.panel}>
        <View style={styles.registrationsHeader}>
          <Text style={styles.sectionTitle}>Anmälda ({activity.registrationCount})</Text>
          {registrations.length > 0 ? (
            <Pressable onPress={toggleAll} style={styles.toggleAllButton}>
              <Ionicons color={colors.primary} name={allExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
              <Text style={styles.toggleAllText}>{allExpanded ? 'Dölj alla' : 'Visa alla'}</Text>
            </Pressable>
          ) : null}
        </View>

        {registrations.length === 0 ? (
          <Text style={styles.infoText}>
            {activity.registrationCount > 0
              ? 'Deltagarlistan kunde inte hämtas. Logga ut och in igen för att uppdatera din Eventor-session.'
              : 'Inga anmälda ännu.'}
          </Text>
        ) : (
          <View style={styles.registrationList}>
            {registrations.map((registration, index) => {
              const key = registrationKeys[index];
              return (
                <RegistrationCard
                  colors={colors}
                  isExpanded={expanded.has(key)}
                  key={key}
                  onToggle={() => toggleOne(key)}
                  registration={registration}
                  styles={styles}
                />
              );
            })}
          </View>
        )}
      </View>

      <DocumentModal document={activeDocument} onClose={() => setActiveDocument(null)} styles={styles} />
    </>
  );
}

function DocumentModal({
  document,
  onClose,
  styles,
}: {
  document: ActivityDocument | null;
  onClose: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  // Android WebView can't render PDFs inline -> proxy them through Google's viewer.
  const uri = React.useMemo(() => {
    if (!document) {
      return '';
    }
    const isPdf = /\.pdf(\?|#|$)/i.test(document.url);
    return Platform.OS === 'android' && isPdf
      ? `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(document.url)}`
      : document.url;
  }, [document]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(document)}>
      <View style={styles.modalOverlay}>
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text numberOfLines={2} style={styles.modalTitle}>
              {document?.name}
            </Text>
            <Pressable onPress={onClose}>
              <Text style={styles.modalClose}>Stäng</Text>
            </Pressable>
          </View>
          {document ? <WebView source={{ uri }} startInLoadingState style={styles.webView} /> : null}
        </View>
      </View>
    </Modal>
  );
}

function RegistrationCard({
  colors,
  isExpanded,
  onToggle,
  registration,
  styles,
}: {
  colors: ColorPalette;
  isExpanded: boolean;
  onToggle: () => void;
  registration: ActivityRegistration;
  styles: ReturnType<typeof createStyles>;
}) {
  const answeredAttributes = registration.attributes.filter((attribute) => attribute.values.length > 0);
  const answerCount = answeredAttributes.length;
  const nameWithClub = registration.clubName ? `${registration.personName} (${registration.clubName})` : registration.personName;

  return (
    <View style={styles.registrationCard}>
      <Pressable onPress={onToggle} style={styles.registrationHeader}>
        <Ionicons color={colors.primary} name="person-circle-outline" size={20} />
        <Text numberOfLines={1} style={styles.registrationName}>
          {nameWithClub}
        </Text>
        <Text style={styles.registrationCount}>{answerCount} svar</Text>
        <Ionicons color={colors.textMuted} name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} />
      </Pressable>

      {isExpanded ? (
        <View style={styles.registrationExpanded}>
          <View style={styles.registrationNameHeader}>
            <View style={styles.registrationAvatar}>
              <Text style={styles.registrationAvatarText}>{getInitials(registration.personName)}</Text>
            </View>
            <View style={styles.registrationNameCol}>
              <Text style={styles.registrationFullName}>{registration.personName}</Text>
              {registration.clubName ? (
                <View style={styles.registrationClubBadge}>
                  <Ionicons color={colors.primary} name="people-outline" size={11} />
                  <Text style={styles.registrationClubBadgeText}>{registration.clubName}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {answerCount > 0 ? (
            <View style={styles.attributeList}>
              {answeredAttributes.map((attribute, index) => (
                <View key={`${attribute.attributeName}-${index}`} style={styles.attributeRow}>
                  {attribute.attributeName ? <Text style={styles.attributeLabel}>{attribute.attributeName}</Text> : null}
                  <Text style={styles.attributeValue}>{attribute.values.join(', ')}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.attributeEmpty}>Inga val angivna.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

type AttributeSummaryOption = { count: number; label: string };
type AttributeSummary = { id: string; name: string; options: AttributeSummaryOption[]; totalAnswered: number };

function computeAttributeSummaries(activity: ClubActivity): AttributeSummary[] {
  return activity.attributeNames
    .map((attributeName) => {
      const answered = activity.registrations
        .map((registration) => registration.attributes.find((attribute) => attribute.attributeName === attributeName)?.values ?? [])
        .filter((values) => values.length > 0);
      const totalAnswered = answered.length;

      const counts = new Map<string, number>();
      for (const values of answered) {
        for (const value of values) {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
      const options = [...counts.entries()]
        .map(([label, count]) => ({ count, label }))
        .sort((left, right) => right.count - left.count);

      return { id: attributeName, name: attributeName, options, totalAnswered };
    })
    .filter((summary) => summary.options.length > 0);
}

function AttributeSummaryCard({
  colors,
  styles,
  summary,
}: {
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  summary: AttributeSummary;
}) {
  const maxCount = summary.options.reduce((max, option) => Math.max(max, option.count), 0);

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <Ionicons color={colors.primary} name="stats-chart-outline" size={15} />
        <Text style={styles.summaryTitle}>{summary.name || 'Fråga'}</Text>
        <Text style={styles.summaryTotal}>{summary.totalAnswered} svar</Text>
      </View>

      <View style={styles.summaryOptions}>
        {summary.options.map((option, index) => (
          <View key={`${option.label}-${index}`} style={styles.summaryOptionRow}>
            <View style={styles.summaryOptionTop}>
              <Text numberOfLines={2} style={styles.summaryOptionLabel}>
                {option.label}
              </Text>
              <Text style={styles.summaryOptionCount}>{option.count}</Text>
            </View>
            <View style={styles.summaryBarTrack}>
              <View style={[styles.summaryBarFill, { width: maxCount > 0 ? `${Math.round((option.count / maxCount) * 100)}%` : '0%' }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function MetaRow({
  colors,
  icon,
  label,
  styles,
  value,
}: {
  colors: ColorPalette;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  styles: ReturnType<typeof createStyles>;
  value: string;
}) {
  return (
    <View style={styles.metaRow}>
      <Ionicons color={colors.primary} name={icon} size={16} />
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const MONTH_ABBREVIATIONS: Record<string, string> = {
  april: 'apr.',
  augusti: 'aug.',
  december: 'dec.',
  februari: 'feb.',
  januari: 'jan.',
  november: 'nov.',
  oktober: 'okt.',
  september: 'sep.',
};

// Shorten scraped Swedish dates: long month -> "aug." and drop the "klockan" word.
function shortenSwedishDate(input: string | null): string | null {
  if (!input) {
    return null;
  }
  return input
    .replace(/\bklockan\s*/gi, '')
    .replace(/\b(januari|februari|april|augusti|september|oktober|november|december)\b/gi, (month) => MONTH_ABBREVIATIONS[month.toLowerCase()] ?? month)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isImageDocument(url: string): boolean {
  return /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(url);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Small red note under the deadline: "Stängd" once passed, otherwise "X dagar
// kvar" — but only when 10 days or fewer remain.
function deadlineHint(iso: string | null): string | null {
  if (!iso) {
    return null;
  }

  const deadline = new Date(iso).getTime();
  if (!Number.isFinite(deadline)) {
    return null;
  }

  if (deadline < Date.now()) {
    return 'Stängd';
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDeadlineDay = new Date(deadline);
  startOfDeadlineDay.setHours(0, 0, 0, 0);
  const days = Math.round((startOfDeadlineDay.getTime() - startOfToday.getTime()) / 86400000);

  if (days > 10) {
    return null;
  }

  if (days <= 0) {
    return 'Stänger idag';
  }

  if (days === 1) {
    return '1 dag kvar';
  }

  return `${days} dagar kvar`;
}

function createStyles(colors: ColorPalette, isDark: boolean, isSoft: boolean) {
  return StyleSheet.create({
    attributeEmpty: {
      ...typography.caption,
      color: colors.textMuted,
    },
    attributeLabel: {
      ...typography.caption,
      color: colors.textMuted,
    },
    attributeList: {
      gap: spacing.xs,
    },
    attributeRow: {
      gap: 2,
    },
    attributeValue: {
      ...typography.body,
      color: colors.textPrimary,
    },
    backButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    backLabel: {
      ...typography.captionStrong,
      color: colors.primary,
    },
    collapsibleHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    collapsibleToggle: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
    },
    collapsibleToggleText: {
      ...typography.captionStrong,
      color: colors.primary,
    },
    content: {
      gap: spacing.lg,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    deadlineBadge: {
      alignItems: 'center',
      alignSelf: 'flex-end',
      backgroundColor: isDark ? 'rgba(224, 96, 96, 0.15)' : 'rgba(183, 59, 59, 0.10)',
      borderColor: isDark ? 'rgba(224, 96, 96, 0.50)' : 'rgba(183, 59, 59, 0.40)',
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 4,
      marginTop: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    deadlineBadgeText: {
      ...typography.captionStrong,
      color: colors.error,
      fontSize: 11,
    },
    deadlineBlock: {
      justifyContent: 'center',
    },
    documentList: {
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    documentName: {
      ...typography.body,
      color: colors.textPrimary,
      flex: 1,
    },
    documentRow: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    documentRowPressed: {
      opacity: 0.85,
    },
    eventorButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
      borderRadius: 16,
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    eventorButtonText: {
      ...typography.captionStrong,
      color: '#fff',
    },
    hero: {
      borderRadius: 26,
      gap: spacing.md,
      overflow: 'hidden',
      padding: spacing.lg,
    },
    heroBack: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    heroBackLabel: {
      ...typography.captionStrong,
      color: colors.heroText,
    },
    heroBadge: {
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.16)',
      borderRadius: 999,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
    },
    heroBadgeText: {
      ...typography.captionStrong,
      color: colors.heroText,
      fontSize: 12,
    },
    heroBody: {
      gap: spacing.sm,
    },
    heroMeta: {
      ...typography.body,
      color: colors.heroTextMuted,
      fontSize: 14,
    },
    heroMetaItem: {
      alignItems: 'center',
      flexDirection: 'row',
      flexShrink: 1,
      gap: 6,
    },
    heroMetaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
      justifyContent: 'space-between',
    },
    heroTitle: {
      color: colors.heroText,
      fontFamily: typography.heroTitle.fontFamily,
      fontSize: 20,
      lineHeight: 25,
    },
    infoText: {
      ...typography.body,
      color: colors.textSecondary,
      lineHeight: 21,
    },
    infoLink: {
      color: colors.primary,
      textDecorationLine: 'underline',
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
    metaCard: {
      backgroundColor: colors.surfaceOverlay,
      borderColor: colors.border,
      borderRadius: 22,
      borderWidth: 1,
      padding: spacing.lg,
    },
    metaDivider: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: spacing.sm,
    },
    metaLabel: {
      ...typography.caption,
      color: colors.textMuted,
      flex: 1,
    },
    metaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    metaValue: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
    },
    metaValueWrap: {
      alignItems: 'flex-end',
    },
    modalBackdrop: {
      flex: 1,
    },
    modalClose: {
      ...typography.captionStrong,
      color: colors.primary,
    },
    modalHeader: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: spacing.md,
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    modalOverlay: {
      backgroundColor: colors.overlay,
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      height: '86%',
      overflow: 'hidden',
    },
    modalTitle: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      flex: 1,
    },
    panel: {
      backgroundColor: colors.surfaceOverlay,
      borderColor: colors.border,
      borderRadius: 22,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.lg,
    },
    registrationAvatar: {
      alignItems: 'center',
      backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
      borderRadius: 16,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    registrationAvatarText: {
      ...typography.captionStrong,
      color: '#fff',
      fontSize: 12,
    },
    registrationCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    registrationClubBadge: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    registrationClubBadgeText: {
      ...typography.caption,
      color: colors.textSecondary,
      fontSize: 11,
    },
    registrationCount: {
      ...typography.caption,
      color: colors.textMuted,
    },
    registrationExpanded: {
      gap: spacing.sm,
    },
    registrationFullName: {
      ...typography.captionStrong,
      color: colors.textPrimary,
    },
    registrationHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    registrationList: {
      gap: spacing.xs,
    },
    registrationName: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      flex: 1,
    },
    registrationNameCol: {
      alignItems: 'flex-start',
      flex: 1,
      gap: 3,
    },
    registrationNameHeader: {
      alignItems: 'center',
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingTop: spacing.sm,
    },
    registrationsHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    safeArea: {
      backgroundColor: colors.background,
      flex: 1,
    },
    sectionTitle: {
      ...typography.sectionTitle,
      color: colors.textPrimary,
    },
    summaryBarFill: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      height: 6,
    },
    summaryBarTrack: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      height: 6,
      overflow: 'hidden',
    },
    summaryCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.md,
    },
    summaryHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    summaryList: {
      gap: spacing.sm,
    },
    summaryOptionCount: {
      ...typography.captionStrong,
      color: colors.textPrimary,
    },
    summaryOptionLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      flex: 1,
    },
    summaryOptionRow: {
      gap: 4,
    },
    summaryOptionTop: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'space-between',
    },
    summaryOptions: {
      gap: spacing.sm,
    },
    summaryTitle: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      flex: 1,
    },
    summaryTotal: {
      ...typography.caption,
      color: colors.textMuted,
    },
    toggleAllButton: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
      paddingVertical: 4,
    },
    toggleAllText: {
      ...typography.captionStrong,
      color: colors.primary,
    },
    webView: {
      flex: 1,
    },
  });
}
