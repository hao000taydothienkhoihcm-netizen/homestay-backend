-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'STAFF', 'HOST', 'SALES');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CHECKEDIN', 'CHECKOUT_TODAY', 'CHECKEDOUT');

-- CreateEnum
CREATE TYPE "ChargePhase" AS ENUM ('CHECKIN', 'CHECKOUT');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('RULE', 'QUICK');

-- CreateEnum
CREATE TYPE "StockType" AS ENUM ('IMPORT', 'ADJUST');

-- CreateTable
CREATE TABLE "Host" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Host_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "hostId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Home" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "weekendPrice" INTEGER,
    "holidayPrice" INTEGER,
    "maxGuests" INTEGER NOT NULL DEFAULT 8,
    "emoji" TEXT NOT NULL DEFAULT '🏡',
    "desc" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hostId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Home_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeMonthlyPrice" (
    "id" SERIAL NOT NULL,
    "homeId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "price" INTEGER,
    "weekendPrice" INTEGER,
    "holidayPrice" INTEGER,
    "note" TEXT,
    "hostId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeMonthlyPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeDatePrice" (
    "id" SERIAL NOT NULL,
    "homeId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "price" INTEGER NOT NULL,
    "note" TEXT,
    "hostId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeDatePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "hostId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" SERIAL NOT NULL,
    "guest" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "homeId" INTEGER NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkInTime" TEXT NOT NULL DEFAULT '14:00',
    "checkOut" DATE NOT NULL,
    "checkOutTime" TEXT NOT NULL DEFAULT '12:00',
    "guests" INTEGER NOT NULL DEFAULT 2,
    "totalAmount" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "deposit" INTEGER NOT NULL DEFAULT 0,
    "paidAtCheckIn" INTEGER NOT NULL DEFAULT 0,
    "chargesTotal" INTEGER NOT NULL DEFAULT 0,
    "checkinCharges" INTEGER NOT NULL DEFAULT 0,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "actualCheckIn" TIMESTAMP(3),
    "actualCheckOut" TIMESTAMP(3),
    "waterMeter" DOUBLE PRECISION,
    "inspectionNote" TEXT,
    "hostId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "unit" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL,
    "phase" "ChargePhase" NOT NULL DEFAULT 'CHECKOUT',
    "templateId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "ChargeType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "trackStock" BOOLEAN NOT NULL DEFAULT false,
    "packSize" INTEGER NOT NULL DEFAULT 1,
    "packLabel" TEXT NOT NULL DEFAULT 'thùng',
    "unitLabel" TEXT NOT NULL DEFAULT 'cái',
    "lowStock" INTEGER NOT NULL DEFAULT 0,
    "costPrice" INTEGER NOT NULL DEFAULT 0,
    "hostId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockEntry" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "homeId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "type" "StockType" NOT NULL DEFAULT 'IMPORT',
    "note" TEXT,
    "date" DATE NOT NULL,
    "hostId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "homeId" INTEGER,
    "hostId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_hostId_idx" ON "User"("hostId");

-- CreateIndex
CREATE INDEX "Home_hostId_idx" ON "Home"("hostId");

-- CreateIndex
CREATE INDEX "HomeMonthlyPrice_hostId_idx" ON "HomeMonthlyPrice"("hostId");

-- CreateIndex
CREATE INDEX "HomeMonthlyPrice_homeId_year_idx" ON "HomeMonthlyPrice"("homeId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "HomeMonthlyPrice_homeId_year_month_key" ON "HomeMonthlyPrice"("homeId", "year", "month");

-- CreateIndex
CREATE INDEX "HomeDatePrice_hostId_idx" ON "HomeDatePrice"("hostId");

-- CreateIndex
CREATE INDEX "HomeDatePrice_date_idx" ON "HomeDatePrice"("date");

-- CreateIndex
CREATE UNIQUE INDEX "HomeDatePrice_homeId_date_key" ON "HomeDatePrice"("homeId", "date");

-- CreateIndex
CREATE INDEX "Holiday_startDate_endDate_idx" ON "Holiday"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Holiday_hostId_idx" ON "Holiday"("hostId");

-- CreateIndex
CREATE INDEX "Booking_homeId_checkIn_checkOut_idx" ON "Booking"("homeId", "checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_hostId_idx" ON "Booking"("hostId");

-- CreateIndex
CREATE INDEX "Charge_templateId_idx" ON "Charge"("templateId");

-- CreateIndex
CREATE INDEX "ChargeTemplate_hostId_idx" ON "ChargeTemplate"("hostId");

-- CreateIndex
CREATE INDEX "StockEntry_templateId_homeId_idx" ON "StockEntry"("templateId", "homeId");

-- CreateIndex
CREATE INDEX "StockEntry_date_idx" ON "StockEntry"("date");

-- CreateIndex
CREATE INDEX "StockEntry_hostId_idx" ON "StockEntry"("hostId");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_hostId_idx" ON "Expense"("hostId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Home" ADD CONSTRAINT "Home_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeMonthlyPrice" ADD CONSTRAINT "HomeMonthlyPrice_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeMonthlyPrice" ADD CONSTRAINT "HomeMonthlyPrice_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeDatePrice" ADD CONSTRAINT "HomeDatePrice_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeDatePrice" ADD CONSTRAINT "HomeDatePrice_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChargeTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeTemplate" ADD CONSTRAINT "ChargeTemplate_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChargeTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

