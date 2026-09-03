import { routerAnToan } from '../lib/router-an-toan.js';
import { prisma } from '../prisma.js';
import { actualReceived, stillOwed, roomRevenue } from '../services/bookingService.js';
import { hostWhere } from '../middleware/auth.js';

const router = routerAnToan();

// ───── DASHBOARD KPI ─────
router.get('/dashboard', async (req, res) => {
  const now = new Date();
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [allBookings, expenses, homes] = await Promise.all([
    prisma.booking.findMany({ where: hostWhere(req), include: { home: true } }),
    prisma.expense.findMany({ where: hostWhere(req, { date: { gte: mStart, lte: mEnd } }) }),
    prisma.home.findMany({ where: hostWhere(req, { active: true }) })
  ]);

  // Tháng này — booking nhận hoặc trả trong tháng
  const mBookings = allBookings.filter(b => {
    const d = b.status === 'CHECKEDOUT' ? new Date(b.checkOut) : new Date(b.checkIn);
    return d >= mStart && d <= mEnd;
  });
  const mReceived = mBookings.reduce((s, b) => s + actualReceived(b), 0);
  const mRoomRevenue = mBookings.reduce((s, b) => s + roomRevenue(b), 0);
  const mExp = expenses.reduce((s, e) => s + e.amount, 0);

  const active = allBookings.filter(b => b.status !== 'CHECKEDOUT');
  const pending = active.reduce((s, b) => s + stillOwed(b), 0);
  const holdingDep = active.reduce((s, b) => s + (b.deposit || 0), 0);

  res.json({
    monthlyReceived: mReceived,
    monthlyRoomRevenue: mRoomRevenue,   // chỉ tiền phòng (cọc + thu khi nhận nhà)
    monthlyExpense: mExp,
    profit: mReceived - mExp,
    pending,
    holdingDeposit: holdingDep,
    totalBookings: allBookings.length,
    activeBookings: active.length,
    totalHomes: homes.length,
    occupiedHomes: homes.filter(h =>
      active.some(b => b.homeId === h.id && (b.status === 'CHECKEDIN' || b.status === 'CHECKOUT_TODAY'))
    ).length
  });
});

// ───── MONTHLY (6 tháng gần đây) ─────
router.get('/monthly', async (req, res) => {
  const months = parseInt(req.query.months) || 6;
  const now = new Date();
  const result = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d;
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

    const [bookings, expenses] = await Promise.all([
      prisma.booking.findMany({ where: hostWhere(req, { checkIn: { gte: start, lte: end } }) }),
      prisma.expense.findMany({ where: hostWhere(req, { date: { gte: start, lte: end } }) })
    ]);

    result.push({
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      label: `T${d.getMonth() + 1}`,
      bookings: bookings.length,
      revenue: bookings.reduce((s, b) => s + actualReceived(b), 0),
      roomRevenue: bookings.reduce((s, b) => s + roomRevenue(b), 0),
      expense: expenses.reduce((s, e) => s + e.amount, 0)
    });
  }
  res.json(result);
});

// ───── BY HOME ─────
router.get('/by-home', async (req, res) => {
  const homes = await prisma.home.findMany({
    where: hostWhere(req, { active: true }),
    include: { bookings: true }
  });
  const result = homes.map(h => {
    const done = h.bookings.filter(b => b.status === 'CHECKEDOUT');
    const active = h.bookings.filter(b => b.status !== 'CHECKEDOUT');
    return {
      id: h.id,
      name: h.name,
      emoji: h.emoji,
      totalBookings: h.bookings.length,
      doneBookings: done.length,
      activeBookings: active.length,
      received: h.bookings.reduce((s, b) => s + actualReceived(b), 0),
      roomRevenue: h.bookings.reduce((s, b) => s + roomRevenue(b), 0),
      pending: active.reduce((s, b) => s + stillOwed(b), 0),
      holdingDeposit: active.reduce((s, b) => s + (b.deposit || 0), 0)
    };
  });
  res.json(result);
});

// ───── FINANCE ─────
router.get('/finance', async (req, res) => {
  const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const [bookings, expenses] = await Promise.all([
    prisma.booking.findMany({
      where: hostWhere(req, {
        OR: [
          { checkIn: { gte: start, lte: end } },
          { checkOut: { gte: start, lte: end } }
        ]
      }),
      include: { home: true, charges: true }
    }),
    prisma.expense.findMany({
      where: hostWhere(req, { date: { gte: start, lte: end } }),
      include: { home: true },
      orderBy: { date: 'desc' }
    })
  ]);

  const expenseByCategory = {};
  expenses.forEach(e => {
    expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount;
  });

  res.json({
    bookings: bookings.map(b => ({
      ...b,
      received: actualReceived(b),
      owed: stillOwed(b)
    })),
    expenses,
    summary: {
      totalReceived: bookings.reduce((s, b) => s + actualReceived(b), 0),
      totalRoomRevenue: bookings.reduce((s, b) => s + roomRevenue(b), 0),
      totalExpense: expenses.reduce((s, e) => s + e.amount, 0),
      expenseByCategory
    }
  });
});

export default router;
