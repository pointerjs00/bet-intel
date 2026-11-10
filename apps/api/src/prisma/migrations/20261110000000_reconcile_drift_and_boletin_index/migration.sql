-- Reconciles production with schema.prisma (plan #24). Generated from
-- `prisma migrate diff --from-url <prod> --to-schema-datamodel` on 10/11/2026,
-- keeping only non-destructive statements. The legacy Boletin.visibility /
-- User.defaultBoletinVisibility columns are intentionally left untouched here.

-- CreateEnum (declared in the schema, never created in the database)
DO $$ BEGIN
  CREATE TYPE "FixtureNotifPref" AS ENUM ('GOALS', 'HALF_TIME', 'MATCH_END', 'RED_CARD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Timestamp precision aligned with Prisma's default TIMESTAMP(3)
ALTER TABLE "Coach" ALTER COLUMN "birthDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "syncedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "FixtureEvent" ALTER COLUMN "syncedAt" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "FixtureLineup" ALTER COLUMN "syncedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "FixturePrediction" ALTER COLUMN "syncedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "FixtureStats" ALTER COLUMN "syncedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "PlayerStat" ALTER COLUMN "syncedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "Venue" ALTER COLUMN "syncedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- Index names aligned with Prisma's naming
ALTER INDEX "FixtureLineup_fixlineup_unique" RENAME TO "FixtureLineup_fixtureId_teamId_key";
ALTER INDEX "PlayerStat_playerstat_unique" RENAME TO "PlayerStat_playerId_leagueId_season_teamId_key";

-- Plan #24: boletin list ordered by date per user
CREATE INDEX IF NOT EXISTS "Boletin_userId_createdAt_idx" ON "Boletin"("userId", "createdAt");
