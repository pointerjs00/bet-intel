/*
  Warnings:

  - The values [EVENT_RESULT,ODDS_CHANGE] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `eventId` on the `BoletinItem` table. All the data in the column will be lost.
  - You are about to drop the column `siteId` on the `BoletinItem` table. All the data in the column will be lost.
  - You are about to drop the column `preferredSites` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `BettingSite` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Odd` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SportEvent` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `awayTeam` to the `BoletinItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `competition` to the `BoletinItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `homeTeam` to the `BoletinItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'BOLETIN_SHARED', 'BOLETIN_RESULT', 'SYSTEM');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "BoletinItem" DROP CONSTRAINT "BoletinItem_eventId_fkey";

-- DropForeignKey
ALTER TABLE "BoletinItem" DROP CONSTRAINT "BoletinItem_siteId_fkey";

-- DropForeignKey
ALTER TABLE "Odd" DROP CONSTRAINT "Odd_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Odd" DROP CONSTRAINT "Odd_siteId_fkey";

-- DropIndex
DROP INDEX "BoletinItem_eventId_idx";

-- AlterTable
ALTER TABLE "BoletinItem" DROP COLUMN "eventId",
DROP COLUMN "siteId",
ADD COLUMN     "awayTeam" TEXT NOT NULL,
ADD COLUMN     "competition" TEXT NOT NULL,
ADD COLUMN     "homeTeam" TEXT NOT NULL,
ADD COLUMN     "sport" "Sport" NOT NULL DEFAULT 'FOOTBALL';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "preferredSites";

-- DropTable
DROP TABLE "BettingSite";

-- DropTable
DROP TABLE "Odd";

-- DropTable
DROP TABLE "SportEvent";

-- DropEnum
DROP TYPE "EventStatus";

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "sport" "Sport" NOT NULL DEFAULT 'FOOTBALL',
    "tier" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" "Sport" NOT NULL DEFAULT 'FOOTBALL',
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamCompetition" (
    "teamId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,

    CONSTRAINT "TeamCompetition_pkey" PRIMARY KEY ("teamId","competitionId")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "sport" "Sport",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Competition_name_country_sport_key" ON "Competition"("name", "country", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_sport_key" ON "Team"("name", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "Market_name_key" ON "Market"("name");

-- AddForeignKey
ALTER TABLE "TeamCompetition" ADD CONSTRAINT "TeamCompetition_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCompetition" ADD CONSTRAINT "TeamCompetition_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
