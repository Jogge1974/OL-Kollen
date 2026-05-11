import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { AppButton } from '@/src/components/AppButton';
import { AnalysisModal, AnalysisModalState, openEventAnalysisModal } from '@/src/components/AnalysisModal';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';
import { PublishedListModal, PublishedListModalState, openPublishedListModal } from '@/src/components/PublishedListModal';
import { SplitTimesModal, SplitTimesModalState, openEventSplitTimesModal } from '@/src/components/SplitTimesModal';
import { useEventCompetitorCount } from '@/src/hooks/useEventCompetitorCount';
import { useEventDocuments } from '@/src/hooks/useEventDocuments';
import { useEventorEventDetail } from '@/src/hooks/useEventorEventDetail';
import { useAuthStore } from '@/src/store/authStore';
import { canRenderNativeMap } from '@/src/services/nativeMaps';
import { findLiveCompetition, LiveresultatMatch } from '@/src/services/liveresultat';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { getClassificationTone } from '@/src/theme/colors';
import { ColorPalette, useColors, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventDocument, EventPublishedListKind } from '@/src/types/eventor';
import { normalizeEventId } from '@/src/utils/eventId';

export default function EventDetailScreen() {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string }>();
  const selectedEventRaceId = React.useMemo(() => {
    if (typeof id !== 'string' || id.length === 0) {
      return null;
    }

    const parts = id.split('::');
    return parts.length > 1 ? parts.slice(1).join('::') || null : null;
  }, [id]);
  const { error, event, isLoading, reload } = useEventorEventDetail(id);
  const { documents, error: documentsError, isLoading: isLoadingDocuments, reload: reloadDocuments } = useEventDocuments(event?.id ?? null);
  const [activeDocument, setActiveDocument] = React.useState<EventDocument | null>(null);
  const [activeListModal, setActiveListModal] = React.useState<PublishedListModalState | null>(null);
  const [activeSplitTimesModal, setActiveSplitTimesModal] = React.useState<SplitTimesModalState | null>(null);
  const [activeAnalysisModal, setActiveAnalysisModal] = React.useState<AnalysisModalState | null>(null);
  const [isInfoExpanded, setIsInfoExpanded] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const user = useAuthStore((state) => state.user);
  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
  const toggleFavorite = usePreferencesStore((state) => state.toggleFavorite);

  const tone = getClassificationTone(event?.classificationId ?? 2, themeName);
  const isRelayEvent = event?.eventForm === 'RelaySingleDay' || event?.eventForm === 'Relay';
  const [liveMatch, setLiveMatch] = React.useState<LiveresultatMatch | null>(null);

  React.useEffect(() => {
    if (!event) return;
    const today = new Date().toISOString().slice(0, 10);
    if (event.eventRaceDate !== today || event.hasPublishedResults) {
      setLiveMatch(null);
      return;
    }

    let cancelled = false;
    void findLiveCompetition(event.name, event.eventRaceDate).then((match) => {
      if (!cancelled) setLiveMatch(match);
    });
    return () => { cancelled = true; };
  }, [event]);
  const organisationId = user?.organisationIds[0] ?? null;
  const clubName = user?.organisationName ?? null;
  const { counts } = useEventCompetitorCount(event?.id ?? null, organisationId, event?.eventForm ?? null);
  const canShowNativeMap = canRenderNativeMap();
  const normalizedEventId = React.useMemo(() => normalizeEventId(event?.id ?? ''), [event?.id]);
  const pmDocument = React.useMemo(() => {
    return documents.find((document) => normalizeDocumentName(document.name) === 'pm') ?? null;
  }, [documents]);
  const isLoggedIn = Boolean(user);
  const isFavorite = React.useMemo(
    () => favoriteEvents.some((favoriteEvent) => favoriteEvent.id === normalizedEventId),
    [favoriteEvents, normalizedEventId],
  );
  const showResultActions = event?.hasPublishedResults ?? false;
  const secondaryKind: EventPublishedListKind = event?.hasPublishedStarts ? 'starts' : 'entries';
  const resultCount = isRelayEvent ? counts.totalEntries : counts.totalStarts;
  const clubResultCount = counts.organisationStarts;
  const handleOpenAnalysis = React.useCallback((eventId: string, classLabel: string, personId?: string | null) => {
    void openEventAnalysisModal(eventId, setActiveAnalysisModal, classLabel, personId ?? null);
  }, []);
  const handleClose = React.useCallback(() => {
    if (typeof returnTo === 'string' && returnTo.length > 0) {
      router.replace(returnTo);
      return;
    }

    router.back();
  }, [returnTo]);

  if (isLoading) {
    return <LoadingState label="Hämtar tävlingsdetaljer..." fullScreen />;
  }

  if (!event) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.fallbackContainer}>
          <EmptyState
            action={<AppButton label="Försök igen" onPress={() => void reload()} />}
            description={error ?? 'Det gick inte att läsa tävlingsdetaljerna.'}
            title="Kunde inte öppna tävlingen"
          />
        </View>
      </SafeAreaView>
    );
  }

  const handleToggleFavorite = async () => {
    await toggleFavorite({
      classificationId: event.classificationId,
      classificationLabel: event.classificationLabel,
      dateLabel: event.dateLabel,
      hasPublishedResults: event.hasPublishedResults,
      hasPublishedStarts: event.hasPublishedStarts,
      id: normalizedEventId,
      name: event.name,
      organiserLabel: event.organiserNames.join(', '),
      startDate: event.startDate,
    });
  };

  const openList = async (kind: EventPublishedListKind, scope: 'public' | 'organisation') => {
    await openPublishedListModal(kind, scope, event.id, organisationId, clubName, setActiveListModal, null, selectedEventRaceId ?? event.eventRaceId);
  };

  const openSplitTimes = async () => {
    await openEventSplitTimesModal(event.id, setActiveSplitTimesModal, null, 'Sträcktider');
  };

  const handleOpenAppleMaps = async () => {
    if (!event.centerPosition) {
      return;
    }

    const { latitude, longitude } = event.centerPosition;
    await Linking.openURL(`http://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=d`);
  };

  const handleOpenGoogleMaps = async () => {
    if (!event.centerPosition) {
      return;
    }

    const { latitude, longitude } = event.centerPosition;
    const appUrl = `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`;
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;

    if (Platform.OS === 'ios') {
      try {
        await Linking.openURL(appUrl);
        return;
      } catch {
        await Linking.openURL(webUrl);
        return;
      }
    }

    await Linking.openURL(webUrl);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            onRefresh={async () => {
              setIsRefreshing(true);
              try {
                await Promise.all([reload(), reloadDocuments()]);
              } finally {
                setIsRefreshing(false);
              }
            }}
            refreshing={isRefreshing}
            tintColor={colors.primary}
          />
        }
      >
        <LinearGradient colors={tone.detailGradient} style={styles.hero}>
          <View style={styles.heroTopRow}>
            <Pressable onPress={handleClose} style={styles.backButton}>
              <Ionicons color={colors.heroText} name="chevron-back" size={18} />
              <Text style={styles.backLabel}>Tillbaka</Text>
            </Pressable>

            <Pressable onPress={() => void handleToggleFavorite()} style={[styles.heroFavoriteBadge, isFavorite ? styles.heroFavoriteBadgeActive : null]}>
              <Ionicons color={isFavorite ? (isDark ? '#F3DA3E' : (themeName === 'soft' || themeName === 'soft-dark') ? '#001A4F' : colors.primaryDeep) : colors.textSecondary} name={isFavorite ? 'star' : 'star-outline'} size={14} />
              <Text style={[styles.heroFavoriteBadgeText, isFavorite ? styles.heroFavoriteBadgeTextActive : null]}>Favorit</Text>
            </Pressable>
          </View>

          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>{event.name}</Text>
            {event.organiserNames.length > 0 ? <Text style={styles.heroOrganiser}>{event.organiserNames.join(', ')}</Text> : null}
            <View style={styles.heroMetaRow}>
              <Text style={styles.heroMeta}>{event.dateLabel}</Text>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>{event.classificationLabel}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={[styles.panel, styles.infoPanel]}>
          <Pressable onPress={() => setIsInfoExpanded((current) => !current)} style={styles.infoHeader}>
            <Text style={styles.infoCardTitle}>Information</Text>
            <Ionicons color={colors.primary} name={isInfoExpanded ? 'chevron-up' : 'chevron-down'} size={20} />
          </Pressable>

          {isInfoExpanded ? (
            <View style={styles.infoBody}>
              {event.message ? <InfoTextBlock label="Eventor-meddelande" value={event.message} /> : null}

              <View style={styles.infoTopRow}>
                <InfoMini label="Gren" value={event.disciplineLabel} />
                <InfoMini label="Distans" value={event.distanceLabel} />
                <InfoMini label="Senast ändrad" value={event.modifyDate ?? 'Ej angivet'} />
              </View>


              {event.comment ? <InfoTextBlock label="Kommentar" value={event.comment} /> : null}
              {event.webUrl ? <AppButton label="Öppna arrangörens länk" onPress={() => void Linking.openURL(event.webUrl ?? '')} variant="secondary" /> : null}
            </View>
          ) : null}
        </View>

        {isLoggedIn && !organisationId ? (
          <View style={styles.clubHint}>
            <Text style={styles.clubHintText}>Inloggad, men klubben hittades inte i Eventor.</Text>
          </View>
        ) : null}

        <View style={styles.actionGrid}>
          {showResultActions ? (
            <View style={styles.actionColumn}>
              <ActionButton label={`Resultat${formatCountSuffix(resultCount)}`} onPress={() => void openList('results', 'public')} tone="result" />
              {organisationId ? (
                <ActionButton
                  label={`Resultat ${clubName ?? 'klubb'}${formatCountSuffix(clubResultCount)}`}
                  onPress={() => void openList('results', 'organisation')}
                  tone="result"
                />
              ) : null}
              {!isRelayEvent ? <ActionButton label="Sträcktider" onPress={() => void openSplitTimes()} tone="result" /> : null}
            </View>
          ) : null}

          <View style={[styles.actionColumn, !showResultActions ? styles.actionColumnFull : null]}>
            <ActionButton
              label={`${event.hasPublishedStarts ? 'Startlista' : 'Anmälningar'}${formatCountSuffix(counts.totalEntries)}`}
              onPress={() => void openList(secondaryKind, 'public')}
              tone="start"
            />
            {organisationId ? (
              <>
                <ActionButton
                  label={`${event.hasPublishedStarts ? 'Startlista' : 'Anmälningar'} ${clubName ?? 'klubb'}${formatCountSuffix(counts.organisationEntries)}`}
                  onPress={() => void openList(secondaryKind, 'organisation')}
                  tone="start"
                />
                {!showResultActions && pmDocument ? (
                  <AppButton
                    label="PM"
                    onPress={() => setActiveDocument(pmDocument)}
                    style={styles.pmButton}
                    variant="secondary"
                  />
                ) : null}
              </>
            ) : null}
          </View>
        </View>

        {liveMatch && event.liveloxEventId ? (
          <View style={styles.liveRow}>
            <Pressable onPress={async () => { try { await Linking.openURL(liveMatch.url); } catch {} }}
              style={({ pressed }) => [styles.liveresultatButton, styles.liveRowHalf, pressed ? styles.liveresultatButtonPressed : null]}
            >
              <Ionicons color="#fff" name="pulse-outline" size={16} />
              <Text style={styles.liveresultatButtonText}>Nya Liveresultat</Text>
              <Ionicons color="#fff" name="open-outline" size={14} />
            </Pressable>
            <Pressable
              onPress={() => void Linking.openURL(`https://www.livelox.com/Events/Show/${event.liveloxEventId}/`)}
              style={({ pressed }) => [styles.liveloxButton, styles.liveRowHalf, pressed ? styles.liveloxButtonPressed : null]}
            >
              <Image source={isDark ? require('@/assets/livelox-logo-dark.png') : require('@/assets/livelox-logo.png')} style={styles.liveloxLogo} resizeMode="contain" />
              <Ionicons color={isDark ? '#FF9D40' : '#F57C00'} name="open-outline" size={14} style={styles.liveloxExternalIcon} />
            </Pressable>
          </View>
        ) : liveMatch ? (
          <Pressable onPress={async () => { try { await Linking.openURL(liveMatch.url); } catch {} }}
            style={({ pressed }) => [styles.liveresultatButton, pressed ? styles.liveresultatButtonPressed : null]}
          >
            <Ionicons color="#fff" name="pulse-outline" size={16} />
            <Text style={styles.liveresultatButtonText}>Nya Liveresultat</Text>
            <Ionicons color="#fff" name="open-outline" size={14} />
          </Pressable>
        ) : event.liveloxEventId ? (
          <Pressable
            onPress={() => void Linking.openURL(`https://www.livelox.com/Events/Show/${event.liveloxEventId}/`)}
            style={({ pressed }) => [styles.liveloxButton, pressed ? styles.liveloxButtonPressed : null]}
          >
            <Image source={isDark ? require('@/assets/livelox-logo-dark.png') : require('@/assets/livelox-logo.png')} style={styles.liveloxLogo} resizeMode="contain" />
            <Ionicons color={isDark ? '#FF9D40' : '#F57C00'} name="open-outline" size={14} style={styles.liveloxExternalIcon} />
          </Pressable>
        ) : null}

        <View style={[styles.panel, styles.navigationPanel]}>
          {event.centerPosition ? (
            <View style={styles.navigationContent}>
              {canShowNativeMap ? (
                <MapView
                  provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                  initialRegion={{
                    latitude: event.centerPosition.latitude,
                    latitudeDelta: 0.27,
                    longitude: event.centerPosition.longitude,
                    longitudeDelta: 0.27,
                  }}
                  rotateEnabled={false}
                  scrollEnabled
                  style={styles.navigationMap}
                  zoomEnabled
                >
                  <Marker coordinate={event.centerPosition} pinColor={colors.accent} title={event.name} />
                </MapView>
              ) : (
                <View style={styles.navigationMapFallback}>
                  <Ionicons color={colors.primary} name="map-outline" size={28} />
                  <Text style={styles.navigationMapFallbackTitle}>Kartan kräver Google Maps för Android</Text>
                  <Text style={styles.navigationMapFallbackText}>
                    Appen är byggd för att visa kartan med Google Maps på Android. Utan den konfigurationen visas i stället denna information.
                  </Text>
                </View>
              )}

              {Platform.OS === 'ios' ? (
                <View style={styles.navigationButtonOverlayRow}>
                  <MapShortcutButton icon="logo-google" label="Google Maps" onPress={() => void handleOpenGoogleMaps()} />
                  <MapShortcutButton icon="map-outline" label="Apple Kartor" onPress={() => void handleOpenAppleMaps()} />
                </View>
              ) : (
                <View style={styles.navigationButtonOverlaySingle}>
                  <MapShortcutButton icon="navigate-outline" label="Google Maps" onPress={() => void handleOpenGoogleMaps()} />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.navigationEmptyState}>
              <Text style={styles.sectionText}>Den här tävlingen saknar kartkoordinat i Eventor, så någon vägbeskrivning kan inte öppnas härifrån.</Text>
            </View>
          )}
        </View>

        <View style={styles.panel}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Dokument</Text>
            {isLoadingDocuments ? <Text style={styles.sectionHint}>Laddar...</Text> : null}
          </View>

          {documents.length > 0 ? (
            <View style={styles.documentsList}>
              {documents.map((document) => (
                <Pressable key={document.id} onPress={() => setActiveDocument(document)} style={styles.documentRow}>
                  <View style={styles.documentCopy}>
                    <Text numberOfLines={2} style={styles.documentName}>
                      {document.name}
                    </Text>
                    <Text style={styles.documentMeta}>{[document.type, document.modifyDate].filter(Boolean).join(' • ') || 'Dokument'}</Text>
                  </View>
                  <Ionicons color={colors.primary} name="document-text-outline" size={18} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {!isLoadingDocuments && documents.length === 0 && !documentsError ? <Text style={styles.sectionText}>Inga dokument hittades för tävlingen.</Text> : null}

          {documentsError ? (
            <View style={styles.documentsErrorBlock}>
              <Text style={styles.documentsErrorText}>{documentsError}</Text>
              <AppButton label="Försök igen" onPress={() => void reloadDocuments()} variant="secondary" />
            </View>
          ) : null}
        </View>

        <View style={styles.bottomLinksRow}>
          <Pressable onPress={() => void Linking.openURL(`https://eventor.orientering.se/Events/Show/${normalizeEventId(id)}`)} style={styles.eventorLink}>
            <Ionicons color="#fff" name="open-outline" size={16} />
            <Text style={styles.eventorLinkText}>Visa i Eventor</Text>
          </Pressable>
          <Pressable onPress={async () => { try { await Linking.openURL('https://orientering.liveidrott.se/competitions'); } catch {} }} style={styles.liveresultatLink}>
            <Ionicons color="#fff" name="pulse-outline" size={16} />
            <Text style={styles.liveresultatLinkText}>Nya Liveresultat</Text>
          </Pressable>
        </View>
      </ScrollView>

      <DocumentModal document={activeDocument} onClose={() => setActiveDocument(null)} />
      <PublishedListModal onClose={() => setActiveListModal(null)} onOpenAnalysis={handleOpenAnalysis} state={activeListModal} />
      <SplitTimesModal state={activeSplitTimesModal} onClose={() => setActiveSplitTimesModal(null)} onOpenAnalysis={handleOpenAnalysis} />
      <AnalysisModal onClose={() => setActiveAnalysisModal(null)} state={activeAnalysisModal} />
    </SafeAreaView>
  );
}

function InfoMini({ label, value }: { label: string; value: string }) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  return (
    <View style={styles.infoMini}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1} style={styles.infoValueCompact}>
        {value}
      </Text>
    </View>
  );
}

function InfoTextBlock({ label, value }: { label: string; value: string }) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  return (
    <View style={styles.infoTextBlock}>
      <Text style={styles.infoBlockTitle}>{label}</Text>
      <Text style={styles.sectionText}>{value}</Text>
    </View>
  );
}

function ActionButton({
  disabled = false,
  label,
  onPress,
  tone,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  tone: 'result' | 'start';
}) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  return (
    <AppButton
      disabled={disabled}
      label={label}
      onPress={onPress}
      style={tone === 'result' ? styles.resultButton : styles.startButton}
      textStyle={styles.actionButtonLabel}
      variant={tone === 'result' ? 'primary' : 'secondary'}
    />
  );
}

function MapShortcutButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.mapShortcutButton, pressed ? styles.mapShortcutButtonPressed : null]}>
      <Ionicons color={colors.primaryDeep} name={icon} size={18} />
      <Text style={styles.mapShortcutButtonText}>{label}</Text>
    </Pressable>
  );
}

function formatCountSuffix(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? ` (${value})` : '';
}

function normalizeDocumentName(name: string) {
  return name.trim().toLocaleLowerCase('sv').replace(/\.[^.]+$/, '');
}

function DocumentModal({ document, onClose }: { document: EventDocument | null; onClose: () => void }) {
  const { colors, isDark, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark, themeName), [colors, isDark, themeName]);
  return (
    <Modal animationType="slide" transparent visible={Boolean(document)}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text numberOfLines={2} style={styles.modalTitle}>
              {document?.name}
            </Text>
            <Pressable onPress={onClose}>
              <Text style={styles.modalClose}>Stäng</Text>
            </Pressable>
          </View>

          {document ? <WebView source={{ uri: document.url }} startInLoadingState style={styles.webView} /> : null}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette, isDark: boolean, themeName?: string) {
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  return StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  hero: {
    borderRadius: 28,
    gap: spacing.lg,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  backLabel: {
    ...typography.captionStrong,
    color: colors.heroText,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroBody: {
    gap: 6,
  },
  heroTitle: {
    color: colors.heroText,
    fontFamily: typography.heroTitle.fontFamily,
    fontSize: 19,
    lineHeight: 23,
  },
  heroOrganiser: {
    ...typography.body,
    color: colors.heroTextMuted,
    fontSize: 14,
    lineHeight: 18,
  },
  heroMetaRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  heroMeta: {
    ...typography.body,
    color: colors.heroTextMuted,
    flex: 1,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  heroBadgeText: {
    ...typography.captionStrong,
    color: colors.heroText,
    fontSize: 12,
  },
  heroFavoriteBadge: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  heroFavoriteBadgeActive: {
    backgroundColor: isSoft ? (isDark ? '#3A3000' : '#FFDD00') : colors.accentSoft,
    borderColor: isDark ? (isSoft ? '#8B7A20' : '#8B7A20') : isSoft ? '#CCB200' : colors.primary,
  },
  heroFavoriteBadgeText: {
    ...typography.captionStrong,
    color: colors.textSecondary,
  },
  heroFavoriteBadgeTextActive: {
    color: isDark ? '#F3DA3E' : colors.primaryDeep,
  },
  panel: {
    backgroundColor: colors.surfaceOverlay,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    padding: spacing.lg,
  },
  infoPanel: {
    backgroundColor: isDark ? (isSoft ? '#0E1A38' : '#17301A') : isSoft ? '#E0ECF8' : '#EAF4E0',
    borderColor: isDark ? (isSoft ? '#1E3058' : '#2E5A30') : isSoft ? '#B0C4DE' : '#CEE0C1',
  },
  infoHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoBody: {
    gap: spacing.sm,
  },
  infoTopRow: {
    flexDirection: 'row',
    gap: 6,
  },
  infoMini: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    flex: 1,
    gap: 2,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  infoTextBlock: {
    backgroundColor: colors.surface,
    borderColor: colors.accentGlow,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  infoCardTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 17,
  },
  infoBlockTitle: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    fontSize: 13,
    lineHeight: 16,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 13,
  },
  infoValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 17,
  },
  infoValueCompact: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 14,
  },
  clubHint: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clubHintText: {
    ...typography.captionStrong,
    color: colors.textSecondary,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  actionColumnFull: {
    flex: 1,
  },
  pmButton: {
    marginTop: spacing.xs,
  },
  resultButton: {
    borderColor: colors.primary,
    borderWidth: 1,
    minHeight: 52,
  },
  actionButtonLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  startButton: {
    backgroundColor: isDark ? (isSoft ? '#0E1A38' : '#17301A') : isSoft ? '#E0ECF8' : '#E3F0D7',
    borderColor: isDark ? (isSoft ? '#2A4878' : '#2E5A32') : isSoft ? '#6A9FD8' : '#8CAF7C',
    minHeight: 52,
  },
  liveloxButton: {
    alignItems: 'center',
    backgroundColor: isDark ? '#2E2010' : '#FFF3E0',
    borderColor: isDark ? '#8B5A00' : '#F57C00',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  liveloxButtonPressed: {
    opacity: 0.85,
  },
  liveloxLogo: {
    height: 36,
    width: 120,
  },
  liveloxExternalIcon: {
    marginLeft: spacing.xs,
  },
  navigationButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  navigationContent: {
    minHeight: 260,
  },
  navigationMap: {
    height: 260,
    width: '100%',
  },
  navigationMapFallback: {
    alignItems: 'center',
    backgroundColor: colors.surfaceOverlay,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 260,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  navigationMapFallbackTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  navigationMapFallbackText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  navigationPanel: {
    overflow: 'hidden',
    padding: 0,
  },
  navigationEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 260,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  mapShortcutButton: {
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceMuted : isSoft ? 'rgba(240, 246, 252, 0.94)' : 'rgba(252, 253, 249, 0.94)',
    borderColor: isDark ? colors.border : isSoft ? '#B0C4DE' : '#BED2B6',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mapShortcutButtonPressed: {
    opacity: 0.86,
  },
  mapShortcutButtonText: {
    ...typography.captionStrong,
    color: colors.primaryDeep,
    fontSize: 13,
    lineHeight: 16,
  },
  navigationButtonOverlayRow: {
    bottom: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  navigationButtonOverlaySingle: {
    bottom: spacing.md,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  sectionHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  documentsList: {
    gap: spacing.sm,
  },
  documentRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  bottomLinksRow: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  eventorLink: {
    alignItems: 'center',
    backgroundColor: isDark ? (isSoft ? '#0F347C' : '#1E4428') : colors.primaryDeep,
    borderRadius: 16,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  eventorLinkText: {
    ...typography.bodyStrong,
    color: '#fff',
  },
  liveresultatLink: {
    alignItems: 'center',
    backgroundColor: isDark ? '#C48800' : '#F6A60A',
    borderRadius: 16,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  liveresultatLinkText: {
    ...typography.bodyStrong,
    color: '#fff',
    fontSize: 13,
  },
  liveresultatButton: {
    alignItems: 'center',
    backgroundColor: isDark ? '#C48800' : '#F6A60A',
    borderRadius: 12,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  liveRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  liveRowHalf: {
    flex: 1,
  },
  liveresultatButtonPressed: {
    opacity: 0.85,
  },
  liveresultatButtonText: {
    ...typography.bodyStrong,
    color: '#fff',
  },
  documentCopy: {
    flex: 1,
    gap: 4,
  },
  documentName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  documentMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  documentsErrorBlock: {
    gap: spacing.sm,
  },
  documentsErrorText: {
    ...typography.captionStrong,
    color: colors.error,
  },
  sectionText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  modalOverlay: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '86%',
    overflow: 'hidden',
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
  modalTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
  },
  modalClose: {
    ...typography.buttonSmall,
    color: colors.primary,
  },
  webView: {
    flex: 1,
  },
});
}
