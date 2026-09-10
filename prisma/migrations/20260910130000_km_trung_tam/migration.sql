-- Khoang cach tu can toi trung tam (cho Da Lat), don vi km.
-- Sales loc "trong 3 km" — bang hang cua cac ben moi gioi deu co san cot nay.
-- Cho phep NULL: can cu chua do thi de trong, khong bi loc oan (xem routes/cho.js).
ALTER TABLE "Home" ADD COLUMN "kmTrungTam" DOUBLE PRECISION;
