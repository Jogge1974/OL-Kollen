import { fetchEventPublishedListXml, fetchEventSplitTimesXml } from '@/src/api/eventorApi';
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

function normalizeEventId(eventId: string) {
  return eventId.split('::')[0] ?? eventId;
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
  const cacheKey = `splits-parsed:${normalizeEventId(eventId)}:${eventRaceId ?? ''}`;

  const cached = await getCachedJson<EventSplitTimesSection[]>(cacheKey, EVENT_RESULT_CACHE_TTL_MS);
  if (cached) {
    return cached;
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
  const cacheKey = `results-parsed:${normalizeEventId(eventId)}:${scope}:${organisationId ?? ''}:${eventRaceId ?? ''}`;

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
