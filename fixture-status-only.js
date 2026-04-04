require('C:/Users/jbsou/Desktop/bet-intel/node_modules/dotenv').config({ path: 'C:/Users/jbsou/Desktop/bet-intel/apps/api/.env' });
const { PrismaClient } = require('C:/Users/jbsou/Desktop/bet-intel/node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const event = await prisma.sportEvent.findUnique({
    where: { id: 'cmnda5p4d008fkg9rm9okm7x9' },
    select: {
      id: true,
      apiFootballFixtureId: true,
      homeTeam: true,
      awayTeam: true,
      league: true,
      status: true,
      liveClock: true,
      homeScore: true,
      awayScore: true,
      eventDate: true,
      updatedAt: true
    }
  });
  console.log(JSON.stringify({
    id: event.id,
    fixtureId: event.apiFootballFixtureId,
    teams: `${event.homeTeam} vs ${event.awayTeam}`,
    league: event.league,
    status: event.status,
    liveClock: event.liveClock,
    score: [event.homeScore, event.awayScore],
    eventDate: event.eventDate.toISOString(),
    updatedAt: event.updatedAt.toISOString()
  }, null, 2));
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
