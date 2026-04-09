export type EventSplitTimesSection = {
  classEntriesCount?: number | null;
  classLabel: string;
  classLengthLabel?: string;
  rows: EventSplitTimesRow[];
};

export type EventSplitTimesRow = {
  bibNumber?: string;
  classEntriesCount?: number | null;
  classLabel: string;
  classLengthLabel?: string;
  familyName?: string;
  givenName?: string;
  organisation: string;
  organisationId?: string;
  position?: string;
  primary: string;
  splitCumulativeSeconds: number[];
  splitCount: number;
  status?: string;
  totalTimeLabel: string;
  totalTimeSeconds: number | null;
  totalPosition?: string;
};
