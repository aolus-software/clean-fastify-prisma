-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex (hand-written: Prisma cannot declare a partial index)
CREATE UNIQUE INDEX "User_email_live_key" ON "User"("email") WHERE "deletedAt" IS NULL;
