/*
  Warnings:

  - A unique constraint covering the columns `[boletinId,sharedWithId]` on the table `SharedBoletin` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `sharedWithId` to the `SharedBoletin` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SharedBoletin" ADD COLUMN     "sharedWithId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SharedBoletin_boletinId_sharedWithId_key" ON "SharedBoletin"("boletinId", "sharedWithId");

-- AddForeignKey
ALTER TABLE "SharedBoletin" ADD CONSTRAINT "SharedBoletin_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
