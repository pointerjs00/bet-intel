-- AddForeignKey
ALTER TABLE "BoletinItem" ADD CONSTRAINT "BoletinItem_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "BettingSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
