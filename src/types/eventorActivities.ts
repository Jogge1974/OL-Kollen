// Klubbaktiviteter are scraped from Eventor's web pages (the API is org-locked),
// so the shapes below mirror what the HTML exposes rather than the XML API.

export type ActivityRegistrationAttribute = {
  attributeName: string;
  values: string[];
};

export type ActivityRegistration = {
  attributes: ActivityRegistrationAttribute[];
  clubName: string | null;
  personName: string;
};

export type ActivityDocument = {
  name: string;
  url: string;
};

export type ActivityInfoSegment = {
  text: string;
  url?: string;
};

export type ClubActivity = {
  attributeNames: string[];
  documents: ActivityDocument[];
  id: string;
  informationSegments: ActivityInfoSegment[];
  name: string;
  organiser: string | null;
  registrationCount: number;
  registrationDeadline: string | null;
  registrationDeadlineIso: string | null;
  registrations: ActivityRegistration[];
  startTime: string | null;
  url: string;
};

export type ActivitySections = {
  club: ClubActivity[];
  clubName: string | null;
  district: ClubActivity[];
  districtName: string | null;
  soft: ClubActivity[];
};
