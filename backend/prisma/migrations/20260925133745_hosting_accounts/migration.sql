-- CreateTable
CREATE TABLE "hosting_accounts" (
    "id" TEXT NOT NULL,
    "website_id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Hosting',
    "login_url" TEXT NOT NULL,
    "username" TEXT,
    "password_encrypted" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hosting_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hosting_accounts_website_id_idx" ON "hosting_accounts"("website_id");

-- AddForeignKey
ALTER TABLE "hosting_accounts" ADD CONSTRAINT "hosting_accounts_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
