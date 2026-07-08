import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const homes = await prisma.home.findMany({
    where: { active: true },
    orderBy: { id: 'asc' }
  });
  res.json(homes);
});

router.get('/:id', async (req, res) => {
  const home = await prisma.home.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!home) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json(home);
});

router.post('/', requireRole('ADMIN'), async (req, res) => {
  const { name, address, price, weekendPrice, maxGuests, emoji, desc } = req.body;
  if (!name || !address || !price) return res.status(400).json({ error: 'Thiếu thông tin' });

  const wk = (weekendPrice === '' || weekendPrice == null) ? null : parseInt(weekendPrice);
  const home = await prisma.home.create({
    data: {
      name, address, price: parseInt(price),
      weekendPrice: (wk && wk > 0) ? wk : null,
      maxGuests: parseInt(maxGuests) || 8, emoji: emoji || '🏡', desc
    }
  });
  res.status(201).json(home);
});

router.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, address, price, weekendPrice, maxGuests, emoji, desc } = req.body;
  const home = await prisma.home.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(address !== undefined && { address }),
      ...(price !== undefined && { price: parseInt(price) }),
      ...(weekendPrice !== undefined && {
        weekendPrice: (weekendPrice === '' || weekendPrice == null || parseInt(weekendPrice) <= 0)
          ? null : parseInt(weekendPrice)
      }),
      ...(maxGuests !== undefined && { maxGuests: parseInt(maxGuests) }),
      ...(emoji !== undefined && { emoji }),
      ...(desc !== undefined && { desc })
    }
  });
  res.json(home);
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id);
  // Check if có booking ac