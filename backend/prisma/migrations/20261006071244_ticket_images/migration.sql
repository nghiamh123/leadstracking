-- CreateTable
CREATE TABLE "ticket_images" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_images_ticket_id_idx" ON "ticket_images"("ticket_id");

-- AddForeignKey
ALTER TABLE "ticket_images" ADD CONSTRAINT "ticket_images_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_images" ADD CONSTRAINT "ticket_images_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
