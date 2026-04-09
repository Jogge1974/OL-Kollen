import * as React from 'react';

import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';

import { AnalysisModal, AnalysisModalState, openEventAnalysisModal } from '@/src/components/AnalysisModal';
import { PublishedListModal, PublishedListModalState } from '@/src/components/PublishedListModal';
import { EventSummaryCard } from '@/src/components/EventSummaryCard';
import { colors, getClassificationTone } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { EventItem } from '@/src/types/eventor';

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

export function EventMap({ error, events }: EventMapProps) {
  const mapRef = React.useRef<MapView>(null);
  const ignoreNextMapPressRef = React.useRef(false);
  const [activeListModal, setActiveListModal] = React.useState<PublishedListModalState | null>(null);
  const [activeAnalysisModal, setActiveAnalysisModal] = React.useState<AnalysisModalState | null>(null);
  const [selectedMarkerKey, setSelectedMarkerKey] = React.useState<string | null>(null);
  const [currentRegion, setCurrentRegion] = React.useState<Region>(() => getFallbackRegion(createMarkerGroups(events, DEFAULT_REGION)));
  const markerGroups = React.useMemo(() => createMarkerGroups(events, currentRegion), [currentRegion, events]);
  const [initialRegion, setInitialRegion] = React.useState<Region>(() => getFallbackRegion(createMarkerGroups(events, DEFAULT_REGION)));
  const [locationHint, setLocationHint] = React.useState<string | null>(null);

  const selectedGroup = React.useMemo(() => markerGroups.find((group) => group.key === selectedMarkerKey) ?? null, [markerGroups, selectedMarkerKey]);
  const handleOpenAnalysis = React.useCallback((eventId: string, classLabel: string, personId?: string | null) => {
    void openEventAnalysisModal(eventId, setActiveAnalysisModal, classLabel, personId ?? null);
  }, []);

  React.useEffect(() => {
    const fallbackRegion = getFallbackRegion(markerGroups);
    setInitialRegion(fallbackRegion);
    setCurrentRegion((current) => current ?? fallbackRegion);
    setSelectedMarkerKey((current) => (current && markerGroups.some((group) => group.key === current) ? current : null));
  }, [markerGroups]);

  React.useEffect(() => {
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

        setInitialRegion(nextRegion);
        setCurrentRegion(nextRegion);
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
  }, []);

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
        <MapView
          ref={mapRef}
          initialRegion={initialRegion}
          onRegionChangeComplete={(region) => setCurrentRegion(region)}
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
          {markerGroups.map((group) => {
            const isSelected = selectedMarkerKey === group.key;
            const tone = getClassificationTone(group.events[0]?.classificationId ?? 2);
            const markerColor = isSelected ? colors.accent : tone.accent;

            return (
              <Marker
                coordinate={group.coordinate}
                key={group.key}
                onPress={() => {
                  ignoreNextMapPressRef.current = true;
                  setSelectedMarkerKey(group.key);
                }}
                tracksViewChanges
              >
                <View
                  style={[
                    styles.markerPin,
                    {
                      backgroundColor: markerColor,
                      borderColor: isSelected ? colors.primaryDeep : colors.surface,
                    },
                    isSelected ? styles.markerPinActive : null,
                  ]}
                >
                  <Ionicons color={isSelected ? colors.primaryDeep : colors.heroText} name="flag" size={group.events.length > 1 ? 11 : 13} />
                  {group.events.length > 1 ? <Text style={[styles.markerCount, isSelected ? styles.markerCountActive : null]}>{group.events.length}</Text> : null}
                </View>
                <View style={[styles.markerTip, { borderTopColor: markerColor }]} />
              </Marker>
            );
          })}
        </MapView>

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

function createMarkerGroups(events: EventItem[], region: Region) {
  const positionedEvents = events.filter((event) => event.centerPosition);
  const clusters: Array<{
    coordinate: { latitude: number; longitude: number };
    events: EventItem[];
  }> = [];

  const latitudeThreshold = Math.max(region.latitudeDelta * 0.08, 0.0012);
  const longitudeThreshold = Math.max(region.longitudeDelta * 0.08, 0.0012);

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
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.5, 0.35),
    longitude: (minLongitude + maxLongitude) / 2,
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.5, 0.35),
  };
}

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(252, 253, 249, 0.96)',
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
