-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "awayTeamNormKey" TEXT,
ADD COLUMN     "homeTeamNormKey" TEXT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TeamStat" ADD COLUMN     "avgCornersAgainst" DOUBLE PRECISION,
ADD COLUMN     "avgCornersFor" DOUBLE PRECISION,
ADD COLUMN     "avgGoalsConceded" DOUBLE PRECISION,
ADD COLUMN     "avgGoalsScored" DOUBLE PRECISION,
ADD COLUMN     "avgShotsAgainst" DOUBLE PRECISION,
ADD COLUMN     "avgShotsFor" DOUBLE PRECISION,
ADD COLUMN     "avgYellowCards" DOUBLE PRECISION,
ADD COLUMN     "bttsPct" DOUBLE PRECISION,
ADD COLUMN     "cleanSheetPct" DOUBLE PRECISION,
ADD COLUMN     "failedToScorePct" DOUBLE PRECISION,
ADD COLUMN     "over15Pct" DOUBLE PRECISION,
ADD COLUMN     "over25Pct" DOUBLE PRECISION,
ADD COLUMN     "over35Pct" DOUBLE PRECISION,
ADD COLUMN     "standingsSource" TEXT,
ADD COLUMN     "statsSource" TEXT,
ADD COLUMN     "teamName" TEXT,
ADD COLUMN     "teamNormKey" TEXT;

-- CreateTable
CREATE TABLE "MatchStat" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "homeTeamNormKey" TEXT NOT NULL,
    "awayTeamNormKey" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "htHomeScore" INTEGER,
    "htAwayScore" INTEGER,
    "homeShotsTotal" INTEGER,
    "awayShotsTotal" INTEGER,
    "homeShotsOnTarget" INTEGER,
    "awayShotsOnTarget" INTEGER,
    "homeCorners" INTEGER,
    "awayCorners" INTEGER,
    "homeYellow" INTEGER,
    "awayYellow" INTEGER,
    "homeRed" INTEGER,
    "awayRed" INTEGER,
    "homeFouls" INTEGER,
    "awayFouls" INTEGER,
    "homeOffsides" INTEGER,
    "awayOffsides" INTEGER,
    "b365HomeWin" DOUBLE PRECISION,
    "b365Draw" DOUBLE PRECISION,
    "b365AwayWin" DOUBLE PRECISION,
    "b365Over25" DOUBLE PRECISION,
    "b365Under25" DOUBLE PRECISION,
    "pinnacleHomeWin" DOUBLE PRECISION,
    "pinnacleDraw" DOUBLE PRECISION,
    "pinnacleAwayWin" DOUBLE PRECISION,
    "pinnacleOver25" DOUBLE PRECISION,
    "pinnacleUnder25" DOUBLE PRECISION,
    "avgOddsHome" DOUBLE PRECISION,
    "avgOddsDraw" DOUBLE PRECISION,
    "avgOddsAway" DOUBLE PRECISION,
    "avgOddsOver25" DOUBLE PRECISION,
    "avgOddsUnder25" DOUBLE PRECISION,
    "maxOddsHome" DOUBLE PRECISION,
    "maxOddsDraw" DOUBLE PRECISION,
    "maxOddsAway" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'football-data.co.uk',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerAvailability" (
    "id" TEXT NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "leagueName" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "teamId" INTEGER,
    "teamName" TEXT NOT NULL,
    "teamNormKey" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "playerName" TEXT NOT NULL,
    "playerNormKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "returnFixtureId" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopScorer" (
    "id" TEXT NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "leagueName" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'goals',
    "rank" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "playerName" TEXT NOT NULL,
    "playerNormKey" TEXT NOT NULL,
    "playerImageUrl" TEXT,
    "nationality" TEXT,
    "age" INTEGER,
    "position" TEXT,
    "teamId" INTEGER NOT NULL,
    "teamName" TEXT NOT NULL,
    "teamNormKey" TEXT NOT NULL,
    "appearances" INTEGER,
    "goals" INTEGER NOT NULL,
    "assists" INTEGER,
    "yellowCards" INTEGER,
    "redCards" INTEGER,
    "minutesPlayed" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopScorer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSyncLog" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recordsProcessed" INTEGER,
    "recordsUpserted" INTEGER,
    "apiCallsMade" INTEGER,
    "apiCallsRemaining" INTEGER,
    "durationMs" INTEGER,
    "details" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DataSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchStat_competition_season_idx" ON "MatchStat"("competition", "season");

-- CreateIndex
CREATE INDEX "MatchStat_homeTeamNormKey_idx" ON "MatchStat"("homeTeamNormKey");

-- CreateIndex
CREATE INDEX "MatchStat_awayTeamNormKey_idx" ON "MatchStat"("awayTeamNormKey");

-- CreateIndex
CREATE INDEX "MatchStat_date_idx" ON "MatchStat"("date");

-- CreateIndex
CREATE INDEX "MatchStat_fixtureId_idx" ON "MatchStat"("fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchStat_homeTeamNormKey_awayTeamNormKey_date_key" ON "MatchStat"("homeTeamNormKey", "awayTeamNormKey", "date");

-- CreateIndex
CREATE INDEX "PlayerAvailability_teamNormKey_leagueId_season_idx" ON "PlayerAvailability"("teamNormKey", "leagueId", "season");

-- CreateIndex
CREATE INDEX "PlayerAvailability_leagueId_season_idx" ON "PlayerAvailability"("leagueId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerAvailability_playerId_leagueId_season_type_key" ON "PlayerAvailability"("playerId", "leagueId", "season", "type");

-- CreateIndex
CREATE INDEX "TopScorer_leagueId_season_type_idx" ON "TopScorer"("leagueId", "season", "type");

-- CreateIndex
CREATE INDEX "TopScorer_teamNormKey_idx" ON "TopScorer"("teamNormKey");

-- CreateIndex
CREATE UNIQUE INDEX "TopScorer_leagueId_season_type_playerId_key" ON "TopScorer"("leagueId", "season", "type", "playerId");

-- CreateIndex
CREATE INDEX "DataSyncLog_jobName_startedAt_idx" ON "DataSyncLog"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "DataSyncLog_status_idx" ON "DataSyncLog"("status");

-- CreateIndex
CREATE INDEX "Fixture_homeTeamNormKey_idx" ON "Fixture"("homeTeamNormKey");

-- CreateIndex
CREATE INDEX "Fixture_awayTeamNormKey_idx" ON "Fixture"("awayTeamNormKey");

-- CreateIndex
CREATE INDEX "TeamStat_teamNormKey_competition_season_idx" ON "TeamStat"("teamNormKey", "competition", "season");

-- RenameIndex
ALTER INDEX "fixture_unique" RENAME TO "Fixture_homeTeam_awayTeam_season_round_key";

-- RenameIndex
ALTER INDEX "teamstat_unique" RENAME TO "TeamStat_team_competition_season_key";
