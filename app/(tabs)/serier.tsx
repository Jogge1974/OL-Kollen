import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchOrganisationList } from '@/src/api/organisationTree';
import { AppTextField } from '@/src/components/AppTextField';
import { EmptyState } from '@/src/components/EmptyState';
import { ScreenHeroHeader } from '@/src/components/ScreenHeroHeader';
import { DEFAULT_ORGANISATION_ID, seriesSpansYear, useOrganisationSeries } from '@/src/hooks/useOrganisationSeries';
import { useAuthStore } from '@/src/store/authStore';
import { ColorPalette, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { OrganisationSeries, OrganisationTreeNode, SeriesItem } from '@/src/types/eventorSeries';

export default function SerierScreen() {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const user = useAuthStore((state) => state.user);
  const userOrgId = user?.organisationIds[0] ? Number(user.organisationIds[0]) : null;

  // A manually picked organisation overrides the signed-in user's club.
  const [selectedOrg, setSelectedOrg] = React.useState<{ id: number; name: string } | null>(null);
  const activeOrgId = selectedOrg?.id ?? userOrgId;
  const displayOrgName = selectedOrg?.name ?? user?.organisationName ?? 'Svenska Orienteringsförbundet';

  const { availableYears, error, groups, isLoading, reload } = useOrganisationSeries(activeOrgId);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [selectedYear, setSelectedYear] = React.useState(new Date().getFullYear());
  const [showFinished, setShowFinished] = React.useState(false);

  const [searchVisible, setSearchVisible] = React.useState(false);
  const [orgQuery, setOrgQuery] = React.useState('');
  const [orgList, setOrgList] = React.useState<OrganisationTreeNode[]>([]);
  const [orgListError, setOrgListError] = React.useState<string | null>(null);
  const [orgListLoading, setOrgListLoading] = React.useState(false);

  const openSearch = React.useCallback(() => {
    setSearchVisible(true);
    if (orgList.length > 0 || orgListLoading) {
      return;
    }
    setOrgListLoading(true);
    setOrgListError(null);
    fetchOrganisationList()
      .then(setOrgList)
      .catch((caught) => setOrgListError(caught instanceof Error ? caught.message : 'Kunde inte hämta organisationer.'))
      .finally(() => setOrgListLoading(false));
  }, [orgList.length, orgListLoading]);

  const filteredOrgs = React.useMemo(() => {
    const query = orgQuery.trim().toLowerCase();
    const matches =
      query.length === 0
        ? orgList
        : orgList.filter((org) => org.name.toLowerCase().includes(query) || (org.shortName?.toLowerCase().includes(query) ?? false));
    return matches.slice(0, 60);
  }, [orgList, orgQuery]);

  const handleSelectOrg = (org: OrganisationTreeNode) => {
    setSelectedOrg({ id: org.id, name: org.name });
    setSearchVisible(false);
    setOrgQuery('');
  };

  const handleResetOrg = () => {
    setSelectedOrg(null);
    setSearchVisible(false);
    setOrgQuery('');
  };

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await reload(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [reload]);

  // Always offer the current year, then any other years that hold series.
  const years = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    const set = new Set<number>([currentYear, ...availableYears]);
    return [...set].sort((a, b) => b - a);
  }, [availableYears]);

  const filteredGroups = React.useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          series: group.series
            .filter((item) => seriesSpansYear(item.startYear, item.endYear, selectedYear))
            .filter((item) => showFinished || getSeriesStatus(item.startDate, item.endDate) !== 'finished')
            .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '')),
        }))
        .filter((group) => group.series.length > 0),
    [groups, selectedYear, showFinished],
  );

  const totalForYear = filteredGroups.reduce((sum, group) => sum + group.series.length, 0);

  const standingsOrgId = activeOrgId ?? DEFAULT_ORGANISATION_ID;

  const openSeries = (item: SeriesItem) =>
    router.push({ params: { id: item.id, name: item.name }, pathname: '/serie/[id]' });

  const renderBody = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Hämtar serier…</Text>
        </View>
      );
    }

    if (error) {
      return <EmptyState description={error} title="Kunde inte hämta serier" />;
    }

    if (filteredGroups.length === 0) {
      return <EmptyState description={`Inga serier hittades för ${selectedYear}.`} title="Inga serier" />;
    }

    return (
      <>
        {filteredGroups.map((group) => (
          <SeriesGroup colors={colors} group={group} key={group.organisationId} onOpen={openSeries} styles={styles} />
        ))}
      </>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={() => void handleRefresh()} refreshing={isRefreshing} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeroHeader
          eyebrow="TÄVLINGAR"
          subtitle={displayOrgName}
          title="Serier"
          titleRightContent={
            !isLoading && !error ? (
              <View style={styles.countBadge}>
                <Ionicons color={colors.heroText} name="list-outline" size={12} />
                <Text style={styles.countBadgeText}>{totalForYear}</Text>
              </View>
            ) : undefined
          }
          topRightContent={
            <Pressable
              onPress={() => void Linking.openURL(`https://eventor.orientering.se/Standings?organisationId=${standingsOrgId}`)}
              style={styles.eventorBadge}
            >
              <Ionicons color={colors.heroText} name="open-outline" size={13} />
              <Text style={styles.eventorBadgeText}>Alla i Eventor</Text>
            </Pressable>
          }
        />

        <Pressable onPress={openSearch} style={styles.orgSelector}>
          <Ionicons color={colors.primary} name="business-outline" size={16} />
          <Text numberOfLines={1} style={styles.orgSelectorText}>
            {displayOrgName}
          </Text>
          <View style={styles.orgSelectorAction}>
            <Ionicons color={colors.primary} name="swap-horizontal" size={13} />
            <Text style={styles.orgSelectorActionText}>Byt</Text>
          </View>
        </Pressable>

        {!isLoading && !error ? (
          <View style={styles.controlsRow}>
            <View style={styles.yearFrame}>
              <ScrollView
                contentContainerStyle={styles.yearRow}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.yearScroll}
              >
                {years.map((year) => {
                  const active = year === selectedYear;
                  return (
                    <Pressable
                      key={year}
                      onPress={() => setSelectedYear(year)}
                      style={[styles.yearChip, active ? styles.yearChipActive : null]}
                    >
                      <Text style={[styles.yearChipText, active ? styles.yearChipTextActive : null]}>{year}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <View style={styles.toggle}>
              <Text style={styles.toggleLabel}>Visa avslutade</Text>
              <Switch
                ios_backgroundColor={colors.border}
                onValueChange={setShowFinished}
                thumbColor="#fff"
                trackColor={{ false: colors.border, true: colors.primary }}
                value={showFinished}
              />
            </View>
          </View>
        ) : null}

        {renderBody()}
      </ScrollView>

      <Modal animationType="slide" onRequestClose={() => setSearchVisible(false)} transparent visible={searchVisible}>
        <View style={styles.modalOverlay}>
          <Pressable onPress={() => setSearchVisible(false)} style={styles.modalBackdrop} />
          <SafeAreaView edges={['bottom']} style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Byt organisation</Text>
              <Pressable hitSlop={8} onPress={() => setSearchVisible(false)}>
                <Ionicons color={colors.textMuted} name="close" size={22} />
              </Pressable>
            </View>
            <AppTextField
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              label="Sök organisation"
              onChangeText={setOrgQuery}
              onClearText={() => setOrgQuery('')}
              placeholder="Skriv klubb, distrikt eller förbund…"
              value={orgQuery}
            />
            {selectedOrg ? (
              <Pressable onPress={handleResetOrg} style={styles.orgResetRow}>
                <Ionicons color={colors.primary} name="home-outline" size={16} />
                <Text style={styles.orgResetText}>
                  {user?.organisationName ? `Min klubb (${user.organisationName})` : 'Svenska Orienteringsförbundet'}
                </Text>
              </Pressable>
            ) : null}
            {orgListLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : orgListError ? (
              <Text style={styles.modalMessage}>{orgListError}</Text>
            ) : (
              <FlatList
                data={filteredOrgs}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(item) => String(item.id)}
                ListEmptyComponent={<Text style={styles.modalMessage}>Inga organisationer matchar sökningen.</Text>}
                renderItem={({ item }) => (
                  <Pressable onPress={() => handleSelectOrg(item)} style={styles.orgRow}>
                    <View style={styles.orgRowBody}>
                      <Text numberOfLines={1} style={styles.orgRowName}>
                        {item.name}
                      </Text>
                      <Text style={styles.orgRowType}>{orgTypeLabel(item.type)}</Text>
                    </View>
                    <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
                  </Pressable>
                )}
                style={styles.orgListScroll}
              />
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function orgTypeLabel(type: string | null): string {
  switch (type) {
    case 'Club':
      return 'Klubb';
    case 'NationalRegion':
      return 'Distrikt';
    case 'NationalFederation':
      return 'Förbund';
    case 'IOF':
      return 'Internationellt';
    default:
      return '';
  }
}

function SeriesGroup({
  colors,
  group,
  onOpen,
  styles,
}: {
  colors: ColorPalette;
  group: OrganisationSeries;
  onOpen: (item: SeriesItem) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupHeaderText}>{group.organisationName}</Text>
        <View style={styles.groupHeaderLine} />
      </View>
      <View style={styles.list}>
        {group.series.map((item) => (
          <SeriesRow colors={colors} item={item} key={item.id} onPress={() => onOpen(item)} styles={styles} />
        ))}
      </View>
    </View>
  );
}

function SeriesRow({
  colors,
  item,
  onPress,
  styles,
}: {
  colors: ColorPalette;
  item: SeriesItem;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const status = getSeriesStatus(item.startDate, item.endDate);
  const meta = SERIES_STATUS_META[status];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}>
      <View style={[styles.statusBar, { backgroundColor: meta.color }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {item.name}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: meta.tint, borderColor: meta.color }]}>
            <Ionicons color={meta.color} name={meta.icon} size={10} />
            <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <View style={styles.cardMetaRow}>
          <View style={styles.cardMetaItem}>
            <Ionicons color={colors.primary} name="calendar-outline" size={13} />
            <Text style={styles.cardMetaText}>{item.dateRange || '–'}</Text>
          </View>
          <View style={styles.cardMetaItem}>
            <Ionicons color={colors.primary} name="flag-outline" size={13} />
            <Text style={styles.cardMetaText}>
              {item.countedSubCompetitionCount}/{item.subCompetitionCount} räknas
            </Text>
          </View>
        </View>
      </View>
      <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
    </Pressable>
  );
}

type SeriesStatus = 'finished' | 'ongoing' | 'upcoming';

const SERIES_STATUS_META: Record<
  SeriesStatus,
  { color: string; icon: keyof typeof Ionicons.glyphMap; label: string; tint: string }
> = {
  finished: { color: '#8A8A8A', icon: 'checkmark-done', label: 'Avslutad', tint: 'rgba(138, 138, 138, 0.14)' },
  ongoing: { color: '#3E9B57', icon: 'ellipse', label: 'Aktiv', tint: 'rgba(62, 155, 87, 0.14)' },
  upcoming: { color: '#3E7BC2', icon: 'time-outline', label: 'Kommande', tint: 'rgba(62, 123, 194, 0.14)' },
};

// Classifies a series by comparing today's date to its date span.
function getSeriesStatus(startDate: string | null, endDate: string | null): SeriesStatus {
  const today = new Date().toLocaleDateString('sv-SE');
  if (endDate && endDate < today) {
    return 'finished';
  }
  if (startDate && startDate > today) {
    return 'upcoming';
  }
  return 'ongoing';
}

function createStyles(colors: ColorPalette, isDark: boolean) {
  return StyleSheet.create({
    card: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    cardBody: {
      flex: 1,
      gap: 2,
    },
    cardMetaItem: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
    },
    cardMetaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    cardMetaText: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    cardPressed: {
      opacity: 0.85,
    },
    cardTitle: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      flex: 1,
    },
    cardTitleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    content: {
      gap: spacing.lg,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    controlsRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    countBadge: {
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.14)',
      borderRadius: 999,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    countBadgeText: {
      ...typography.captionStrong,
      color: colors.heroText,
      fontSize: 12,
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
    group: {
      gap: spacing.sm,
    },
    groupHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    groupHeaderLine: {
      backgroundColor: colors.border,
      flex: 1,
      height: 1,
    },
    groupHeaderText: {
      ...typography.captionStrong,
      color: colors.primary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    list: {
      gap: spacing.xs,
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
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
    },
    modalCard: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      height: '82%',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    modalHandle: {
      alignSelf: 'center',
      backgroundColor: colors.border,
      borderRadius: 999,
      height: 4,
      marginBottom: spacing.sm,
      width: 40,
    },
    modalHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    modalLoading: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
    },
    modalMessage: {
      ...typography.body,
      color: colors.textSecondary,
      paddingVertical: spacing.lg,
      textAlign: 'center',
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalTitle: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      fontSize: 16,
    },
    orgListScroll: {
      flex: 1,
      marginTop: spacing.xs,
    },
    orgResetRow: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
      paddingVertical: spacing.sm,
    },
    orgResetText: {
      ...typography.bodyStrong,
      color: colors.primary,
    },
    orgRow: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    orgRowBody: {
      flex: 1,
      gap: 1,
    },
    orgRowName: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      fontSize: 14,
    },
    orgRowType: {
      ...typography.caption,
      color: colors.textMuted,
    },
    orgSelector: {
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
    orgSelectorAction: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 3,
    },
    orgSelectorActionText: {
      ...typography.captionStrong,
      color: colors.primary,
    },
    orgSelectorText: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      flex: 1,
    },
    safeArea: {
      backgroundColor: colors.background,
      flex: 1,
    },
    statusBadge: {
      alignItems: 'center',
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 3,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    statusBadgeText: {
      ...typography.captionStrong,
      fontSize: 10,
      letterSpacing: 0.3,
    },
    statusBar: {
      alignSelf: 'stretch',
      borderRadius: 999,
      width: 4,
    },
    toggle: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    toggleLabel: {
      ...typography.captionStrong,
      color: colors.textSecondary,
    },
    yearChip: {
      backgroundColor: 'transparent',
      borderRadius: 999,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    yearChipActive: {
      backgroundColor: colors.primary,
    },
    yearChipText: {
      ...typography.captionStrong,
      color: colors.textSecondary,
      fontSize: 12,
    },
    yearChipTextActive: {
      color: isDark ? colors.background : '#fff',
    },
    yearFrame: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      flex: 1,
      overflow: 'hidden',
      paddingHorizontal: 4,
      paddingVertical: 3,
    },
    yearRow: {
      gap: 2,
      paddingRight: spacing.xs,
    },
    yearScroll: {
      flexGrow: 0,
    },
  });
}
