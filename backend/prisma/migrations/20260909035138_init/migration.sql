-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'manager', 'sales', 'seo');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'invited', 'disabled');

-- CreateEnum
CREATE TYPE "WebsiteStatus" AS ENUM ('connected', 'error', 'pending');

-- CreateEnum
CREATE TYPE "SyncScope" AS ENUM ('traffic', 'keywords');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('success', 'failed', 'running');

-- CreateEnum
CREATE TYPE "LeadChannel" AS ENUM ('form_web', 'zalo', 'fanpage', 'hotline', 'chat');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('moi', 'dang_cham_soc', 'da_chuyen_don', 'huy');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('cho_xu_ly', 'da_giao', 'huy');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "google_sub" TEXT,
    "role" "Role" NOT NULL,
    "team" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'invited',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "websites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "gsc_property" TEXT NOT NULL,
    "status" "WebsiteStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "websites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gsc_daily_traffic" (
    "id" TEXT NOT NULL,
    "website_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "gsc_daily_traffic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gsc_keywords" (
    "id" TEXT NOT NULL,
    "website_id" TEXT NOT NULL,
    "range_start" DATE NOT NULL,
    "range_end" DATE NOT NULL,
    "query" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gsc_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "website_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "channel" "LeadChannel" NOT NULL,
    "interest" TEXT NOT NULL,
    "sales_rep_id" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'moi',
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "lead_id" TEXT,
    "website_id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "product" TEXT NOT NULL,
    "sales_rep_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'cho_xu_ly',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "website_id" TEXT NOT NULL,
    "scope" "SyncScope" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "field" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "websites_domain_key" ON "websites"("domain");

-- CreateIndex
CREATE INDEX "gsc_daily_traffic_website_id_date_idx" ON "gsc_daily_traffic"("website_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "gsc_daily_traffic_website_id_date_key" ON "gsc_daily_traffic"("website_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "gsc_keywords_website_id_query_key" ON "gsc_keywords"("website_id", "query");

-- CreateIndex
CREATE INDEX "leads_website_id_date_idx" ON "leads"("website_id", "date");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_sales_rep_id_idx" ON "leads"("sales_rep_id");

-- CreateIndex
CREATE INDEX "orders_website_id_date_idx" ON "orders"("website_id", "date");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_sales_rep_id_idx" ON "orders"("sales_rep_id");

-- CreateIndex
CREATE INDEX "sync_logs_website_id_run_at_idx" ON "sync_logs"("website_id", "run_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "gsc_daily_traffic" ADD CONSTRAINT "gsc_daily_traffic_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_keywords" ADD CONSTRAINT "gsc_keywords_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
