-- CreateEnum
CREATE TYPE "CuoiTuanGom" AS ENUM ('T6_T7', 'T6_T7_CN', 'T7_CN', 'T7');

-- AlterTable
ALTER TABLE "Home" ADD COLUMN     "cuoiTuanGom" "CuoiTuanGom" NOT NULL DEFAULT 'T6_T7_CN';

