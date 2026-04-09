export type PersonActivitySection = {
  classificationId: number;
  eventDate: string;
  eventId: string;
  meta: string | null;
  rows: PersonActivityRow[];
  title: string;
};

export type PersonActivityRow = {
  bibNumber?: string;
  classLabel: string;
  classEntriesCount?: number | null;
  courseLengthLabel?: string;
  diff?: string;
  eventDate: string;
  eventId: string;
  eventName: string;
  favouriteId?: string;
  organisation: string;
  organisationId?: string;
  personId?: string | null;
  pace?: string;
  position?: string;
  sortKey: number;
  startTime?: string;
  status?: string;
  time?: string;
};

export type PersonResultsFilter = 'district' | 'national';
