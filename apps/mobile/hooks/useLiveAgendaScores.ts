import { useEffect, useState } from 'react';
import { addSocketListener, subscribeToLive, type LiveScorePayload } from '../services/socketService';

export interface LiveScore {
  homeGoals: number;
  awayGoals: number;
  elapsed: number | null;
  statusShort: string;
}

// Key: "HomeTeam|||AwayTeam" (lowercased) → LiveScore
type ScoreMap = Record<string, LiveScore>;

function makeKey(homeTeam: string, awayTeam: string): string {
  return `${homeTeam.toLowerCase()}|||${awayTeam.toLowerCase()}`;
}

export function useLiveAgendaScores(): ScoreMap {
  const [scores, setScores] = useState<ScoreMap>({});

  useEffect(() => {
    subscribeToLive();

    const unsubscribe = addSocketListener('fixture:score', (payload: LiveScorePayload) => {
      const key = makeKey(payload.homeTeam, payload.awayTeam);
      setScores(prev => ({
        ...prev,
        [key]: {
          homeGoals:   payload.homeGoals,
          awayGoals:   payload.awayGoals,
          elapsed:     payload.elapsed,
          statusShort: payload.statusShort,
        },
      }));
    });

    return unsubscribe;
  }, []);

  return scores;
}

export { makeKey as makeLiveScoreKey };
