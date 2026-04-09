export type EventSplitTimesSection = {
  classEntriesCount?: number | null;
  classLabel: string;
  classLengthLabel?: string;
  classLengthMeters?: number | null;
  classificationId?: number;
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
  personId?: string;
  position?: string;
  primary: string;
  referencePercent?: number;
  splitCumulativeSeconds: number[];
  splitCount: number;
  splitLossSeconds: Array<number | null>;
  status?: string;
  totalTimeLabel: string;
  totalTimeSeconds: number | null;
  totalLossSeconds: number | null;
  totalPosition?: string;
};
