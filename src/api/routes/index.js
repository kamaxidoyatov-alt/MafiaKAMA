/**
 * Главный маршрутизатор API
 * Объединяет все маршруты API
 */

const express = require('express');
const router = express.Router();

const roomsRouter = require('./rooms');
const playersRouter = require('./players');
const gamesRouter = require('./games');
const statsRouter = require('./stats');
const adminRouter = require('./admin');

// Мониторинг
router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Маршруты
router.use('/rooms', roomsRouter);
router.use('/players', playersRouter);
router.use('/games', gamesRouter);
router.use('/stats', statsRouter);
router.use('/admin', adminRouter);

module.exports = router;
