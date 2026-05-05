import * as React from 'react';

import { fetchPersonResultsXml } from '@/src/api/eventorApi';
import { parsePersonResultsXml } from '@/src/services/personEventorListParser';
import { PersonActivityRow, PersonActivitySection } from '@/src/types/personLists';

export type HeadToHeadMatch = {
  date: string;
  eventId: string;
  eventName: string;
  friendClass: string;
  friendPosition: number | null;
  friendTime: string | null;
  myClass: string;
  myPosition: number | null;
  myTime: string | null;
  winner: 'friend' | 'me' | 'tie' | null;
};

export type HeadToHeadStats = {
  avgFriendPosition: number | null;
  avgMyPosition: number | null;
  friendWins: number;
  isLoading: boolean;
  matches: HeadToHeadMatch[];
  myWins: number;
  sharedEvents: number;
  ties: number;
};

function formatYearStart(year: number) {
  return `${year}-01-01 00:00:00`;
}

function formatYearEnd(year: number) {
  return `${year}-12-31 23:59:59`;
}

function getPosition(row: PersonActivityRow): number | null {
  const pos = Number(row.position);
  return pos > 0 ? pos : null;
}

function buildEventMap(sections: PersonActivitySection[]): Map<string, PersonActivityRow> {
  const map = new Map<string, PersonActivityRow>();
  for (const section of sections) {
    // Use first row per event (typically the main result)
    if (!map.has(section.eventId) && section.rows.length > 0) {
      map.set(section.eventId, section.rows[0]);
    }
  }
  return map;
}

export function useHeadToHead(myPersonId: string | null, friendPersonId: string | null): HeadToHeadStats {
  const [isLoading, setIsLoading] = React.useState(false);
  const [matches, setMatches] = React.useState<HeadToHeadMatch[]>([]);

  React.useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!myPersonId || !friendPersonId || myPersonId === friendPersonId) {
        setMatches([]);
        return;
      }

      setIsLoading(true);

      try {
        const year = new Date().getFullYear();
        const fromDate = formatYearStart(year);
        const toDate = formatYearEnd(year);

        const [myXml, friendXml] = await Promise.all([
          fetchPersonResultsXml(myPersonId, fromDate, toDate),
          fetchPersonResultsXml(friendPersonId, fromDate, toDate),
        ]);

        if (!isMounted) return;

        const mySections = parsePersonResultsXml(myXml);
        const friendSections = parsePersonResultsXml(friendXml);

        const myMap = buildEventMap(mySections);
        const friendMap = buildEventMap(friendSections);

        const shared: HeadToHeadMatch[] = [];

        for (const [eventId, myRow] of myMap) {
          const friendRow = friendMap.get(eventId);
          if (!friendRow) continue;
          if (myRow.classLabel !== friendRow.classLabel) continue;

          const myPos = getPosition(myRow);
          const friendPos = getPosition(friendRow);

          let winner: HeadToHeadMatch['winner'] = null;
          if (myPos && friendPos) {
            winner = myPos < friendPos ? 'me' : friendPos < myPos ? 'friend' : 'tie';
          }

          shared.push({
            date: myRow.eventDate,
            eventId,
            eventName: myRow.eventName,
            friendClass: friendRow.classLabel,
            friendPosition: friendPos,
            friendTime: friendRow.time ?? null,
            myClass: myRow.classLabel,
            myPosition: myPos,
            myTime: myRow.time ?? null,
            winner,
          });
        }

        shared.sort((a, b) => b.date.localeCompare(a.date));

        if (isMounted) {
          setMatches(shared);
        }
      } catch {
        if (isMounted) {
          setMatches([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => { isMounted = false; };
  }, [myPersonId, friendPersonId]);

  return React.useMemo(() => {
    const myWins = matches.filter((m) => m.winner === 'me').length;
    const friendWins = matches.filter((m) => m.winner === 'friend').length;
    const ties = matches.filter((m) => m.winner === 'tie').length;

    const myPositions = matches.map((m) => m.myPosition).filter((p): p is number => p !== null);
    const friendPositions = matches.map((m) => m.friendPosition).filter((p): p is number => p !== null);

    const avgMyPosition = myPositions.length > 0
      ? Math.round((myPositions.reduce((a, b) => a + b, 0) / myPositions.length) * 10) / 10
      : null;
    const avgFriendPosition = friendPositions.length > 0
      ? Math.round((friendPositions.reduce((a, b) => a + b, 0) / friendPositions.length) * 10) / 10
      : null;

    return {
      avgFriendPosition,
      avgMyPosition,
      friendWins,
      isLoading,
      matches,
      myWins,
      sharedEvents: matches.length,
      ties,
    };
  }, [matches, isLoading]);
}
