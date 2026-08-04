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
