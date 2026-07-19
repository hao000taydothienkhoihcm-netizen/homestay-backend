import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/auth.js';
import { checkBookingConflict, nights, stayTotal } from '../services/bookingService.js';

const router = Router();

// Map tên phụ thu → id mẫu (ChargeTemplate) để gắn liên kết cứng vào Charge.
// Ưu tiên mẫu đang hoạt động khi trùng tên.
async function templateIdByName(names) {
  const uniq = [...new Set((names || []).map(n => String(n || '').trim()).filter(Boolean))];
  if (!uniq.length) return {};
  const tpls = await prisma.chargeTemplate.findMany({
    where: { name: { in: uniq } },
    select: { id: true, name: true, active: true }
  });
  const pick = {};
  for (const t of tpls) {
    if (!pick[t.name] || (t.active && !pick[t.name].active)) pick[t.name] = t;
  }
  const out = {};
  for (const k in pick) out[k] = pick[k].id;
  return out;
}

// ───── LIST ─────
router.get('/', async (req, res) => {
  const { status, homeId, from, to, search } = req.query;
  const where = {};
  if (status) where.status = status;
  if (homeId) where.homeId = parseInt(homeId);
  if (from && to) where.checkIn = { gte: new Date(from), lte: new Date(to) };
  if (search) {
    where.OR = [
      { guest: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } }
    ];
  }
  const bookings = await prisma.booking.findMany({
    where,
    include: { home: true, charges: true },
    orderBy: { checkIn: 'desc' }
  });
  res.json(bookings);
});

// ───── TODAY ─────
router.get('/today', async (req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [checkIns, checkOuts] = await Promise.all([
    prisma.booking.findMany({
      where: { checkIn: { gte: start, lt: end }, status: 'CONFIRMED' },
      include: { home: true }
    }),
    prisma.booking.findMany({
      where: { checkOut: { gte: start, lt: end }, status: { not: 'CHECKEDOUT' } },
      include: { home: true, charges: true }
    })
  ]);
  res.json({ checkIns, checkOuts });
});

// ───── CALENDAR ─────
router.get('/calendar', async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const bookings = await prisma.booking.findMany({
    where: {
      status: { not: 'CHECKEDOUT' },
      OR: [
        { checkIn: { lte: end }, checkOut: { gte: start } }
      ]
    },
    include: { home: true }
  });
  res.json(bookings);
});

// ───── DETAIL ─────
router.get('/:id', async (req, res) => {
  const b = await prisma.booking.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { home: true, charges: true }
  });
  if (!b) return res.status(404).json({ error: 'Không tìm thấy booking' });
  res.json(b);
});

// ───── CREATE ─────
router.post('/', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  const { guest, phone, homeId, checkIn, checkOut, checkInTime, checkOutTime,
          guests, deposit, discount, notes, status, charges } = req.body;

  if (!guest || !phone || !homeId || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
  }
  if (new Date(checkOut) <= new Date(checkIn)) {
    return res.status(400).json({ error: 'Ngày trả phải sau ngày nhận' });
  }
  // Không cho tạo booking với ngày nhận đã qua (so sánh theo ngày, không tính giờ)
  // Admin được phép tạo booking ngày quá khứ (để nhập liệu bù)
  if (req.user.role !== 'ADMIN') {
    const ciDate = new Date(checkIn);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    ciDate.setHours(0, 0, 0, 0);
    if (ciDate < today) {
      return res.status(400).json({ error: 'Không thể tạo booking với ngày nhận đã qua' });
    }
  }

  const conflict = await checkBookingConflict(homeId, checkIn, checkOut);
  if (conflict) {
    return res.status(409).json({
      error: 'Trùng lịch với booking đã có',
      conflict: { guest: conflict.guest, checkIn: conflict.checkIn, checkOut: conflict.checkOut, deposit: conflict.deposit }
    });
  }

  const home = await prisma.home.findUnique({ where: { id: parseInt(homeId) } });
  if (!home) return res.status(404).json({ error: 'Căn nhà không tồn tại' });

  const totalAmount = stayTotal(home, checkIn, checkOut);

  // Mọi quyền (ADMIN, MANAGER, STAFF) đều được nhập tiền cọc / giảm giá.
  const dep = parseInt(deposit) || 0;
  const disc = Math.max(0, parseInt(discount) || 0);
  const st = status || 'CONFIRMED';

  // Phụ thu (kê nệm, dọn dẹp...) — mọi quyền được nhập khi tạo booking.
  // Mỗi dòng có phase: CHECKIN (thu lúc nhận nhà) hoặc CHECKOUT (thu lúc trả nhà).
  const chargesArr = Array.isArray(charges)
    ? charges
        .filter(c => c && c.name && (parseInt(c.unit) || 0) > 0)
        .map(c => ({
          name: String(c.name).trim(),
          unit: parseInt(c.unit) || 0,
          qty: parseInt(c.qty) || 1,
          amount: (parseInt(c.unit) || 0) * (parseInt(c.qty) || 1),
          phase: c.phase === 'CHECKIN' ? 'CHECKIN' : 'CHECKOUT'
        }))
    : [];
  const checkinCharges = chargesArr.filter(c => c.phase === 'CHECKIN').reduce((s, c) => s + c.amount, 0);
  const chargesTotal = chargesArr.filter(c => c.phase === 'CHECKOUT').reduce((s, c) => s + c.amount, 0);

  const data = {
    guest, phone, homeId: parseInt(homeId),
    checkIn: new Date(checkIn), checkInTime: checkInTime || '14:00',
    checkOut: new Date(checkOut), checkOutTime: checkOutTime || '12:00',
    guests: parseInt(guests) || 2,
    totalAmount,
    discount: disc,
    deposit: dep,
    status: st,
    checkinCharges,
    chargesTotal,
    notes: notes || null
  };
  if (chargesArr.length) {
    const tidMap = await templateIdByName(chargesArr.map(c => c.name));
    data.charges = { create: chargesArr.map(c => ({ ...c, templateId: tidMap[c.name] || null })) };
  }
  // Nhập bù lịch sử: tạo booking đã nhận / đã trả → ghi nhận đã thu đủ tiền phòng
  // (sau khi trừ giảm giá) để doanh thu vào thẳng mục Thống kê.
  if (st === 'CHECKEDIN' || st === 'CHECKEDOUT') {
    data.paidAtCheckIn = Math.max(0, totalAmount - disc - dep);
    data.actualCheckIn = new Date(checkIn);
  }
  if (st === 'CHECKEDOUT') {
    data.actualCheckOut = new Date(checkOut);
  }

  const booking = await prisma.booking.create({
    data,
    include: { home: true, charges: true }
  });
  res.status(201).json(booking);
});

// ───── UPDATE ─────
router.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy' });

  const { guest, phone, homeId, checkIn, checkOut, checkInTime, checkOutTime,
          guests, deposit, discount, notes, status, charges } = req.body;

  // Conflict check khi đổi ngày hoặc nhà
  if (homeId && checkIn && checkOut) {
    const conflict = await checkBookingConflict(homeId, checkIn, checkOut, id);
    if (conflict) return res.status(409).json({ error: 'Trùng lịch', conflict });
  }
  // Không cho đổi ngày nhận về quá khứ
  // (Chỉ check khi user thực sự đổi checkIn, và booking chưa CHECKEDIN)
  // Admin được phép đổi ngày về quá khứ (nhập liệu bù)
  if (checkIn && existing.status === 'CONFIRMED' && req.user.role !== 'ADMIN') {
    const ciDate = new Date(checkIn);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    ciDate.setHours(0, 0, 0, 0);
    // Cho phép giữ nguyên ngày cũ kể cả khi nó đã qua (không phải đổi mới)
    const existingCiDate = new Date(existing.checkIn);
    existingCiDate.setHours(0, 0, 0, 0);
    if (ciDate < today && ciDate.getTime() !== existingCiDate.getTime()) {
      return res.status(400).json({ error: 'Không thể đổi ngày nhận về quá khứ' });
    }
  }

  const updateData = {};
  if (guest !== undefined) updateData.guest = guest;
  if (phone !== undefined) updateData.phone = phone;
  if (homeId !== undefined) updateData.homeId = parseInt(homeId);
  if (checkIn) updateData.checkIn = new Date(checkIn);
  if (checkOut) updateData.checkOut = new Date(checkOut);
  if (checkInTime) updateData.checkInTime = checkInTime;
  if (checkOutTime) updateData.checkOutTime = checkOutTime;
  if (guests !== undefined) updateData.guests = parseInt(guests);
  // Mọi quyền được sửa tiền cọc / giảm giá.
  if (deposit !== undefined) updateData.deposit = parseInt(deposit);
  if (discount !== undefined) updateData.discount = Math.max(0, parseInt(discount) || 0);
  if (notes !== undefined) updateData.notes = notes;
  if (status) updateData.status = status;

  // Phụ thu: nếu client gửi mảng charges → thay toàn bộ + tính lại theo phase.
  let chargesArr = null;
  if (Array.isArray(charges)) {
    chargesArr = charges
      .filter(c => c && c.name && (parseInt(c.unit) || 0) > 0)
      .map(c => ({
        name: String(c.name).trim(),
        unit: parseInt(c.unit) || 0,
        qty: parseInt(c.qty) || 1,
        amount: (parseInt(c.unit) || 0) * (parseInt(c.qty) || 1),
        phase: c.phase === 'CHECKIN' ? 'CHECKIN' : 'CHECKOUT'
      }));
    updateData.checkinCharges = chargesArr.filter(c => c.phase === 'CHECKIN').reduce((s, c) => s + c.amount, 0);
    updateData.chargesTotal = chargesArr.filter(c => c.phase === 'CHECKOUT').reduce((s, c) => s + c.amount, 0);
    const tidMap = await templateIdByName(chargesArr.map(c => c.name));
    chargesArr = chargesArr.map(c => ({ ...c, templateId: tidMap[c.name] || null }));
  }

  // Recalculate totalAmount nếu đổi ngày/nhà
  if (homeId || checkIn || checkOut) {
    const home = await prisma.home.findUnique({ where: { id: updateData.homeId || existing.homeId } });
    updateData.totalAmount = stayTotal(home, updateData.checkIn || existing.checkIn, updateData.checkOut || existing.checkOut);
  }

  // Trạng thái hiệu lực sau cập nhật (client gửi status mới, hoặc giữ nguyên).
  const effStatus = status || existing.status;

  // Booking đã Nhận / đã Trả: "thu khi nhận nhà" = tiền phòng sau giảm giá, trừ cọc.
  // TÍNH LẠI mỗi khi tiền phòng / giảm giá / cọc thay đổi, để số liệu không bị lệch.
  // (Trước đây chỉ tính khi paidAtCheckIn = 0 → sửa giảm giá SAU check-in bị sai số.)
  if (effStatus === 'CHECKEDIN' || effStatus === 'CHECKEDOUT') {
    const total = updateData.totalAmount != null ? updateData.totalAmount : existing.totalAmount;
    const dep = updateData.deposit != null ? updateData.deposit : (existing.deposit || 0);
    const disc = updateData.discount != null ? updateData.discount : (existing.discount || 0);
    updateData.paidAtCheckIn = Math.max(0, total - disc - dep);

    if (!existing.actualCheckIn) {
      updateData.actualCheckIn = updateData.checkIn || existing.checkIn;
    }
    if (effStatus === 'CHECKEDOUT' && !existing.actualCheckOut) {
      updateData.actualCheckOut = updateData.checkOut || existing.checkOut;
    }
  }

  let booking;
  if (chargesArr !== null) {
    // Thay charges cũ bằng danh sách mới trong 1 transaction.
    booking = await prisma.$transaction(async (tx) => {
      await tx.charge.deleteMany({ where: { bookingId: id } });
      if (chargesArr.length) {
        await tx.charge.createMany({ data: chargesArr.map(c => ({ bookingId: id, ...c })) });
      }
      return tx.booking.update({
        where: { id }, data: updateData,
        include: { home: true, charges: true }
      });
    });
  } else {
    booking = await prisma.booking.update({
      where: { id }, data: updateData,
      include: { home: true, charges: true }
    });
  }
  res.json(booking);
});

// ───── DELETE ─────
router.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const id = parseInt(req.params.id);
  await prisma.booking.delete({ where: { id } });
  res.json({ ok: true });
});

// ───── CHECK-IN ─────
router.post('/:id/checkin', async (req, res) => {
  const id = parseInt(req.params.id);
  const { actualTime, note } = req.body;

  const b = await prisma.booking.findUnique({ where: { id } });
  if (!b) return res.status(404).json({ error: 'Không tìm thấy' });

  const paidAtCheckIn = Math.max(0, b.totalAmount - (b.discount || 0) - (b.deposit || 0));

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: 'CHECKEDIN',
      paidAtCheckIn,
      actualCheckIn: actualTime ? new Date(actualTime) : new Date(),
      notes: note || b.notes
    },
    include: { home: true, charges: true }
  });
  res.json(updated);
});

// ───── CHECK-OUT ─────
router.post('/:id/checkout', async (req, res) => {
  const id = parseInt(req.params.id);
  const { actualTime, water, inspectionNote, charges } = req.body;

  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy booking' });

  // Ai được thêm/sửa phụ thu: ADMIN luôn được; MANAGER & STAFF chỉ được ĐÚNG NGÀY trả nhà (giờ VN), không qua hôm sau.
  const isAdmin = req.user.role === 'ADMIN';
  const vnToday = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const refDate = (existing.status === 'CHECKEDOUT' && existing.actualCheckOut) ? existing.actualCheckOut : existing.checkOut;
  const checkoutDay = refDate ? new Date(refDate).toISOString().slice(0, 10) : null;
  const canEditCharges = isAdmin || (checkoutDay && vnToday === checkoutDay);

  const chargesArr = (canEditCharges && Array.isArray(charges)) ? charges : [];
  const chargesTotal = chargesArr.reduce((s, c) => s + (parseInt(c.unit) || 0) * (parseInt(c.qty) || 1), 0);
  const tidMap = canEditCharges ? await templateIdByName(chargesArr.map(c => c.name)) : {};

  // Transaction: (nếu được phép) xóa charges cũ + tạo mới, rồi update booking
  const updated = await prisma.$transaction(async (tx) => {
    const data = {
      status: 'CHECKEDOUT',
      actualCheckOut: actualTime ? new Date(actualTime) : new Date(),
      waterMeter: water ? parseFloat(water) : null,
      inspectionNote: inspectionNote || null
    };
    if (canEditCharges) {
      // Chỉ thay phụ thu TRẢ NHÀ; giữ nguyên phụ thu NHẬN NHÀ (đã thu lúc nhận).
      await tx.charge.deleteMany({ where: { bookingId: id, phase: 'CHECKOUT' } });
      if (chargesArr.length) {
        await tx.charge.createMany({
          data: chargesArr.map(c => ({
            bookingId: id,
            name: c.name,
            unit: parseInt(c.unit) || 0,
            qty: parseInt(c.qty) || 1,
            amount: (parseInt(c.unit) || 0) * (parseInt(c.qty) || 1),
            phase: 'CHECKOUT',
            templateId: tidMap[String(c.name || '').trim()] || null
          }))
        });
      }
      data.chargesTotal = chargesTotal;
    }
    return tx.booking.update({
      where: { id },
      data,
      include: { home: true, charges: true }
    });
  });
  res.json(updated);
});

export default router;
