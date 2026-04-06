-- CreateEnum
CREATE TYPE "FavouriteType" AS ENUM ('COMPETITION', 'COUNTRY', 'TEAM');

-- CreateTable
CREATE TABLE "UserFavourite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "FavouriteType" NOT NULL,
    "sport" "Sport" NOT NULL,
    "targetKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFavourite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFavourite_userId_sport_idx" ON "UserFavourite"("userId", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavourite_userId_type_sport_targetKey_key" ON "UserFavourite"("userId", "type", "sport", "targetKey");

-- AddForeignKey
ALTER TABLE "UserFavourite" ADD CONSTRAINT "UserFavourite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
