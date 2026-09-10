-- Vi tri can tren ban do.
-- mapLink giu link Google Maps host dan vao (chua dia chi chinh xac -> KHONG ra cho).
-- lat/lng de tinh km toi cho Da Lat theo duong chim bay.
-- viTriUocChung = true khi toa do do may do tu dia chi, host chua xac nhan.
ALTER TABLE "Home" ADD COLUMN "mapLink" TEXT;
ALTER TABLE "Home" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Home" ADD COLUMN "lng" DOUBLE PRECISION;
ALTER TABLE "Home" ADD COLUMN "viTriUocChung" BOOLEAN NOT NULL DEFAULT false;
