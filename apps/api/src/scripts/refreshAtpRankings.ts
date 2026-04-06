import 'dotenv/config';
import { processATPRankingsUpdate } from '../jobs/atpRankingsJob';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';

async function run(): Promise<void> {
  await redis.connect().catch(() => undefined);
  const result = await processATPRankingsUpdate();
  console.log(JSON.stringify(result, null, 2));
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (redis.status === 'ready' || redis.status === 'connect') {
      await redis.quit();
    }
  });
