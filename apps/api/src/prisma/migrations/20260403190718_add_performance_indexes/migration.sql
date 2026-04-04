-- CreateIndex
CREATE INDEX "Boletin_userId_status_idx" ON "Boletin"("userId", "status");

-- CreateIndex
CREATE INDEX "BoletinItem_eventId_idx" ON "BoletinItem"("eventId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Odd_siteId_eventId_idx" ON "Odd"("siteId", "eventId");

-- CreateIndex
CREATE INDEX "Odd_eventId_isActive_idx" ON "Odd"("eventId", "isActive");

-- CreateIndex
CREATE INDEX "Odd_siteId_eventId_market_selection_idx" ON "Odd"("siteId", "eventId", "market", "selection");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "SportEvent_status_eventDate_idx" ON "SportEvent"("status", "eventDate");

-- CreateIndex
CREATE INDEX "SportEvent_sport_league_idx" ON "SportEvent"("sport", "league");

-- CreateIndex
CREATE INDEX "SportEvent_sport_eventDate_status_idx" ON "SportEvent"("sport", "eventDate", "status");
