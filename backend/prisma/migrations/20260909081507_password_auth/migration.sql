/*
  Warnings:

  - You are about to drop the column `google_sub` on the `users` table. All the data in the column will be lost.
  - Added the required column `password_hash` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "users_google_sub_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "google_sub",
ADD COLUMN     "password_hash" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'active';
