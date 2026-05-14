export type EventFilterValues = {
  classificationIds: number[];
  districtIds: number[];
  fromDate: string;
  showEntryCountsInList: boolean;
  toDate: string;
};

export type EventItem = {
  centerPosition: {
    latitude: number;
    longitude: number;
  } | null;
  classificationId: number;
  classificationLabel: string;
  dateLabel: string;
  disciplineId: number;
  disciplineLabel: string;
  distanceLabel: string;
  eventForm: string;
  eventRaceDate: string;
  eventRaceId: string;
  eventRaceName: string;
  hasPublishedResults: boolean;
  hasPublishedStarts: boolean;
  id: string;
  message: string | null;
  name: string;
  multiStage: boolean;
  organiserNames: string[];
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
  liveloxEventId: string | null;
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

export type EventCompetitorCount = {
  organisationEntries: number | null;
  organisationStarts: number | null;
  totalEntries: number | null;
  totalStarts: number | null;
};

export type EventPublishedListKind = 'entries' | 'results' | 'starts';

export type EventPublishedListScope = 'organisation' | 'public';

export type DistrictOption = {
  id: number;
  label: string;
};
