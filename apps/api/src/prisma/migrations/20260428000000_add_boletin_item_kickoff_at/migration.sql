-- AlterTable
ALTER TABLE "BoletinItem" ADD COLUMN "kickoffAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "BoletinItem_kickoffAt_idx" ON "BoletinItem"("kickoffAt");
