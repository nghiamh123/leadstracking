-- AlterTable
ALTER TABLE "login_events" ADD COLUMN     "asn" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "country_code" TEXT,
ADD COLUMN     "geo_checked_at" TIMESTAMP(3),
ADD COLUMN     "isp" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "region" TEXT;
