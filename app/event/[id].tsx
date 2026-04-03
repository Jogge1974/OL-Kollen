import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { LayoutChangeEvent, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { fetchEventPublishedListXml } from '@/src/api/eventorApi';
import { AppButton } from '@/src/components/AppButton';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';
import { useEventDocuments } from '@/src/hooks/useEventDocuments';
import { useEventorEventDetail } from '@/src/hooks/useEventorEventDetail';
import { PublishedListRow, PublishedListSection, formatPublishedListXml } from '@/src/services/publishedListFormatter';
import { useAuthStore } from '@/src/store/authStore';
import { colors, getClassificationTone } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventDocument, EventPublishedListKind, EventPublishedListScope } from '@/src/types/eventor';

type ActiveListModalState = {
  emptyMessage: string;
  error: string | null;
  isLoading: boolean;
  kind: EventPublishedListKind;
  scope: EventPublishedListScope;
  sections: PublishedListSection[];
  title: string;
};

type PickerAnchor = {
  key: string;
  label: string;
};

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { error, event, isLoading, reload } = useEventorEventDetail(id);
  const { documents, error: documentsError, isLoading: isLoadingDocuments, reload: reloadDocuments } = useEventDocuments(event?.id ?? null);
  const [activeDocument, setActiveDocument] = React.useState<EventDocument | null>(null);
  const [activeListModal, setActiveListModal] = React.useState<ActiveListModalState | null>(null);
  const [isInfoExpanded, setIsInfoExpanded] = React.useState(false);
  const user = useAuthStore((state) => state.user);

  const tone = getClassificationTone(event?.classificationId ?? 2);
  const organisationId = user?.organisationIds[0] ?? null;
  const clubName = user?.organisationName ?? null;
  const isLoggedIn = Boolean(user);

  React.useEffect(() => {
    console.log('[EventDetail] club context', {
      isLoggedIn,
      clubCount: user?.organisationIds.length ?? 0,
      clubId: organisationId ?? null,
      clubName: clubName ?? null,
    });
  }, [clubName, isLoggedIn, organisationId, user?.organisationIds.length]);

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

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient colors={tone.detailGradient} style={styles.hero}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons color={colors.heroText} name="chevron-back" size={18} />
            <Text style={styles.backLabel}>Till kalendern</Text>
          </Pressable>

          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>{event.name}</Text>
            <View style={styles.heroMetaRow}>
              <Text style={styles.heroMeta}>{event.dateLabel}</Text>
              <View style={[styles.heroBadge, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
                <Text style={styles.heroBadgeText}>{event.classificationLabel}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.panel}>
          <Pressable onPress={() => setIsInfoExpanded((current) => !current)} style={styles.infoHeader}>
            <Text style={styles.infoCardTitle}>Information</Text>
            <Ionicons color={colors.primary} name={isInfoExpanded ? 'chevron-up' : 'chevron-down'} size={20} />
          </Pressable>

          {isInfoExpanded ? (
            <View style={styles.infoBody}>
              <View style={styles.infoTopRow}>
                <InfoMini label="Gren" value={event.disciplineLabel} />
                <InfoMini label="Distans" value={event.distanceLabel} />
                <InfoMini label="Senast ändrad" value={event.modifyDate ?? 'Ej angivet'} />
              </View>
              <InfoWide label="Arrangör" value={event.organiserNames.length > 0 ? event.organiserNames.join(', ') : 'Ej angivet'} />
              {event.message ? <InfoTextBlock label="Eventor-meddelande" value={event.message} /> : null}
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

        {event.hasPublishedResults ? (
          <PublishedListCard
            kind="results"
            organisationLabel={clubName}
            onOpenOrganisation={organisationId ? () => void openListModal('results', 'organisation', event.id, organisationId, clubName, setActiveListModal) : undefined}
            onOpenPublic={() => void openListModal('results', 'public', event.id, organisationId, clubName, setActiveListModal)}
          />
        ) : null}

        {event.hasPublishedStarts ? (
          <PublishedListCard
            kind="starts"
            organisationLabel={clubName}
            onOpenOrganisation={organisationId ? () => void openListModal('starts', 'organisation', event.id, organisationId, clubName, setActiveListModal) : undefined}
            onOpenPublic={() => void openListModal('starts', 'public', event.id, organisationId, clubName, setActiveListModal)}
          />
        ) : null}

        <PublishedListCard
          kind="entries"
          organisationLabel={clubName}
          onOpenOrganisation={organisationId ? () => void openListModal('entries', 'organisation', event.id, organisationId, clubName, setActiveListModal) : undefined}
          onOpenPublic={() => void openListModal('entries', 'public', event.id, organisationId, clubName, setActiveListModal)}
        />

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

function InfoWide({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoWide}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.infoValue}>
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

function PublishedListCard({
  kind,
  organisationLabel,
  onOpenOrganisation,
  onOpenPublic,
}: {
  kind: EventPublishedListKind;
  organisationLabel?: string | null;
  onOpenOrganisation?: () => void;
  onOpenPublic: () => void;
}) {
  return (
    <View style={styles.listCard}>
      <Text style={styles.listCardTitle}>{getListCardTitle(kind)}</Text>
      <View style={styles.listButtonRow}>
        <AppButton label={getPublicListButtonLabel(kind)} onPress={onOpenPublic} style={styles.listButton} variant="secondary" />
        {onOpenOrganisation ? (
          <AppButton
            label={getOrganisationListButtonLabel(kind, organisationLabel)}
            onPress={onOpenOrganisation}
            style={styles.listButton}
            variant="secondary"
          />
        ) : null}
      </View>
    </View>
  );
}

function PublishedListModal({ onClose, state }: { onClose: () => void; state: ActiveListModalState | null }) {
  const scrollRef = React.useRef<ScrollView>(null);
  const [anchorOffsets, setAnchorOffsets] = React.useState<Record<string, number>>({});
  const [selectedAnchorKey, setSelectedAnchorKey] = React.useState<string | null>(null);

  const pickerAnchors = React.useMemo(() => buildPickerAnchors(state?.sections ?? [], state?.scope ?? 'public'), [state?.scope, state?.sections]);
  const shouldShowPicker = !state?.isLoading && !state?.error && state?.scope === 'public' && pickerAnchors.length > 1;

  React.useEffect(() => {
    setAnchorOffsets({});
    setSelectedAnchorKey(pickerAnchors[0]?.key ?? null);
  }, [state?.title, pickerAnchors]);

  const handleAnchorPress = React.useCallback(
    (anchorKey: string) => {
      setSelectedAnchorKey(anchorKey);
      const offset = anchorOffsets[anchorKey];

      if (typeof offset === 'number') {
        scrollRef.current?.scrollTo({
          animated: true,
          y: Math.max(offset - 56, 0),
        });
      }
    },
    [anchorOffsets],
  );

  const handleAnchorLayout = React.useCallback((anchorKey: string, event: LayoutChangeEvent) => {
    const nextOffset = event.nativeEvent.layout.y;
    setAnchorOffsets((current) => (current[anchorKey] === nextOffset ? current : { ...current, [anchorKey]: nextOffset }));
  }, []);

  return (
    <Modal animationType="slide" transparent visible={Boolean(state)}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text numberOfLines={2} style={styles.modalTitle}>
              {state?.title}
            </Text>
            <Pressable onPress={onClose}>
              <Text style={styles.modalClose}>Stäng</Text>
            </Pressable>
          </View>

          {shouldShowPicker ? (
            <View style={styles.classPickerContainer}>
              <ScrollView horizontal contentContainerStyle={styles.classPickerRow} showsHorizontalScrollIndicator={false}>
                {pickerAnchors.map((anchor) => (
                  <Pressable
                    key={anchor.key}
                    onPress={() => handleAnchorPress(anchor.key)}
                    style={[styles.classChip, selectedAnchorKey === anchor.key ? styles.classChipActive : null]}
                  >
                    <Text style={[styles.classChipText, selectedAnchorKey === anchor.key ? styles.classChipTextActive : null]}>{anchor.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <ScrollView ref={scrollRef} contentContainerStyle={styles.listModalContent}>
            {state?.isLoading ? <LoadingState label="Hämtar listan..." /> : null}
            {state?.error ? <Text style={styles.documentsErrorText}>{state.error}</Text> : null}
            {!state?.isLoading && !state?.error && state?.sections.length === 0 ? <Text style={styles.sectionText}>{state.emptyMessage}</Text> : null}

            {!state?.isLoading && !state?.error
              ? state?.sections.map((section) => (
                  <PublishedTableSection
                    key={section.title}
                    kind={state.kind}
                    onAnchorLayout={handleAnchorLayout}
                    scope={state.scope}
                    section={section}
                  />
                ))
              : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PublishedTableSection({
  kind,
  onAnchorLayout,
  scope,
  section,
}: {
  kind: EventPublishedListKind;
  onAnchorLayout: (anchorKey: string, event: LayoutChangeEvent) => void;
  scope: EventPublishedListScope;
  section: PublishedListSection;
}) {
  const seenClassAnchors = React.useRef<Set<string>>(new Set());
  seenClassAnchors.current.clear();

  return (
    <View onLayout={scope === 'public' ? (event) => onAnchorLayout(`section:${section.title}`, event) : undefined} style={styles.tableSection}>
      <View style={styles.tableClassHeader}>
        <View style={styles.tableClassHeaderTopRow}>
          <Text numberOfLines={1} style={styles.tableClassHeaderText}>
            {formatSectionTitle(section)}
          </Text>
          {section.meta ? <Text style={styles.tableClassHeaderMeta}>{formatSectionMeta(section.meta)}</Text> : null}
        </View>
        <View style={styles.tableColumnHeaderRow}>
          {kind === 'results' ? (
            <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tablePlacementColumn]}>
              #
            </Text>
          ) : null}

          <Text numberOfLines={1} style={[styles.tableColumnHeaderText, scope === 'public' ? styles.tableNameColumn : styles.tableWideNameColumn]}>
            Namn
          </Text>

          {scope === 'public' ? (
            <Text
              numberOfLines={1}
              style={[styles.tableColumnHeaderText, kind === 'results' ? styles.tableOrganisationColumn : styles.tableWideOrganisationColumn]}
            >
              Klubb
            </Text>
          ) : (
            <>
              <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tableClassColumn]}>
                Klass
              </Text>
              <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tableCourseColumn]}>
                Längd
              </Text>
            </>
          )}

          <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tableMetricColumn]}>
            Tid
          </Text>

          {kind === 'results' ? (
            <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tableMetricColumn]}>
              Diff
            </Text>
          ) : null}

          {kind === 'results' ? (
            <Text numberOfLines={1} style={[styles.tableColumnHeaderText, styles.tableMetricColumn]}>
              Km-tid
            </Text>
          ) : null}
        </View>
      </View>

      {section.rows.map((row, rowIndex) => {
        const classAnchorKey = row.classLabel ? `class:${row.classLabel}` : null;
        const shouldAttachClassAnchor = scope === 'organisation' && classAnchorKey && !seenClassAnchors.current.has(classAnchorKey);

        if (shouldAttachClassAnchor && classAnchorKey) {
          seenClassAnchors.current.add(classAnchorKey);
        }

        return (
          <View
            key={`${section.title}-${row.primary}-${rowIndex}`}
            onLayout={shouldAttachClassAnchor && classAnchorKey ? (event) => onAnchorLayout(classAnchorKey, event) : undefined}
            style={[styles.tableRow, rowIndex % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd]}
          >
            {kind === 'results' ? (
              <Text numberOfLines={1} style={[styles.tableCellText, styles.tablePlacementColumn]}>
                {row.position ?? '—'}
              </Text>
            ) : null}

            <Text numberOfLines={1} style={[styles.tableCellText, scope === 'public' ? styles.tableNameColumn : styles.tableWideNameColumn]}>
              <PersonNameText familyName={row.familyName} givenName={row.givenName} primary={row.primary} />
            </Text>

            {scope === 'public' ? (
              <Text style={[styles.tableCellText, kind === 'results' ? styles.tableOrganisationColumn : styles.tableWideOrganisationColumn]}>
                {row.organisation ?? '—'}
              </Text>
            ) : (
              <>
                <Text style={[styles.tableCellText, styles.tableClassColumn]}>{row.classLabel ?? '—'}</Text>
                <Text style={[styles.tableCellText, styles.tableCourseColumn]}>{row.courseLengthLabel ?? '—'}</Text>
              </>
            )}

            <Text numberOfLines={1} style={[styles.tableCellText, styles.tableMetricColumn, styles.tableMetricStrong]}>
              {row.time ?? '—'}
            </Text>

            {kind === 'results' ? (
              <Text numberOfLines={1} style={[styles.tableCellText, styles.tableMetricColumn, styles.tableMetricStrong]}>
                {row.diff ?? '—'}
              </Text>
            ) : null}

            {kind === 'results' ? (
              <Text numberOfLines={1} style={[styles.tableCellText, styles.tableMetricColumn]}>
                {row.pace ?? '—'}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function PersonNameText({
  familyName,
  givenName,
  primary,
}: {
  familyName?: string;
  givenName?: string;
  primary: string;
}) {
  if (!familyName && !givenName) {
    return <Text style={styles.tableCellText}>{primary}</Text>;
  }

  return (
    <Text style={styles.tableCellText}>
      {givenName ? `${givenName} ` : null}
      <Text style={styles.tableSurname}>{familyName ?? ''}</Text>
    </Text>
  );
}

async function openListModal(
  kind: EventPublishedListKind,
  scope: EventPublishedListScope,
  eventId: string,
  organisationId: string | null,
  organisationLabel: string | null,
  setActiveListModal: React.Dispatch<React.SetStateAction<ActiveListModalState | null>>,
) {
  setActiveListModal({
    emptyMessage: getEmptyListMessage(kind),
    error: null,
    isLoading: true,
    kind,
    scope,
    sections: [],
    title: getListTitle(kind, scope),
  });

  try {
    const rawXml = await fetchEventPublishedListXml(kind, scope, eventId, organisationId ?? undefined);
    const formatted = formatPublishedListXml(kind, rawXml, { organisationId, scope });
    const sections =
      scope === 'organisation'
        ? formatted.sections.map((section) => ({
            ...section,
            title: organisationLabel ?? 'Min klubb',
          }))
        : formatted.sections;

    setActiveListModal({
      emptyMessage: formatted.emptyMessage,
      error: null,
      isLoading: false,
      kind,
      scope,
      sections,
      title: getListTitle(kind, scope),
    });
  } catch (loadError) {
    setActiveListModal({
      emptyMessage: getEmptyListMessage(kind),
      error: loadError instanceof Error ? loadError.message : 'Det gick inte att hämta listan.',
      isLoading: false,
      kind,
      scope,
      sections: [],
      title: getListTitle(kind, scope),
    });
  }
}

function buildPickerAnchors(sections: PublishedListSection[], scope: EventPublishedListScope): PickerAnchor[] {
  if (scope === 'public') {
    return sections.map((section) => ({
      key: `section:${section.title}`,
      label: section.title,
    }));
  }

  const classLabels = new Set<string>();

  sections.forEach((section) => {
    section.rows.forEach((row) => {
      if (row.classLabel) {
        classLabels.add(row.classLabel);
      }
    });
  });

  return Array.from(classLabels).map((label) => ({
    key: `class:${label}`,
    label,
  }));
}

function formatSectionMeta(meta: string) {
  return meta
    .replace(/\s*•\s*Bana:\s*[^•]+/i, '')
    .replace(/^Bana:\s*[^•]+/i, '')
    .trim();
}

function formatSectionTitle(section: PublishedListSection) {
  const courseLengthMatch = section.meta?.match(/Bana:\s*([^•]+)/i)?.[1]?.trim() ?? null;
  return courseLengthMatch ? `${section.title} - ${courseLengthMatch}` : section.title;
}

function getListCardTitle(kind: EventPublishedListKind) {
  if (kind === 'results') {
    return 'Resultatlista';
  }

  if (kind === 'starts') {
    return 'Startlista';
  }

  return 'Anmälningar';
}

function getPublicListButtonLabel(kind: EventPublishedListKind) {
  if (kind === 'results') {
    return 'Resultat';
  }

  if (kind === 'starts') {
    return 'Startlista';
  }

  return 'Anmälningar';
}

function getOrganisationListButtonLabel(kind: EventPublishedListKind, organisationLabel?: string | null) {
  const suffix = organisationLabel ? ` ${organisationLabel}` : ' min klubb';

  if (kind === 'results') {
    return `Resultat${suffix}`;
  }

  if (kind === 'starts') {
    return `Start${suffix}`;
  }

  return `Anmälan${suffix}`;
}

function getEmptyListMessage(kind: EventPublishedListKind) {
  if (kind === 'results') {
    return 'Ingen resultatlista hittades.';
  }

  if (kind === 'starts') {
    return 'Ingen startlista hittades.';
  }

  return 'Inga anmälningar hittades.';
}

function getListTitle(kind: EventPublishedListKind, scope: EventPublishedListScope) {
  const prefix = scope === 'organisation' ? 'Min klubbs ' : 'Hela ';

  if (kind === 'results') {
    return `${prefix}resultatlista`;
  }

  if (kind === 'starts') {
    return `${prefix}startlista`;
  }

  return `${prefix}anmälningslista`;
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
  heroBody: {
    gap: spacing.md,
  },
  heroTitle: {
    color: colors.heroText,
    fontFamily: typography.heroTitle.fontFamily,
    fontSize: 19,
    lineHeight: 23,
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
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  heroBadgeText: {
    ...typography.captionStrong,
    color: colors.heroText,
    fontSize: 12,
  },
  panel: {
    backgroundColor: colors.surfaceOverlay,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    padding: spacing.lg,
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
  infoWide: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    gap: 3,
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
    fontSize: 17,
    lineHeight: 20,
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
  listCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  listCardTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  listButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  listButton: {
    flex: 1,
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
  listModalContent: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  classPickerContainer: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  classPickerRow: {
    gap: 0,
    paddingBottom: 0,
  },
  classChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  classChipActive: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  classChipText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 10,
  },
  classChipTextActive: {
    color: colors.heroText,
  },
  tableSection: {
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginHorizontal: -spacing.lg,
    overflow: 'hidden',
  },
  tableClassHeader: {
    backgroundColor: colors.primaryDeep,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    paddingTop: spacing.sm,
  },
  tableClassHeaderTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tableClassHeaderText: {
    ...typography.bodyStrong,
    color: colors.heroText,
    flex: 1,
  },
  tableClassHeaderMeta: {
    ...typography.caption,
    color: colors.heroText,
    fontSize: 11,
  },
  tableColumnHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 4,
  },
  tableColumnHeaderText: {
    ...typography.caption,
    color: colors.heroText,
    fontSize: 10,
    lineHeight: 12,
  },
  tableRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  tableRowEven: {
    backgroundColor: colors.surface,
  },
  tableRowOdd: {
    backgroundColor: '#F1F8EA',
  },
  tableCellText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 15,
  },
  tablePlacementColumn: {
    flex: 0.75,
    paddingRight: 4,
    textAlign: 'left',
  },
  tableNameColumn: {
    flex: 2.3,
    paddingRight: 4,
  },
  tableWideNameColumn: {
    flex: 2.6,
    paddingRight: 4,
  },
  tableOrganisationColumn: {
    flex: 2.2,
    paddingRight: 4,
  },
  tableWideOrganisationColumn: {
    flex: 2.4,
    paddingRight: 4,
  },
  tableClassColumn: {
    flex: 1.7,
    paddingRight: 4,
  },
  tableCourseColumn: {
    flex: 1.1,
    paddingRight: 4,
  },
  tableMetricColumn: {
    flex: 1,
    textAlign: 'left',
  },
  tableMetricStrong: {
    fontFamily: typography.bodyStrong.fontFamily,
  },
  tableSurname: {
    fontFamily: typography.bodyStrong.fontFamily,
  },
});
