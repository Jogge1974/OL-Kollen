export type EventSplitTimesSection = {
  classEntriesCount?: number | null;
  classLabel: string;
  classLengthLabel?: string;
  classLengthMeters?: number | null;
  classificationId?: number;
  controlCodes?: string[];
  rows: EventSplitTimesRow[];
};

export type EventSplitTimesRow = {
  bibNumber?: string;
  classEntriesCount?: number | null;
  classLabel: string;
  classLengthLabel?: string;
  familyName?: string;
  givenName?: string;
  eventRaceId?: string;
  organisation: string;
  organisationId?: string;
  personId?: string;
  raceNumber?: string;
  position?: string;
  primary: string;
  referencePercent?: number;
  splitCumulativeSeconds: number[];
  splitControlCodes?: string[];
  splitCount: number;
  splitLossSeconds: Array<number | null>;
  status?: string;
  totalTimeLabel: string;
  totalTimeSeconds: number | null;
  totalLossSeconds: number | null;
  totalPosition?: string;
};
