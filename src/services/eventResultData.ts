import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { fetchBatchCompetitorCounts, fetchEventPublishedListXml, fetchEventSplitTimesXml } from '@/src/api/eventorApi';
import { EVENT_RESULT_CACHE_TTL_MS, getCachedJson, setCachedJson } from '@/src/services/eventDataCache';
import { EventSplitTimesParseOptions, parseEventSplitTimesXml } from '@/src/services/eventSplitTimesParser';
import { PublishedListViewData, formatPublishedListXml } from '@/src/services/publishedListFormatter';
import { EventPublishedListScope } from '@/src/types/eventor';
import { EventSplitTimesSection } from '@/src/types/eventSplitTimes';

/**
 * Loaders that fetch, parse and cache the *parsed* (slimmed) result/analysis
 * data for an event.
 *
 * Why parsed and not raw XML: an O-ringen stage is ~36 MB of result XML and
 * ~90 MB with split times – far too large to keep as raw text on device. The
 * parsed structures the app actually renders are a small fraction of that, so
 * caching them both fits the on-disk budget and avoids re-parsing multi-MB XML
 * on every open. See {@link EVENT_RESULT_CACHE_TTL_MS} for the TTL.
 */

// Bump when the parse/format output shape or logic changes so previously cached
// (now stale) entries are ignored instead of served. e.g. v2 added per-result
// course length so multi-stage stages show banlängd/km-tid.
const PARSED_CACHE_VERSION = 'v2';

function normalizeEventId(eventId: string) {
  return eventId.split('::')[0] ?? eventId;
}

// The split-times XML (~2.7 KB/row) is held as a JS string + parsed tree and
// can exceed the device heap on large events, crashing with out-of-memory (e.g.
// O-ringen ~66 000). The safe limit depends on the device: Android has a hard
// per-app heap cap (256 MB, 512 MB with largeHeap), while iOS is more forgiving.
// We scale the limit by available RAM + platform so capable phones may load
// bigger events, and weak Android phones are protected. The very largest events
// stay blocked everywhere.
function getSplitTimesEntryLimit(): number {
  const totalBytes = Device.totalMemory ?? 0;
  const totalGb = Number.isFinite(totalBytes) ? totalBytes / (1024 * 1024 * 1024) : 0;

  if (Platform.OS === 'ios') {
    if (totalGb >= 6) return 60000;
    if (totalGb >= 4) return 45000;
    return 30000;
  }

  if (totalGb >= 6) return 40000;
  if (totalGb >= 4) return 25000;
  return 15000;
}

/** Best-effort event entry count (via competitorcount). Null on any failure so
 * the guard never blocks a load just because the count lookup failed. */
async function getEventEntryCount(eventId: string): Promise<number | null> {
  try {
    const normalizedId = normalizeEventId(eventId);
    const counts = await fetchBatchCompetitorCounts([normalizedId], null);
    const entry = counts[normalizedId] ?? Object.values(counts)[0];
    return entry ? entry.totalEntries : null;
  } catch {
    return null;
  }
}

/** Coarse loading phases reported to the UI for a staged progress indicator. */
export type EventDataLoadStage = 'fetching' | 'parsing';

export type EventDataLoadHooks = {
  /** Called when the loader moves to a new phase. */
  onStage?: (stage: EventDataLoadStage) => void;
  /** Called before each network attempt (attempt 1..n); >1 means a retry. */
  onAttempt?: (attempt: number) => void;
};

/**
 * Returns the parsed split-times sections for an event/stage, served from the
 * on-disk cache when available. Used by both the split-times and analysis
 * modals (which parse the same payload identically).
 */
export async function loadEventSplitTimesSections(
  eventId: string,
  eventRaceId: string | null,
  options: EventSplitTimesParseOptions = {},
  hooks: EventDataLoadHooks = {},
): Promise<EventSplitTimesSection[]> {
  const cacheKey = `splits-parsed:${PARSED_CACHE_VERSION}:${normalizeEventId(eventId)}:${eventRaceId ?? ''}`;

  const cached = await getCachedJson<EventSplitTimesSection[]>(cacheKey, EVENT_RESULT_CACHE_TTL_MS);
  if (cached) {
    return cached;
  }

  // Guard against out-of-memory on very large events: the split-times XML is
  // materialised as a big JS string and can exceed the device heap. The limit
  // scales with the device (RAM + platform); refuse politely instead of crashing.
  const entryCount = await getEventEntryCount(eventId);
  if (entryCount !== null && entryCount > getSplitTimesEntryLimit()) {
    throw new Error(
      `Den här tävlingen är för stor för att visa i appen (${entryCount.toLocaleString('sv-SE')} deltagare). Större tävlingar kräver mer minne än enheten klarar.`,
    );
  }

  hooks.onStage?.('fetching');
  const xml = await fetchEventSplitTimesXml(eventId, eventRaceId, { onAttempt: hooks.onAttempt });

  hooks.onStage?.('parsing');
  const sections = parseEventSplitTimesXml(xml, { selectedEventRaceId: eventRaceId, ...options });

  void setCachedJson(cacheKey, sections);

  return sections;
}

/**
 * Returns the formatted result-list view data for an event, served from the
 * on-disk cache when available.
 */
export async function loadFormattedResults(
  eventId: string,
  scope: EventPublishedListScope,
  organisationId: string | null,
  eventRaceId: string | null,
  hooks: EventDataLoadHooks = {},
): Promise<PublishedListViewData> {
  const cacheKey = `results-parsed:${PARSED_CACHE_VERSION}:${normalizeEventId(eventId)}:${scope}:${organisationId ?? ''}:${eventRaceId ?? ''}`;

  const cached = await getCachedJson<PublishedListViewData>(cacheKey, EVENT_RESULT_CACHE_TTL_MS);
  if (cached) {
    return cached;
  }

  hooks.onStage?.('fetching');
  const xml = await fetchEventPublishedListXml('results', scope, eventId, organisationId ?? undefined, eventRaceId, {
    onAttempt: hooks.onAttempt,
  });

  hooks.onStage?.('parsing');
  const formatted = formatPublishedListXml('results', xml, {
    eventClassNameById: {},
    organisationId,
    scope,
    selectedEventRaceId: eventRaceId,
  });

  void setCachedJson(cacheKey, formatted);

  return formatted;
}
