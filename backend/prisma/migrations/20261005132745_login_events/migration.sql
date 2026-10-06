-- CreateTable
CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "website_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "user_id" TEXT,
    "success" BOOLEAN NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_events_website_id_occurred_at_idx" ON "login_events"("website_id", "occurred_at");

-- CreateIndex
CREATE INDEX "login_events_username_occurred_at_idx" ON "login_events"("username", "occurred_at");

-- CreateIndex
CREATE INDEX "login_events_occurred_at_idx" ON "login_events"("occurred_at");

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
