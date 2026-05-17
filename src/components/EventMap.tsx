import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { PROVIDER_GOOGLE } from 'react-native-maps';

import { AnalysisModal, AnalysisModalState, openEventAnalysisModal } from '@/src/components/AnalysisModal';
import { PublishedListModal, PublishedListModalState } from '@/src/components/PublishedListModal';
import { EventSummaryCard } from '@/src/components/EventSummaryCard';
import { getClassificationTone } from '@/src/theme/colors';
import { ColorPalette, useTheme } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventItem } from '@/src/types/eventor';
import { canRenderNativeMap } from '@/src/services/nativeMaps';

type EventMapProps = {
  error: string | null;
  events: EventItem[];
};

const DEFAULT_REGION: Region = {
  latitude: 59.3293,
  latitudeDelta: 0.65,
  longitude: 18.0686,
  longitudeDelta: 0.65,
};

export function EventMap(props: EventMapProps) {
  return (
    <MapErrorBoundary>
      <EventMapInner {...props} />
    </MapErrorBoundary>
  );
}

class MapErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[EventMap] Render error caught:', error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 15, textAlign: 'center' }}>Kartan kunde inte laddas. Försök igen senare.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function EventMapInner({ error, events }: EventMapProps) {
  const { colors, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, themeName), [colors, themeName]);
  const mapRef = React.useRef<MapView>(null);
  const ignoreNextMapPressRef = React.useRef(false);
  const [activeListModal, setActiveListModal] = React.useState<PublishedListModalState | null>(null);
  const [activeAnalysisModal, setActiveAnalysisModal] = React.useState<AnalysisModalState | null>(null);
  const [selectedMarkerKey, setSelectedMarkerKey] = React.useState<string | null>(null);
  const [mapReady, setMapReady] = React.useState(false);
  const markerGroups = React.useMemo(() => createMarkerGroups(events), [events]);
  const [initialRegion] = React.useState<Region>(() => getFallbackRegion(markerGroups));
  const [locationHint, setLocationHint] = React.useState<string | null>(null);
  const canShowMap = canRenderNativeMap();

  const selectedGroup = React.useMemo(() => markerGroups.find((group) => group.key === selectedMarkerKey) ?? null, [markerGroups, selectedMarkerKey]);
  const handleOpenAnalysis = React.useCallback((eventId: string, classLabel: string, personId?: string | null) => {
    void openEventAnalysisModal(eventId, setActiveAnalysisModal, classLabel, personId ?? null);
  }, []);

  React.useEffect(() => {
    setSelectedMarkerKey((current) => (current && markerGroups.some((group) => group.key === current) ? current : null));
  }, [markerGroups]);

  React.useEffect(() => {
    if (!canShowMap) {
      setLocationHint(null);
      return;
    }

    let isMounted = true;

    async function loadPosition() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();

        if (!isMounted) {
          return;
        }

        if (permission.status !== 'granted') {
          setLocationHint('Platsåtkomst nekad. Kartan centreras i stället kring tävlingarna med koordinater.');
          return;
        }

        const position = await Location.getCurrentPositionAsync({});

        if (!isMounted) {
          return;
        }

        const nextRegion = {
          latitude: position.coords.latitude,
          latitudeDelta: 0.45,
          longitude: position.coords.longitude,
          longitudeDelta: 0.45,
        };

        requestAnimationFrame(() => {
          mapRef.current?.animateToRegion(nextRegion, 500);
        });
      } catch {
        if (isMounted) {
          setLocationHint('Det gick inte att läsa aktuell position. Kartan visar i stället tävlingarnas område.');
        }
      }
    }

    void loadPosition();

    return () => {
      isMounted = false;
    };
  }, [canShowMap]);

  if (markerGroups.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Ingen karta att visa</Text>
        <Text style={styles.emptyText}>Ingen av tävlingarna i det här urvalet har giltiga koordinater från Eventor.</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        {canShowMap ? (
          <MapView
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            ref={mapRef}
            initialRegion={initialRegion}
            onMapReady={() => setMapReady(true)}
            onPress={() => {
              if (ignoreNextMapPressRef.current) {
                ignoreNextMapPressRef.current = false;
                return;
              }

              setSelectedMarkerKey(null);
            }}
            showsCompass
            showsMyLocationButton
            showsUserLocation
            style={styles.map}
          >
            {mapReady ? markerGroups.map((group) => {
              const tone = getClassificationTone(group.events[0]?.classificationId ?? 2, themeName);

              return (
                <Marker
                  coordinate={group.coordinate}
                  key={group.key}
                  onPress={() => {
                    ignoreNextMapPressRef.current = true;
                    setSelectedMarkerKey(group.key);
                  }}
                  tracksViewChanges={false}
                >
                  <View
                    style={[
                      styles.markerPin,
                      {
                        backgroundColor: tone.accent,
                        borderColor: colors.surface,
                      },
                    ]}
                  >
                    <Ionicons color={colors.heroText} name="flag" size={group.events.length > 1 ? 11 : 13} />
                    {group.events.length > 1 ? <Text style={styles.markerCount}>{group.events.length}</Text> : null}
                  </View>
                  <View style={[styles.markerTip, { borderTopColor: tone.accent }]} />
                </Marker>
              );
            }) : null}
          </MapView>
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.mapFallbackTitle}>Kartan stöds inte i den här Android-byggen ännu.</Text>
            <Text style={styles.mapFallbackText}>Google Maps-nyckeln saknas i appkonfigurationen, så kartvyn kan inte visas säkert just nu.</Text>
          </View>
        )}

        {error ? (
          <View style={styles.inlineBanner}>
            <Text style={styles.inlineBannerText}>{error}</Text>
          </View>
        ) : null}

        {locationHint ? (
          <View style={[styles.inlineBanner, styles.locationBanner]}>
            <Text style={styles.inlineBannerText}>{locationHint}</Text>
          </View>
        ) : null}

        {selectedGroup ? (
          <View style={styles.cardOverlay}>
            <ScrollView contentContainerStyle={styles.cardStack} showsVerticalScrollIndicator={false}>
              {selectedGroup.events.map((event) => (
                <EventSummaryCard key={event.id} item={event} mode="overlay" onOpenList={setActiveListModal} />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>

      <PublishedListModal onClose={() => setActiveListModal(null)} onOpenAnalysis={handleOpenAnalysis} state={activeListModal} />
      <AnalysisModal onClose={() => setActiveAnalysisModal(null)} state={activeAnalysisModal} />
    </>
  );
}

function isValidCoordinate(pos: { latitude: number; longitude: number } | null | undefined): pos is { latitude: number; longitude: number } {
  if (!pos) return false;
  const { latitude, longitude } = pos;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude === 0 && longitude === 0) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  return true;
}

function createMarkerGroups(events: EventItem[]) {
  const positionedEvents = events.filter((event) => isValidCoordinate(event.centerPosition));
  const clusters: Array<{
    coordinate: { latitude: number; longitude: number };
    events: EventItem[];
  }> = [];

  // Fixed thresholds – events within ~1km are clustered together
  const latitudeThreshold = 0.009;
  const longitudeThreshold = 0.012;

  positionedEvents.forEach((event) => {
    const coordinate = event.centerPosition!;
    const matchingCluster = clusters.find((cluster) => {
      return areCoordinatesClose(cluster.coordinate, coordinate, latitudeThreshold, longitudeThreshold);
    });

    if (!matchingCluster) {
      clusters.push({
        coordinate,
        events: [event],
      });
      return;
    }

    matchingCluster.events.push(event);
    matchingCluster.coordinate = {
      latitude: average(matchingCluster.events.map((item) => item.centerPosition!.latitude)),
      longitude: average(matchingCluster.events.map((item) => item.centerPosition!.longitude)),
    };
  });

  return clusters.map((cluster) => ({
    coordinate: cluster.coordinate,
    events: cluster.events.sort((left, right) => left.startDate.localeCompare(right.startDate) || left.name.localeCompare(right.name, 'sv')),
    key: cluster.events
      .map((event) => event.id)
      .sort((left, right) => left.localeCompare(right))
      .join(':'),
  }));
}

function areCoordinatesClose(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
  latitudeThreshold: number,
  longitudeThreshold: number,
) {
  return Math.abs(left.latitude - right.latitude) <= latitudeThreshold && Math.abs(left.longitude - right.longitude) <= longitudeThreshold;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getFallbackRegion(groups: Array<{ coordinate: { latitude: number; longitude: number } }>): Region {
  if (groups.length === 0) {
    return DEFAULT_REGION;
  }

  const latitudes = groups.map((group) => group.coordinate.latitude);
  const longitudes = groups.map((group) => group.coordinate.longitude);

  let minLatitude = latitudes[0];
  let maxLatitude = latitudes[0];
  let minLongitude = longitudes[0];
  let maxLongitude = longitudes[0];

  for (let i = 1; i < latitudes.length; i += 1) {
    if (latitudes[i] < minLatitude) minLatitude = latitudes[i];
    if (latitudes[i] > maxLatitude) maxLatitude = latitudes[i];
  }

  for (let i = 1; i < longitudes.length; i += 1) {
    if (longitudes[i] < minLongitude) minLongitude = longitudes[i];
    if (longitudes[i] > maxLongitude) maxLongitude = longitudes[i];
  }

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.5, 0.35),
    longitude: (minLongitude + maxLongitude) / 2,
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.5, 0.35),
  };
}

function createStyles(colors: ColorPalette, themeName?: string) {
  const isSoft = themeName === 'soft' || themeName === 'soft-dark';
  return StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
  },
  mapFallback: {
    alignItems: 'center',
    backgroundColor: colors.surfaceOverlay,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 260,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  mapFallbackTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  mapFallbackText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  markerPin: {
    alignItems: 'center',
    borderColor: colors.surface,
    borderRadius: 18,
    borderWidth: 2,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  markerCount: {
    color: colors.heroText,
    fontFamily: typography.captionStrong.fontFamily,
    fontSize: 9,
    lineHeight: 10,
    marginTop: -1,
  },
  markerCountActive: {
    color: colors.primaryDeep,
  },
  markerPinActive: {
    transform: [{ scale: 1.08 }],
  },
  markerTip: {
    alignSelf: 'center',
    borderLeftColor: 'transparent',
    borderLeftWidth: 6,
    borderRightColor: 'transparent',
    borderRightWidth: 6,
    borderTopWidth: 9,
    marginTop: -2,
  },
  cardOverlay: {
    bottom: spacing.md,
    left: spacing.sm,
    maxHeight: 270,
    position: 'absolute',
    right: spacing.sm,
  },
  cardStack: {
    gap: spacing.sm,
    paddingBottom: 2,
  },
  inlineBanner: {
    backgroundColor: isSoft ? 'rgba(240, 246, 252, 0.96)' : 'rgba(252, 253, 249, 0.96)',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    left: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
  },
  locationBanner: {
    top: 68,
  },
  inlineBannerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surfaceOverlay,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 260,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
}
