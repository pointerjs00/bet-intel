-- Add half-time scores to Fixture
ALTER TABLE "Fixture" ADD COLUMN "htHomeScore" INTEGER;
ALTER TABLE "Fixture" ADD COLUMN "htAwayScore" INTEGER;

-- Create TeamStat table
CREATE TABLE "TeamStat" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "played" INTEGER NOT NULL DEFAULT 0,
    "won" INTEGER NOT NULL DEFAULT 0,
    "drawn" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "goalsFor" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER,
    "homeWon" INTEGER NOT NULL DEFAULT 0,
    "homeDrawn" INTEGER NOT NULL DEFAULT 0,
    "homeLost" INTEGER NOT NULL DEFAULT 0,
    "homeGoalsFor" INTEGER NOT NULL DEFAULT 0,
    "homeGoalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "awayWon" INTEGER NOT NULL DEFAULT 0,
    "awayDrawn" INTEGER NOT NULL DEFAULT 0,
    "awayLost" INTEGER NOT NULL DEFAULT 0,
    "awayGoalsFor" INTEGER NOT NULL DEFAULT 0,
    "awayGoalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "cleanSheets" INTEGER NOT NULL DEFAULT 0,
    "failedToScore" INTEGER NOT NULL DEFAULT 0,
    "bttsCount" INTEGER NOT NULL DEFAULT 0,
    "over25Count" INTEGER NOT NULL DEFAULT 0,
    "over15Count" INTEGER NOT NULL DEFAULT 0,
    "formLast5" TEXT,
    "htWon" INTEGER NOT NULL DEFAULT 0,
    "htDrawn" INTEGER NOT NULL DEFAULT 0,
    "htLost" INTEGER NOT NULL DEFAULT 0,
    "comebacks" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teamstat_unique" ON "TeamStat"("team", "competition", "season");
CREATE INDEX "TeamStat_competition_season_points_idx" ON "TeamStat"("competition", "season", "points");
