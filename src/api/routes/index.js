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
const sleepMode = require('../../bot/sleepMode');

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

// ── Sleep mode API ──
router.get('/sleep/status', (req, res) => {
  res.json({
    isSleeping: sleepMode.isSleeping,
    sleepTimerRemaining: sleepMode.getSleepTimerRemaining(),
    logCount: sleepMode.getLogs(1000000).length,
  });
});

router.get('/sleep/log', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 200;
  const logs = sleepMode.getLogs(limit);
  res.json({
    status: {
      isSleeping: sleepMode.isSleeping,
      logCount: sleepMode.getLogs(1000000).length,
      sleepTimerRemaining: sleepMode.getSleepTimerRemaining(),
    },
    logs,
  });
});

router.delete('/sleep/log', (req, res) => {
  sleepMode.clearLogs();
  res.json({ success: true });
});

module.exports = router;
