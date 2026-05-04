/*
  Warnings:

  - A unique constraint covering the columns `[apiFootballId]` on the table `Fixture` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "apiFootballId" INTEGER,
ADD COLUMN     "awayTeamApiId" INTEGER,
ADD COLUMN     "elapsedMinutes" INTEGER,
ADD COLUMN     "homeTeamApiId" INTEGER,
ADD COLUMN     "refereeName" TEXT,
ADD COLUMN     "venueId" INTEGER,
ADD COLUMN     "venueName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Fixture_apiFootballId_key" ON "Fixture"("apiFootballId");
