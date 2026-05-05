-- Add FixtureWatch table for user fixture alert subscriptions
CREATE TABLE IF NOT EXISTS "FixtureWatch" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "fixtureId"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FixtureWatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FixtureWatch"
  ADD CONSTRAINT "FixtureWatch_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FixtureWatch"
  ADD CONSTRAINT "FixtureWatch_fixtureId_fkey"
  FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "FixtureWatch_userId_fixtureId_key" ON "FixtureWatch"("userId", "fixtureId");
CREATE INDEX IF NOT EXISTS "FixtureWatch_userId_idx" ON "FixtureWatch"("userId");
CREATE INDEX IF NOT EXISTS "FixtureWatch_fixtureId_idx" ON "FixtureWatch"("fixtureId");

-- Add MATCH_STARTING to NotificationType enum (if not already present)
DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_STARTING';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
