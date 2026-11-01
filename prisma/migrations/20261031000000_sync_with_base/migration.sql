-- Hand-written: Prisma would drop and recreate every table for this change.
-- Renames tables and columns to Prisma default (model / camelCase) names,
-- uppercases the status enum, and makes both token tables expiring,
-- single-use and unique. Existing user, role and permission rows are kept.
-- Outstanding verification and reset tokens are deleted: reset tokens had no
-- expiry to backfill, and both kinds were generated with a non-crypto RNG.

-- UserStatus
ALTER TYPE "UserStatus" RENAME VALUE 'active' TO 'ACTIVE';
ALTER TYPE "UserStatus" RENAME VALUE 'inactive' TO 'INACTIVE';
ALTER TYPE "UserStatus" RENAME VALUE 'suspended' TO 'SUSPENDED';
ALTER TYPE "UserStatus" RENAME VALUE 'blocked' TO 'BLOCKED';
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- User
ALTER TABLE "users" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "users_pkey" TO "User_pkey";
ALTER TABLE "User" RENAME COLUMN "email_verified_at" TO "emailVerifiedAt";
ALTER TABLE "User" RENAME COLUMN "deleted_at" TO "deletedAt";
ALTER TABLE "User" RENAME COLUMN "created_at" TO "createdAt";
ALTER TABLE "User" RENAME COLUMN "updated_at" TO "updatedAt";
ALTER INDEX "users_email_deleted_at_status_idx" RENAME TO "User_email_deletedAt_status_idx";

-- Role
ALTER TABLE "roles" RENAME TO "Role";
ALTER TABLE "Role" RENAME CONSTRAINT "roles_pkey" TO "Role_pkey";
ALTER TABLE "Role" RENAME COLUMN "created_at" TO "createdAt";
ALTER TABLE "Role" RENAME COLUMN "updated_at" TO "updatedAt";
ALTER INDEX "roles_name_key" RENAME TO "Role_name_key";

-- Permission
ALTER TABLE "permissions" RENAME TO "Permission";
ALTER TABLE "Permission" RENAME CONSTRAINT "permissions_pkey" TO "Permission_pkey";
ALTER TABLE "Permission" RENAME COLUMN "created_at" TO "createdAt";
ALTER TABLE "Permission" RENAME COLUMN "updated_at" TO "updatedAt";
ALTER INDEX "permissions_name_key" RENAME TO "Permission_name_key";

-- RolePermission
ALTER TABLE "role_permissions" RENAME TO "RolePermission";
ALTER TABLE "RolePermission" RENAME CONSTRAINT "role_permissions_pkey" TO "RolePermission_pkey";
ALTER TABLE "RolePermission" RENAME COLUMN "role_id" TO "roleId";
ALTER TABLE "RolePermission" RENAME COLUMN "permission_id" TO "permissionId";
ALTER TABLE "RolePermission" RENAME CONSTRAINT "role_permissions_role_id_fkey" TO "RolePermission_roleId_fkey";
ALTER TABLE "RolePermission" RENAME CONSTRAINT "role_permissions_permission_id_fkey" TO "RolePermission_permissionId_fkey";
ALTER TABLE "RolePermission" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RolePermission" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RolePermission" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- UserRole
ALTER TABLE "user_roles" RENAME TO "UserRole";
ALTER TABLE "UserRole" RENAME CONSTRAINT "user_roles_pkey" TO "UserRole_pkey";
ALTER TABLE "UserRole" RENAME COLUMN "user_id" TO "userId";
ALTER TABLE "UserRole" RENAME COLUMN "role_id" TO "roleId";
ALTER TABLE "UserRole" RENAME COLUMN "assigned_at" TO "createdAt";
ALTER TABLE "UserRole" RENAME CONSTRAINT "user_roles_user_id_fkey" TO "UserRole_userId_fkey";
ALTER TABLE "UserRole" RENAME CONSTRAINT "user_roles_role_id_fkey" TO "UserRole_roleId_fkey";
ALTER TABLE "UserRole" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "UserRole" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- UserEmailVerification
DELETE FROM "email_verifications";
ALTER TABLE "email_verifications" RENAME TO "UserEmailVerification";
ALTER TABLE "UserEmailVerification" RENAME CONSTRAINT "email_verifications_pkey" TO "UserEmailVerification_pkey";
ALTER TABLE "UserEmailVerification" DROP CONSTRAINT "email_verifications_user_id_fkey";
DROP INDEX "email_verifications_token_idx";
ALTER TABLE "UserEmailVerification" RENAME COLUMN "user_id" TO "userId";
ALTER TABLE "UserEmailVerification" RENAME COLUMN "expired_at" TO "expiresAt";
ALTER TABLE "UserEmailVerification" RENAME COLUMN "created_at" TO "createdAt";
ALTER TABLE "UserEmailVerification" RENAME COLUMN "updated_at" TO "updatedAt";
ALTER TABLE "UserEmailVerification" ADD COLUMN "usedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "UserEmailVerification_token_key" ON "UserEmailVerification"("token");
CREATE INDEX "UserEmailVerification_userId_usedAt_idx" ON "UserEmailVerification"("userId", "usedAt");
ALTER TABLE "UserEmailVerification" ADD CONSTRAINT "UserEmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PasswordReset
DELETE FROM "password_reset_tokens";
ALTER TABLE "password_reset_tokens" RENAME TO "PasswordReset";
ALTER TABLE "PasswordReset" RENAME CONSTRAINT "password_reset_tokens_pkey" TO "PasswordReset_pkey";
ALTER TABLE "PasswordReset" DROP CONSTRAINT "password_reset_tokens_user_id_fkey";
DROP INDEX "password_reset_tokens_token_idx";
ALTER TABLE "PasswordReset" RENAME COLUMN "user_id" TO "userId";
ALTER TABLE "PasswordReset" RENAME COLUMN "created_at" TO "createdAt";
ALTER TABLE "PasswordReset" RENAME COLUMN "updated_at" TO "updatedAt";
ALTER TABLE "PasswordReset" ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL;
ALTER TABLE "PasswordReset" ADD COLUMN "usedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "PasswordReset"("token");
CREATE INDEX "PasswordReset_userId_usedAt_idx" ON "PasswordReset"("userId", "usedAt");
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
