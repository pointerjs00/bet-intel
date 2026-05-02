// apps/api/src/utils/runJob.ts

import { prisma } from '../prisma';

interface JobResult {
  recordsProcessed?:  number;
  recordsUpserted?:   number;
  apiCallsMade?:      number;
  apiCallsRemaining?: number;
  details?:           Record<string, string | number | boolean | null>;
}

export async function runJob(
  name: string,
  fn: () => Promise<JobResult>
): Promise<void> {
  const log = await prisma.dataSyncLog.create({
    data: { jobName: name, status: 'started' },
  });
  const startedAt = Date.now();
  try {
    const result = await fn();
    await prisma.dataSyncLog.update({
      where: { id: log.id },
      data: {
        status: 'completed',
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
        ...result,
      },
    });
  } catch (err: any) {
    await prisma.dataSyncLog.update({
      where: { id: log.id },
      data: {
        status: 'failed',
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
        error: err?.message ?? String(err),
      },
    });
    throw err;
  }
}
