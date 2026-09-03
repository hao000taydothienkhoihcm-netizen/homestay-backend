-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" INTEGER;

-- CreateTable
CREATE TABLE "HoTroLog" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER NOT NULL,
    "hostId" INTEGER NOT NULL,
    "lyDo" TEXT,
    "luc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoTroLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HoTroLog_hostId_luc_idx" ON "HoTroLog"("hostId", "luc");

-- CreateIndex
CREATE INDEX "Booking_deletedAt_idx" ON "Booking"("deletedAt");

-- AddForeignKey
ALTER TABLE "HoTroLog" ADD CONSTRAINT "HoTroLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoTroLog" ADD CONSTRAINT "HoTroLog_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

