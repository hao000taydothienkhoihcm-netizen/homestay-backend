import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/auth.js';
import { checkBookingConflict, nights, stayTotal } from '../services/bookingService.js';

const router = Router();

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
          guests, deposit, discount, notes, status } = req.body;

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
  const data = {
    guest, phone, homeId: parseInt(homeId),
    checkIn: new Date(checkIn), checkInTime: checkInTime || '14:00',
    checkOut: new Date(checkOut), checkOutTime: checkOutTime || '12:00',
    guests: parseInt(guests) || 2,
    totalAmount,
    discount: disc,
    deposit: dep,
    status: st,
    notes: notes || null
  };
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
          guests, deposit, discount, notes, status } = req.body;

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

  // Recalculate totalAmount nếu đổi ngày/nhà
  if (homeId || checkIn || checkOut) {
    const home = await prisma.home.findUnique({ where: { id: updateData.homeId || existing.homeId } });
    updateData.totalAmount = stayTotal(home, updateData.checkIn || existing.checkIn, updateData.checkOut || existing.checkOut);
  }

  // Xác nhận booking sang Đã nhận / Đã trả (nhập bù) → ghi nhận đã thu đủ tiền phòng
  // nếu trước đó chưa thu (paidAtCheckIn = 0), để doanh thu vào mục Thống kê.
  if (status === 'CHECKEDIN' || status === 'CHECKEDOUT') {
    const total = updateData.totalAmount != null ? updateData.totalAmount : existing.totalAmount;
    const dep = updateData.deposit != null ? updateData.deposit : (existing.deposit || 0);
    const disc = updateData.discount != null ? updateData.discount : (existing.discount || 0);
    if (!existing.paidAtCheckIn) {
      updateData.paidAtCheckIn = Math.max(0, total - disc - dep);
    }
    if (!existing.actualCheckIn) {
      updateData.actualCheckIn = updateData.checkIn || existing.checkIn;
    }
    if (status === 'CHECKEDOUT' && !existing.actualCheckOut) {
      updateData.actualCheckOut = updateData.checkOut || existing.checkOut;
    }
  }

  const booking = await prisma.booking.update({
    where: { id }, data: updateData,
    include: { home: true, charges: true }
  });
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

  // Chỉ ADMIN được thêm/sửa phụ thu & phạt. MANAGER, STAFF: giữ nguyên phụ thu cũ (admin nhập sau).
  const isAdmin = req.user.role === 'ADMIN';
  const chargesArr = (isAdmin && Array.isArray(charges)) ? charges : [];
  const chargesTotal = chargesArr.reduce((s, c) => s + (parseInt(c.unit) || 0) * (parseInt(c.qty) || 1), 0);

  // Transaction: (admin) xóa charges cũ + tạo mới, rồi update booking
  const updated = await prisma.$transaction(async (tx) => {
    const data = {
      status: 'CHECKEDOUT',
      actualCheckOut: actualTime ? new Date(actualTime) : new Date(),
      waterMeter: water ? parseFloat(water) : null,
      inspectionNote: inspectionNote || null
    };
    if (isAdmin) {
      await tx.charge.deleteMany({ where: { bookingId: id } });
      if (chargesArr.length) {
        await tx.charge.createMany({
          data: chargesArr.map(c => ({
            bookingId: id,
            name: c.name,
            unit: parseInt(c.unit) || 0,
            qty: parseInt(c.qty) || 1,
            amount: (parseInt(c.unit) || 0) * (parseInt(c.qty) || 1)
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
