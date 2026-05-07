-- Migration: add_insights_tables
-- Adds FixtureStats, FixtureEvent, FixtureLineup, FixturePrediction,
-- PlayerStat, Venue, Coach models for API-Football insight data.

-- ─── Venue ────────────────────────────────────────────────────────────────────

CREATE TABLE "Venue" (
    "id"        TEXT NOT NULL,
    "apiId"     INTEGER NOT NULL,
    "name"      TEXT NOT NULL,
    "city"      TEXT,
    "country"   TEXT,
    "address"   TEXT,
    "capacity"  INTEGER,
    "surface"   TEXT,
    "imageUrl"  TEXT,
    "syncedAt"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Venue_apiId_key" ON "Venue"("apiId");

-- ─── Coach ────────────────────────────────────────────────────────────────────

CREATE TABLE "Coach" (
    "id"          TEXT NOT NULL,
    "apiId"       INTEGER NOT NULL,
    "name"        TEXT NOT NULL,
    "firstName"   TEXT,
    "lastName"    TEXT,
    "nationality" TEXT,
    "birthDate"   TIMESTAMPTZ(3),
    "imageUrl"    TEXT,
    "teamId"      INTEGER,
    "teamName"    TEXT,
    "teamNormKey" TEXT,
    "syncedAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Coach_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Coach_apiId_key" ON "Coach"("apiId");
CREATE INDEX "Coach_teamNormKey_idx" ON "Coach"("teamNormKey");
CREATE INDEX "Coach_teamId_idx" ON "Coach"("teamId");

-- ─── FixtureStats ─────────────────────────────────────────────────────────────

CREATE TABLE "FixtureStats" (
    "id"                    TEXT NOT NULL,
    "fixtureId"             TEXT NOT NULL,
    "apiFootballFixtureId"  INTEGER,

    "homePossession"        DOUBLE PRECISION,
    "awayPossession"        DOUBLE PRECISION,

    "homeShotsTotal"        INTEGER,
    "awayShotsTotal"        INTEGER,
    "homeShotsOnTarget"     INTEGER,
    "awayShotsOnTarget"     INTEGER,
    "homeShotsBlocked"      INTEGER,
    "awayShotsBlocked"      INTEGER,

    "homeCorners"           INTEGER,
    "awayCorners"           INTEGER,

    "homeOffsides"          INTEGER,
    "awayOffsides"          INTEGER,

    "homeYellow"            INTEGER,
    "awayYellow"            INTEGER,
    "homeRed"               INTEGER,
    "awayRed"               INTEGER,

    "homeFouls"             INTEGER,
    "awayFouls"             INTEGER,

    "homeGkSaves"           INTEGER,
    "awayGkSaves"           INTEGER,

    "homePassesTotal"       INTEGER,
    "awayPassesTotal"       INTEGER,
    "homePassesAccurate"    INTEGER,
    "awayPassesAccurate"    INTEGER,
    "homePassPct"           DOUBLE PRECISION,
    "awayPassPct"           DOUBLE PRECISION,

    "homeXg"                DOUBLE PRECISION,
    "awayXg"                DOUBLE PRECISION,

    "syncedAt"              TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FixtureStats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixtureStats_fixtureId_key" ON "FixtureStats"("fixtureId");
CREATE UNIQUE INDEX "FixtureStats_apiFootballFixtureId_key" ON "FixtureStats"("apiFootballFixtureId");
CREATE INDEX "FixtureStats_apiFootballFixtureId_idx" ON "FixtureStats"("apiFootballFixtureId");

-- ─── FixtureEvent ─────────────────────────────────────────────────────────────

CREATE TABLE "FixtureEvent" (
    "id"                   TEXT NOT NULL,
    "fixtureId"            TEXT NOT NULL,
    "apiFootballFixtureId" INTEGER,

    "minute"               INTEGER NOT NULL,
    "extraMinute"          INTEGER,
    "teamId"               INTEGER,
    "teamName"             TEXT NOT NULL,
    "isHome"               BOOLEAN NOT NULL,

    "type"                 TEXT NOT NULL,
    "detail"               TEXT,
    "comments"             TEXT,

    "playerName"           TEXT,
    "playerApiId"          INTEGER,
    "assistName"           TEXT,
    "assistApiId"          INTEGER,

    "syncedAt"             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixtureEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FixtureEvent_fixtureId_idx" ON "FixtureEvent"("fixtureId");
CREATE INDEX "FixtureEvent_apiFootballFixtureId_idx" ON "FixtureEvent"("apiFootballFixtureId");

-- ─── FixtureLineup ────────────────────────────────────────────────────────────

CREATE TABLE "FixtureLineup" (
    "id"                   TEXT NOT NULL,
    "fixtureId"            TEXT NOT NULL,
    "apiFootballFixtureId" INTEGER,
    "teamId"               INTEGER NOT NULL,
    "teamName"             TEXT NOT NULL,
    "isHome"               BOOLEAN NOT NULL,
    "formation"            TEXT,
    "coachId"              INTEGER,
    "coachName"            TEXT,
    "startingXI"           JSONB NOT NULL,
    "substitutes"          JSONB NOT NULL,
    "syncedAt"             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FixtureLineup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixtureLineup_fixlineup_unique" ON "FixtureLineup"("fixtureId", "teamId");
CREATE INDEX "FixtureLineup_fixtureId_idx" ON "FixtureLineup"("fixtureId");
CREATE INDEX "FixtureLineup_apiFootballFixtureId_idx" ON "FixtureLineup"("apiFootballFixtureId");

-- ─── FixturePrediction ────────────────────────────────────────────────────────

CREATE TABLE "FixturePrediction" (
    "id"                   TEXT NOT NULL,
    "fixtureId"            TEXT NOT NULL,
    "apiFootballFixtureId" INTEGER,

    "winnerTeamId"         INTEGER,
    "winnerTeamName"       TEXT,
    "winnerComment"        TEXT,

    "winPctHome"           DOUBLE PRECISION,
    "winPctDraw"           DOUBLE PRECISION,
    "winPctAway"           DOUBLE PRECISION,

    "goalsHome"            DOUBLE PRECISION,
    "goalsAway"            DOUBLE PRECISION,

    "advice"               TEXT,
    "overUnder"            TEXT,
    "btts"                 BOOLEAN,

    "h2hHomeWins"          INTEGER,
    "h2hDraws"             INTEGER,
    "h2hAwayWins"          INTEGER,

    "syncedAt"             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FixturePrediction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixturePrediction_fixtureId_key" ON "FixturePrediction"("fixtureId");
CREATE UNIQUE INDEX "FixturePrediction_apiFootballFixtureId_key" ON "FixturePrediction"("apiFootballFixtureId");
CREATE INDEX "FixturePrediction_apiFootballFixtureId_idx" ON "FixturePrediction"("apiFootballFixtureId");

-- ─── PlayerStat ───────────────────────────────────────────────────────────────

CREATE TABLE "PlayerStat" (
    "id"             TEXT NOT NULL,
    "playerId"       INTEGER NOT NULL,
    "playerName"     TEXT NOT NULL,
    "playerNormKey"  TEXT NOT NULL,
    "playerImageUrl" TEXT,
    "nationality"    TEXT,
    "age"            INTEGER,
    "height"         TEXT,
    "weight"         TEXT,
    "position"       TEXT,
    "number"         INTEGER,

    "teamId"         INTEGER NOT NULL,
    "teamName"       TEXT NOT NULL,
    "teamNormKey"    TEXT NOT NULL,
    "leagueId"       INTEGER NOT NULL,
    "leagueName"     TEXT NOT NULL,
    "season"         TEXT NOT NULL,

    "appearances"    INTEGER NOT NULL DEFAULT 0,
    "minutesPlayed"  INTEGER NOT NULL DEFAULT 0,
    "goals"          INTEGER NOT NULL DEFAULT 0,
    "assists"        INTEGER NOT NULL DEFAULT 0,
    "shots"          INTEGER NOT NULL DEFAULT 0,
    "shotsOnTarget"  INTEGER NOT NULL DEFAULT 0,
    "dribbles"       INTEGER NOT NULL DEFAULT 0,
    "dribblesWon"    INTEGER NOT NULL DEFAULT 0,
    "keyPasses"      INTEGER NOT NULL DEFAULT 0,
    "passAccuracy"   DOUBLE PRECISION,
    "tackles"        INTEGER NOT NULL DEFAULT 0,
    "interceptions"  INTEGER NOT NULL DEFAULT 0,
    "yellowCards"    INTEGER NOT NULL DEFAULT 0,
    "yellowRed"      INTEGER NOT NULL DEFAULT 0,
    "redCards"       INTEGER NOT NULL DEFAULT 0,
    "rating"         DOUBLE PRECISION,

    "syncedAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlayerStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerStat_playerstat_unique" ON "PlayerStat"("playerId", "leagueId", "season", "teamId");
CREATE INDEX "PlayerStat_teamNormKey_leagueId_season_idx" ON "PlayerStat"("teamNormKey", "leagueId", "season");
CREATE INDEX "PlayerStat_leagueId_season_goals_idx" ON "PlayerStat"("leagueId", "season", "goals");
CREATE INDEX "PlayerStat_playerId_idx" ON "PlayerStat"("playerId");
