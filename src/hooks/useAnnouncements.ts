import * as React from 'react';

import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getSupabaseClient } from '@/src/services/supabase';
import { usePreferencesStore } from '@/src/store/preferencesStore';
import { Announcement, AnnouncementSeverity } from '@/src/types/announcements';

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  severity: string | null;
  starts_at: string | null;
  ends_at: string | null;
  min_version: string | null;
  action_label: string | null;
  action_url: string | null;
  created_at: string | null;
};

type AppConfigRow = {
  latest_version: string | null;
  ios_store_url: string | null;
  android_store_url: string | null;
  update_title: string | null;
  update_body: string | null;
};

const SEVERITY_PRIORITY: Record<AnnouncementSeverity, number> = {
  update: 3,
  warning: 2,
  info: 1,
};

function normalizeSeverity(value: string | null): AnnouncementSeverity {
  return value === 'warning' || value === 'update' ? value : 'info';
}

// Compares dotted numeric versions (e.g. "1.2.0"). Returns 1 if a>b, -1 if a<b, 0 if equal.
function compareVersions(a: string, b: string) {
  const partsA = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const partsB = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);

  for (let index = 0; index < length; index += 1) {
    const valueA = partsA[index] ?? 0;
    const valueB = partsB[index] ?? 0;
    if (valueA > valueB) return 1;
    if (valueA < valueB) return -1;
  }

  return 0;
}

function isWithinWindow(row: AnnouncementRow, now: number) {
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return false;
  if (row.ends_at && new Date(row.ends_at).getTime() < now) return false;
  return true;
}

function meetsVersionTarget(minVersion: string | null, currentVersion: string | null) {
  if (!minVersion || !currentVersion) return true;
  return compareVersions(currentVersion, minVersion) >= 0;
}

/**
 * Loads active in-app announcements from Supabase plus an optional synthetic
 * "update" announcement derived from app_config.latest_version. Returns the
 * single highest-priority announcement the user has not dismissed.
 *
 * Dismissal is keyed by announcement id (stored on device), so a brand new
 * announcement always reappears and must be dismissed again.
 */
export function useAnnouncements() {
  const dismissedIds = usePreferencesStore((state) => state.dismissedAnnouncementIds);
  const dismissAnnouncement = usePreferencesStore((state) => state.dismissAnnouncement);
  const isHydrated = usePreferencesStore((state) => state.isHydrated);
  const baselineInitialized = usePreferencesStore((state) => state.announcementsBaselineInitialized);
  const [loadedAnnouncements, setLoadedAnnouncements] = React.useState<Announcement[]>([]);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const client = getSupabaseClient();
      if (!client) {
        return;
      }

      // Compare against the same version shown in "Om Kontrollen" (app.config.ts
      // version). Fall back to the native app version if the config is missing.
      const currentVersion = Constants.expoConfig?.version ?? Application.nativeApplicationVersion ?? null;
      const now = Date.now();

      try {
        const [announcementsResult, configResult] = await Promise.all([
          client.from('announcements').select('*').eq('active', true).order('created_at', { ascending: false }),
          client
            .from('app_config')
            .select('latest_version, ios_store_url, android_store_url, update_title, update_body')
            .limit(1)
            .maybeSingle(),
        ]);

        if (!isMounted) {
          return;
        }

        const rows = (announcementsResult.data as AnnouncementRow[] | null) ?? [];
        const collected: Announcement[] = rows
          .filter((row) => isWithinWindow(row, now) && meetsVersionTarget(row.min_version, currentVersion))
          .map((row) => ({
            id: row.id,
            title: row.title,
            body: row.body,
            severity: normalizeSeverity(row.severity),
            actionLabel: row.action_label,
            actionUrl: row.action_url,
            createdAt: row.created_at,
          }));

        const config = (configResult.data as AppConfigRow | null) ?? null;
        if (config?.latest_version && currentVersion && compareVersions(config.latest_version, currentVersion) > 0) {
          const storeUrl = Platform.OS === 'ios' ? config.ios_store_url : config.android_store_url;
          collected.unshift({
            id: `update-${config.latest_version}`,
            title: config.update_title || 'Ny version tillgänglig',
            body: config.update_body || `Version ${config.latest_version} finns nu ute. Uppdatera för de senaste förbättringarna.`,
            severity: 'update',
            actionLabel: 'Uppdatera',
            actionUrl: storeUrl,
          });
        }

        setLoadedAnnouncements(collected);
        // Establishes the first-launch baseline (so a fresh install doesn't
        // banner historical messages) and prunes dismissed ids for messages
        // that no longer exist.
        void usePreferencesStore.getState().syncAnnouncements(collected.map((item) => item.id));
      } catch {
        if (isMounted) {
          setLoadedAnnouncements([]);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  const visibleAnnouncements = React.useMemo(() => {
    // Wait for hydration and the first-launch baseline so a fresh install does
    // not briefly banner the whole message history.
    if (!isHydrated || !baselineInitialized) {
      return [];
    }

    const candidates = loadedAnnouncements.filter((item) => !dismissedIds.includes(item.id));

    // Highest severity first; rows already arrive newest-first, and the sort is
    // stable so that ordering is preserved within the same severity.
    return [...candidates].sort((left, right) => SEVERITY_PRIORITY[right.severity] - SEVERITY_PRIORITY[left.severity]);
  }, [loadedAnnouncements, dismissedIds, isHydrated, baselineInitialized]);

  // All currently active announcements regardless of dismissal, used by the
  // "all messages" history view opened from the bell icon.
  const allAnnouncements = React.useMemo(
    () => [...loadedAnnouncements].sort((left, right) => SEVERITY_PRIORITY[right.severity] - SEVERITY_PRIORITY[left.severity]),
    [loadedAnnouncements],
  );

  const refetch = React.useCallback(() => setRefreshKey((value) => value + 1), []);

  return {
    allAnnouncements,
    announcements: visibleAnnouncements,
    dismiss: dismissAnnouncement,
    refetch,
  };
}
