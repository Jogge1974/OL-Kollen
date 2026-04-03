import { formatApiDate, getRelativeDate } from '@/src/services/dateService';
import { EventFilterValues } from '@/src/types/eventor';

export const CLASSIFICATION_OPTIONS = [
  { id: 1, label: 'Mästerskapstävling' },
  { id: 2, label: 'Nationell tävling' },
  { id: 3, label: 'Distriktstävling' },
  { id: 4, label: 'Närtävling' },
  { id: 5, label: 'Klubbtävling' },
  { id: 6, label: 'Internationell tävling' },
];

export function createDefaultCalendarFilters(now = new Date()): EventFilterValues {
  return {
    classificationIds: [1, 2],
    fromDate: formatApiDate(getRelativeDate(now, -2)),
    toDate: formatApiDate(getRelativeDate(now, 10)),
  };
}

export function getClassificationLabel(id: number) {
  return CLASSIFICATION_OPTIONS.find((option) => option.id === id)?.label ?? `Typ ${id}`;
}
