export type RankingClassDefinition = {
  className: string;
  classNumber: number;
  maxBirthYear: number;
  minBirthYear: number;
};

export function getRankingClassDefinition(gender: 'D' | 'H', birthYear: number, rankingYear: number): RankingClassDefinition {
  const age = rankingYear - birthYear;

  if (age <= 10) {
    return createJuniorClass(gender, 10, rankingYear);
  }

  if (age <= 12) {
    return createJuniorClass(gender, 12, rankingYear);
  }

  if (age <= 14) {
    return createJuniorClass(gender, 14, rankingYear);
  }

  if (age <= 16) {
    return createJuniorClass(gender, 16, rankingYear);
  }

  if (age <= 18) {
    return createJuniorClass(gender, 18, rankingYear);
  }

  if (age <= 20) {
    return createJuniorClass(gender, 20, rankingYear);
  }

  if (age <= 34) {
    return {
      className: `${gender}21`,
      classNumber: 21,
      maxBirthYear: rankingYear - 21,
      minBirthYear: rankingYear - 34,
    };
  }

  const classNumber = Math.min(95, Math.floor(age / 5) * 5);

  if (classNumber >= 95) {
    return {
      className: `${gender}95`,
      classNumber: 95,
      maxBirthYear: rankingYear - 95,
      minBirthYear: 0,
    };
  }

  return {
    className: `${gender}${classNumber}`,
    classNumber,
    maxBirthYear: rankingYear - classNumber,
    minBirthYear: rankingYear - (classNumber + 4),
  };
}

function createJuniorClass(gender: 'D' | 'H', classNumber: number, rankingYear: number): RankingClassDefinition {
  return {
    className: `${gender}${classNumber}`,
    classNumber,
    maxBirthYear: rankingYear - (classNumber - 1),
    minBirthYear: rankingYear - classNumber,
  };
}
