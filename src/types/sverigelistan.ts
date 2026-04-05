export type SverigelistanRow = {
  BirthYear: number | null;
  Club: string;
  ClubId: number | null;
  Gender: string;
  Name: string;
  PageIndex: number;
  Points: number;
  Rank: number;
  RunnerId: number | null;
  Updated: string;
};

export type SverigelistanTrendPoint = {
  className?: string | null;
  label: string;
  rank: number | null;
  updated: string | null;
};

export type SverigelistanTrendDirection = 'better' | 'same' | 'worse' | 'unknown';
