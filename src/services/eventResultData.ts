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

/**
 * Returns the parsed split-times sections for an event/stage, served from the
 * on-disk cache when available. Used by both the split-times and analysis
 * modals (which parse the same payload identically).
 */
export async function loadEventSplitTimesSections(
  eventId: string,
  eventRaceId: string | null,
  options: EventSplitTimesParseOptions = {},
): Promise<EventSplitTimesSection[]> {
  const cacheKey = `splits-parsed:${normalizeEventId(eventId)}:${eventRaceId ?? ''}`;

  const cached = await getCachedJson<EventSplitTimesSection[]>(cacheKey, EVENT_RESULT_CACHE_TTL_MS);
  if (cached) {
    return cached;
  }

  const xml = await fetchEventSplitTimesXml(eventId, eventRaceId);
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
): Promise<PublishedListViewData> {
  const cacheKey = `results-parsed:${normalizeEventId(eventId)}:${scope}:${organisationId ?? ''}:${eventRaceId ?? ''}`;

  const cached = await getCachedJson<PublishedListViewData>(cacheKey, EVENT_RESULT_CACHE_TTL_MS);
  if (cached) {
    return cached;
  }

  const xml = await fetchEventPublishedListXml('results', scope, eventId, organisationId ?? undefined, eventRaceId);
  const formatted = formatPublishedListXml('results', xml, {
    eventClassNameById: {},
    organisationId,
    scope,
    selectedEventRaceId: eventRaceId,
  });

  void setCachedJson(cacheKey, formatted);

  return formatted;
}
