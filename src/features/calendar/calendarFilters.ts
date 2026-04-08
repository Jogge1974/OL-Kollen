import { formatApiDate, getRelativeDate } from '@/src/services/dateService';
import { EventFilterValues } from '@/src/types/eventor';
import { CalendarFilterTemplate } from '@/src/types/preferences';

export const CLASSIFICATION_OPTIONS = [
  { id: 1, label: 'Mästerskapstävling' },
  { id: 2, label: 'Nationell tävling' },
  { id: 3, label: 'Distriktstävling' },
  { id: 4, label: 'Närtävling' },
  { id: 5, label: 'Klubbtävling' },
  { id: 6, label: 'Internationell tävling' },
];

export const DEFAULT_CALENDAR_FILTER_TEMPLATE: CalendarFilterTemplate = {
  classificationIds: [1, 2],
  districtIds: [],
  fromOffsetDays: -2,
  toOffsetDays: 10,
};

export function createDefaultCalendarFilterTemplate(): CalendarFilterTemplate {
  return {
    classificationIds: [...DEFAULT_CALENDAR_FILTER_TEMPLATE.classificationIds],
    districtIds: [...DEFAULT_CALENDAR_FILTER_TEMPLATE.districtIds],
    fromOffsetDays: DEFAULT_CALENDAR_FILTER_TEMPLATE.fromOffsetDays,
    toOffsetDays: DEFAULT_CALENDAR_FILTER_TEMPLATE.toOffsetDays,
  };
}

export function resolveCalendarFilterTemplate(template: CalendarFilterTemplate, now = new Date()): EventFilterValues {
  return {
    classificationIds: [...template.classificationIds].sort((a, b) => a - b),
    districtIds: [...template.districtIds].sort((a, b) => a - b),
    fromDate: formatApiDate(getRelativeDate(now, template.fromOffsetDays)),
    toDate: formatApiDate(getRelativeDate(now, template.toOffsetDays)),
  };
}

export function createDefaultCalendarFilters(now = new Date(), template: CalendarFilterTemplate = DEFAULT_CALENDAR_FILTER_TEMPLATE): EventFilterValues {
  return resolveCalendarFilterTemplate(template, now);
}

export function describeCalendarFilterTemplate(template: CalendarFilterTemplate, districtLabelById: Record<number, string> = {}) {
  const dateLabel = `${formatOffsetLabel(template.fromOffsetDays)} till ${formatOffsetLabel(template.toOffsetDays)}`;
  const classificationLabel = template.classificationIds.length > 0 ? template.classificationIds.join(', ') : 'alla tävlingar';
  const districtLabel =
    template.districtIds.length === 0
      ? 'alla distrikt'
      : template.districtIds
          .map((districtId) => districtLabelById[districtId] ?? `Distrikt ${districtId}`)
          .join(', ');

  return [dateLabel, classificationLabel, districtLabel].filter(Boolean).join(' • ');
}

export function getClassificationLabel(id: number) {
  return CLASSIFICATION_OPTIONS.find((option) => option.id === id)?.label ?? `Typ ${id}`;
}

function formatOffsetLabel(offsetDays: number) {
  if (offsetDays === 0) {
    return 'Idag';
  }

  return offsetDays > 0 ? `+${offsetDays}` : `${offsetDays}`;
}
