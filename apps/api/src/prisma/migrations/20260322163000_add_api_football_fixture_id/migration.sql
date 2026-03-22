-- AlterTable
ALTER TABLE "SportEvent" ADD COLUMN     "apiFootballFixtureId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "SportEvent_apiFootballFixtureId_key" ON "SportEvent"("apiFootballFixtureId");
