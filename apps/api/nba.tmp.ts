import { fetchEspnNbaDay, fetchEspnNbaGame } from './src/services/sportsData/espnBasketball';
import { teamNamesMatch } from './src/services/marketResolutionEngine';
import { resolveBasketballMarket } from './src/services/basketballMarketEngine';
(async () => {
  for (const day of ['2026-11-10', '2026-11-11', '2026-11-12']) {
    const list = await fetchEspnNbaDay(day);
    const m = list.find((x) => (teamNamesMatch(x.home.name, 'Philadelphia 76ers') && teamNamesMatch(x.away.name, 'Boston Celtics')) || (teamNamesMatch(x.home.name, 'Boston Celtics') && teamNamesMatch(x.away.name, 'Philadelphia 76ers')));
    console.log(day, list.length, m ? `${m.providerMatchId} ${m.status} ${m.startAt} ${m.home.name} ${m.score?.home}-${m.score?.away} ${m.away.name}` : 'no match');
    if (m) {
      const g = await fetchEspnNbaGame(m.providerMatchId);
      console.log('detail', g?.status, g?.score, g?.periods?.length);
      if (g?.score) console.log('resolve', resolveBasketballMarket('Resultado handicap', 'Philadelphia 76ers -1,5', { ...g.score, periods: g.periods, players: g.players ?? null }, { home: g.home.name, away: g.away.name }));
    }
  }
})();
