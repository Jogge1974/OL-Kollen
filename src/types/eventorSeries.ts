export type SeriesItem = {
  id: string;
  name: string;
  url: string;
  // Raw date range as shown on Eventor, e.g. "2026-01-01 - 2026-12-31".
  dateRange: string;
  startDate: string | null;
  endDate: string | null;
  startYear: number | null;
  endYear: number | null;
  subCompetitionCount: number;
  countedSubCompetitionCount: number;
};

export type OrganisationSeries = {
  organisationId: number;
  organisationName: string;
  type: string | null;
  series: SeriesItem[];
};

export type OrganisationTreeNode = {
  id: number;
  name: string;
  shortName: string | null;
  type: string | null;
  parentOrganisationId: number | null;
};

export type OrganisationTree = {
  organisation: OrganisationTreeNode;
  ancestors: OrganisationTreeNode[];
};

export type SeriesScoreMode = 'points' | 'time';

export type SeriesStandingRow = {
  place: string;
  name: string;
  club: string;
  total: string;
  scores: string[];
};

// A single sub-competition column in a class standings table.
export type SeriesColumn = {
  label: string; // short date, e.g. "18/4"
  title: string; // tooltip: event, organiser, discipline
};

export type SeriesClassStanding = {
  className: string;
  columns: SeriesColumn[];
  rows: SeriesStandingRow[];
};

export type SeriesSubCompetition = {
  date: string;
  name: string;
  eventId: string | null;
  eventUrl: string | null;
  organiser: string;
  discipline: string;
};

export type SeriesDetail = {
  id: string;
  name: string;
  statusText: string | null;
  isComplete: boolean;
  info: string | null;
  chaseStartAvailable: boolean;
  classes: SeriesClassStanding[];
  subCompetitions: SeriesSubCompetition[];
};
