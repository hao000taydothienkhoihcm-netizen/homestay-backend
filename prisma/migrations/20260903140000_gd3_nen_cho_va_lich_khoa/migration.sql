-- GD3 nen: Host.plan/internalAppEnabled, Booking.source, Home mo rong cho, bang LichKhoa
-- Toan bo ADD COLUMN nullable/co default + CREATE TABLE: khong dung du lieu cu.

-- CreateEnum
CREATE TYPE "HostPlan" AS ENUM ('FREE', 'PER_BOOKING', 'FLAT');

-- CreateEnum
CREATE TYPE "ChoTrangThai" AS ENUM ('NHAP', 'CHO_DUYET', 'DANG_BAN', 'AN');

-- CreateEnum
CREATE TYPE "CoCheHoaHong" AS ENUM ('PHAN_TRAM', 'GIA_SAN');

-- CreateEnum
CREATE TYPE "NguonLichKhoa" AS ENUM ('MANUAL', 'SHEET', 'ICAL');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('INTERNAL', 'MARKETPLACE');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "source" "BookingSource" NOT NULL DEFAULT 'INTERNAL';

-- AlterTable
ALTER TABLE "Home" ADD COLUMN     "albumUrl" TEXT,
ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "bedroomsDouble" INTEGER,
ADD COLUMN     "bedroomsSingle" INTEGER,
ADD COLUMN     "caretakerPhone" TEXT,
ADD COLUMN     "childFrom6" TEXT,
ADD COLUMN     "childUnder6" TEXT,
ADD COLUMN     "choTrangThai" "ChoTrangThai" NOT NULL DEFAULT 'NHAP',
ADD COLUMN     "coCheHoaHong" "CoCheHoaHong",
ADD COLUMN     "commissionPct" INTEGER,
ADD COLUMN     "coverImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "floorPrice" INTEGER,
ADD COLUMN     "landmark" TEXT,
ADD COLUMN     "listPrice" INTEGER,
ADD COLUMN     "markupMax" INTEGER,
ADD COLUMN     "markupMin" INTEGER,
ADD COLUMN     "minGuests" INTEGER,
ADD COLUMN     "parkingFee" TEXT,
ADD COLUMN     "parkingFree" TEXT,
ADD COLUMN     "parkingNote" TEXT,
ADD COLUMN     "roomNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rules" TEXT,
ADD COLUMN     "salesInfo" TEXT,
ADD COLUMN     "salesTitle" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "ward" TEXT;

-- AlterTable
ALTER TABLE "Host" ADD COLUMN     "internalAppEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "internalAppNote" TEXT,
ADD COLUMN     "plan" "HostPlan" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "LichKhoa" (
    "id" SERIAL NOT NULL,
    "hostId" INTEGER NOT NULL,
    "homeId" INTEGER NOT NULL,
    "ngay" DATE NOT NULL,
    "nguon" "NguonLichKhoa" NOT NULL DEFAULT 'MANUAL',
    "ghiChu" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LichKhoa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LichKhoa_hostId_ngay_idx" ON "LichKhoa"("hostId", "ngay");

-- CreateIndex
CREATE UNIQUE INDEX "LichKhoa_homeId_ngay_key" ON "LichKhoa"("homeId", "ngay");

-- CreateIndex
CREATE INDEX "Home_ward_idx" ON "Home"("ward");

-- AddForeignKey
ALTER TABLE "LichKhoa" ADD CONSTRAINT "LichKhoa_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LichKhoa" ADD CONSTRAINT "LichKhoa_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

