-- CreateTable
CREATE TABLE "Fixture" (
    "id" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'FOOTBALL',
    "kickoffAt" TIMESTAMPTZ(3) NOT NULL,
    "season" TEXT NOT NULL,
    "round" TEXT,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "externalId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fixture_externalId_key" ON "Fixture"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "fixture_unique" ON "Fixture"("homeTeam", "awayTeam", "season", "round");

-- CreateIndex
CREATE INDEX "Fixture_homeTeam_awayTeam_kickoffAt_idx" ON "Fixture"("homeTeam", "awayTeam", "kickoffAt");

-- CreateIndex
CREATE INDEX "Fixture_competition_kickoffAt_idx" ON "Fixture"("competition", "kickoffAt");

-- CreateIndex
CREATE INDEX "Fixture_kickoffAt_idx" ON "Fixture"("kickoffAt");

-- CreateIndex
CREATE INDEX "Fixture_status_kickoffAt_idx" ON "Fixture"("status", "kickoffAt");
