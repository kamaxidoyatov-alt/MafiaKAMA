/**
 * Админ-панель (веб-интерфейс)
 * Express маршруты для EJS шаблонов
 */

const express = require('express');
const router = express.Router();
const statsService = require('../../services/statsService');
const db = require('../../database/supabase-queries');
const { agentManager } = require('../../../ai-agents/agentManager');

// Дашборд
router.get('/', async (req, res) => {
  try {
    const stats = await statsService.getSystemStats();
    res.render('dashboard', { stats, title: 'Админ-панель | MafiaBOT' });
  } catch (error) {
    res.status(500).send(`<h1>Ошибка</h1><p>${error.message}</p>`);
  }
});

// Комнаты
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await db.rooms.findPublicWaiting(50);
    res.render('rooms', { rooms, title: 'Комнаты | MafiaBOT' });
  } catch (error) {
    res.status(500).send(`<h1>Ошибка</h1><p>${error.message}</p>`);
  }
});

// Игроки
router.get('/players', async (req, res) => {
  try {
    const players = await db.users.findAll({ sortBy: 'rating', sortDir: 'desc', limit: 100 });
    res.render('players', { players, title: 'Игроки | MafiaBOT' });
  } catch (error) {
    res.status(500).send(`<h1>Ошибка</h1><p>${error.message}</p>`);
  }
});

// Логи
router.get('/logs', async (req, res) => {
  try {
    const logs = await statsService.getRecentLogs(100);
    res.render('logs', { logs, title: 'Логи | MafiaBOT' });
  } catch (error) {
    res.status(500).send(`<h1>Ошибка</h1><p>${error.message}</p>`);
  }
});

// Аналитика
router.get('/analytics', async (req, res) => {
  try {
    const dailyStats = await statsService.getDailyStats(30);
    const roleStats = await statsService.getRoleStats();
    res.render('analytics', { dailyStats, roleStats, title: 'Аналитика | MafiaBOT' });
  } catch (error) {
    res.status(500).send(`<h1>Ошибка</h1><p>${error.message}</p>`);
  }
});

// Сервер
router.get('/server', async (req, res) => {
  try {
    const config = require('../../config');
    const agentStats = agentManager.getAgentStats();
    const cache = require('../../database/cache');
    const cacheStats = cache.getStats();
    
    res.render('server', {
      config,
      agentStats,
      cacheStats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      title: 'Сервер | MafiaBOT',
    });
  } catch (error) {
    res.status(500).send(`<h1>Ошибка</h1><p>${error.message}</p>`);
  }
});

// ── Sleep mode page ──
router.get('/sleep', async (req, res) => {
  try {
    res.render('sleep', { title: 'Активность бота | MafiaBOT' });
  } catch (error) {
    res.status(500).send(`<h1>Ошибка</h1><p>${error.message}</p>`);
  }
});

module.exports = router;
