-- CreateEnum
CREATE TYPE "ChoNguonLich" AS ENUM ('APP', 'ICAL', 'SCRIPT', 'SHEET');

-- AlterTable
ALTER TABLE "Home" ADD COLUMN     "floorPriceHoliday" INTEGER,
ADD COLUMN     "floorPriceWeekend" INTEGER,
ADD COLUMN     "lichDongBoLuc" TIMESTAMP(3),
ADD COLUMN     "lichKey" TEXT,
ADD COLUMN     "lichLink" TEXT,
ADD COLUMN     "lichLoiTu" TIMESTAMP(3),
ADD COLUMN     "lichNguon" "ChoNguonLich",
ADD COLUMN     "lichNhatKy" JSONB,
ADD COLUMN     "lichSheetCot" TEXT,
ADD COLUMN     "lichSheetTab" TEXT,
ADD COLUMN     "listPriceHoliday" INTEGER,
ADD COLUMN     "listPriceWeekend" INTEGER,
ADD COLUMN     "markupHoliday" INTEGER;

