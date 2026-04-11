-- CreateIndex
CREATE INDEX "Competition_sport_idx" ON "Competition"("sport");

-- CreateIndex
CREATE INDEX "FriendRequest_receiverId_status_idx" ON "FriendRequest"("receiverId", "status");

-- CreateIndex
CREATE INDEX "FriendRequest_senderId_status_idx" ON "FriendRequest"("senderId", "status");

-- CreateIndex
CREATE INDEX "Friendship_userId_idx" ON "Friendship"("userId");

-- CreateIndex
CREATE INDEX "Friendship_friendId_idx" ON "Friendship"("friendId");

-- CreateIndex
CREATE INDEX "Market_sport_idx" ON "Market"("sport");

-- CreateIndex
CREATE INDEX "SharedBoletin_sharedWithId_createdAt_idx" ON "SharedBoletin"("sharedWithId", "createdAt");
