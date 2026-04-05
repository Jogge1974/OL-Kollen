import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { AppButton } from '@/src/components/AppButton';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';
import { PublishedListModal, PublishedListModalState, openPublishedListModal } from '@/src/components/PublishedListModal';
import { useEventCompetitorCount } from '@/src/hooks/useEventCompetitorCount';
import { useEventDocuments } from '@/src/hooks/useEventDocuments';
import { useEventorEventDetail } from '@/src/hooks/useEventorEventDetail';
import { useAuthStore } from '@/src/store/authStore';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { colors, getClassificationTone } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventDocument, EventPublishedListKind } from '@/src/types/eventor';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { error, event, isLoading, reload } = useEventorEventDetail(id);
  const { documents, error: documentsError, isLoading: isLoadingDocuments, reload: reloadDocuments } = useEventDocuments(event?.id ?? null);
  const [activeDocument, setActiveDocument] = React.useState<EventDocument | null>(null);
  const [activeListModal, setActiveListModal] = React.useState<PublishedListModalState | null>(null);
  const [isInfoExpanded, setIsInfoExpanded] = React.useState(false);
  const user = useAuthStore((state) => state.user);
  const favoriteEvents = usePreferencesStore((state) => state.favoriteEvents);
  const toggleFavorite = usePreferencesStore((state) => state.toggleFavorite);

  const tone = getClassificationTone(event?.classificationId ?? 2);
  const organisationId = user?.organisationIds[0] ?? null;
  const clubName = user?.organisationName ?? null;
  const { counts } = useEventCompetitorCount(event?.id ?? null, organisationId);
  const isLoggedIn = Boolean(user);
  const isFavorite = React.useMemo(() => favoriteEvents.some((favoriteEvent) => favoriteEvent.id === event?.id), [event?.id, favoriteEvents]);
  const showResultActions = event?.hasPublishedResults ?? false;
  const secondaryKind: EventPublishedListKind = event?.hasPublishedStarts ? 'starts' : 'entries';

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
      id: event.id,
      name: event.name,
      startDate: event.startDate,
    });
  };

  const openList = async (kind: EventPublishedListKind, scope: 'public' | 'organisation') => {
    await openPublishedListModal(kind, scope, event.id, organisationId, clubName, setActiveListModal);
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
      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient colors={tone.detailGradient} style={styles.hero}>
          <View style={styles.heroTopRow}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons color={colors.heroText} name="chevron-back" size={18} />
              <Text style={styles.backLabel}>Till kalendern</Text>
            </Pressable>

            <Pressable onPress={() => void handleToggleFavorite()} style={[styles.heroFavoriteBadge, isFavorite ? styles.heroFavoriteBadgeActive : null]}>
              <Ionicons color={isFavorite ? colors.primaryDeep : colors.textSecondary} name={isFavorite ? 'star' : 'star-outline'} size={14} />
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
            <Text style={styles.clubHintText}>Inloggad, men inget klubb-id hittades i Eventor-svaret.</Text>
          </View>
        ) : null}

        <View style={styles.actionGrid}>
          {showResultActions ? (
            <View style={styles.actionColumn}>
              <ActionButton label={`Resultat${formatCountSuffix(counts.totalStarts)}`} onPress={() => void openList('results', 'public')} tone="result" />
              {organisationId ? (
                <ActionButton
                  label={`Resultat ${clubName ?? 'klubb'}${formatCountSuffix(counts.organisationStarts)}`}
                  onPress={() => void openList('results', 'organisation')}
                  tone="result"
                />
              ) : null}
              <ActionButton disabled label="Sträcktider" onPress={() => undefined} tone="result" />
            </View>
          ) : null}

          <View style={[styles.actionColumn, !showResultActions ? styles.actionColumnFull : null]}>
            <ActionButton
              label={`${event.hasPublishedStarts ? 'Startlista' : 'Anmälningar'}${formatCountSuffix(counts.totalEntries)}`}
              onPress={() => void openList(secondaryKind, 'public')}
              tone="start"
            />
            {organisationId ? (
              <ActionButton
                label={`${event.hasPublishedStarts ? 'Startlista' : 'Anmälningar'} ${clubName ?? 'klubb'}${formatCountSuffix(counts.organisationEntries)}`}
                onPress={() => void openList(secondaryKind, 'organisation')}
                tone="start"
              />
            ) : null}
          </View>
        </View>

        <View style={[styles.panel, styles.navigationPanel]}>
          {event.centerPosition ? (
            <View style={styles.navigationContent}>
              <MapView
                initialRegion={{
                  latitude: event.centerPosition.latitude,
                  latitudeDelta: 0.09,
                  longitude: event.centerPosition.longitude,
                  longitudeDelta: 0.09,
                }}
                rotateEnabled={false}
                scrollEnabled
                style={styles.navigationMap}
                zoomEnabled
              >
                <Marker coordinate={event.centerPosition} pinColor={colors.accent} title={event.name} />
              </MapView>

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
                  <Ionicons color={colors.primary} name="open-outline" size={18} />
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
      </ScrollView>

      <DocumentModal document={activeDocument} onClose={() => setActiveDocument(null)} />
      <PublishedListModal state={activeListModal} onClose={() => setActiveListModal(null)} />
    </SafeAreaView>
  );
}

function InfoMini({ label, value }: { label: string; value: string }) {
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

function DocumentModal({ document, onClose }: { document: EventDocument | null; onClose: () => void }) {
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

const styles = StyleSheet.create({
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
    backgroundColor: colors.accentSoft,
    borderColor: colors.primary,
  },
  heroFavoriteBadgeText: {
    ...typography.captionStrong,
    color: colors.textSecondary,
  },
  heroFavoriteBadgeTextActive: {
    color: colors.primaryDeep,
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
    backgroundColor: '#EAF4E0',
    borderColor: '#CEE0C1',
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
    backgroundColor: '#E3F0D7',
    borderColor: '#8CAF7C',
    minHeight: 52,
  },
  navigationButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  navigationContent: {
    minHeight: 200,
  },
  navigationMap: {
    height: 200,
    width: '100%',
  },
  navigationPanel: {
    overflow: 'hidden',
    padding: 0,
  },
  navigationEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  mapShortcutButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(252, 253, 249, 0.94)',
    borderColor: '#BED2B6',
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
