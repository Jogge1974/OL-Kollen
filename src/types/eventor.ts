export type EventFilterValues = {
  classificationIds: number[];
  fromDate: string;
  toDate: string;
};

export type EventItem = {
  classificationId: number;
  classificationLabel: string;
  dateLabel: string;
  disciplineId: number;
  disciplineLabel: string;
  distanceLabel: string;
  hasPublishedResults: boolean;
  hasPublishedStarts: boolean;
  id: string;
  message: string | null;
  name: string;
  organiserIds: string[];
  startClock: string | null;
  startDate: string;
  statusId: number;
  statusLabel: string;
};

export type EventDetail = EventItem & {
  comment: string | null;
  finishDate: string | null;
  hasPublishedResults: boolean;
  hasPublishedStarts: boolean;
  modifyDate: string | null;
  organiserNames: string[];
  webUrl: string | null;
};

export type EventDocument = {
  id: string;
  modifyDate: string | null;
  name: string;
  referenceId: string | null;
  type: string | null;
  url: string;
};

export type EventPublishedListKind = 'entries' | 'results' | 'starts';

export type EventPublishedListScope = 'organisation' | 'public';
