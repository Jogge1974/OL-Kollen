// Klubbaktiviteter are fetched from Eventor's official /api/activities endpoint.
// (Scraping the public web pages was tried for a while so any club could see its
// activities, but Eventor put those pages behind a Cloudflare bot-check that
// blocks plain HTTP requests, so we're back to the API — which only works for
// the org the shared API key belongs to, see ACTIVITIES_API_ORG_ID.)

export type ActivityAttributeType = 'CheckBoxes' | 'RadioButtons' | 'SingleSelectList' | 'Text';

export type ActivityAttributeDefinition = {
  id: string;
  name: string;
  order: number;
  type: ActivityAttributeType;
  values: string[];
};

export type ActivityRegistrationAttribute = {
  attributeId: string;
  attributeName: string;
  value: string;
};

export type ActivityRegistration = {
  attributes: ActivityRegistrationAttribute[];
  clubName: string | null;
  modifyDate: string | null;
  organisationId: string | null;
  personId: string;
  personName: string | null;
};

export type ClubActivity = {
  attributes: ActivityAttributeDefinition[];
  id: string;
  informationHtml: string | null;
  informationText: string | null;
  name: string;
  registrationCount: number;
  registrationDeadline: string | null;
  registrations: ActivityRegistration[];
  startTime: string | null;
  url: string;
  visibleFrom: string | null;
  visibleTo: string | null;
};

