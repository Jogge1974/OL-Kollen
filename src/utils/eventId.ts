export function normalizeEventId(eventId: string) {
  return eventId.split('::')[0] ?? eventId;
}
