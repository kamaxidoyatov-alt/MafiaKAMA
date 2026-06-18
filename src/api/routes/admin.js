const express = require('express');
const router = express.Router();
const statsService = require('../../services/statsService');
const db = require('../../database/supabase-queries');

router.get('/stats', async (req, res) => {
  try {
    const stats = await statsService.getSystemStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const logs = await statsService.getRecentLogs(100);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Назначает пользователя админом по Telegram ID
 * @param {number} telegramId - ID пользователя в Telegram
 * @returns {Promise<object>} Результат операции
 */
async function makeAdmin(telegramId) {
  const parsedId = parseInt(telegramId);
  if (isNaN(parsedId) || parsedId <= 0) {
    throw new Error('Некорректный telegramId');
  }

  let user = await db.users.findByTelegramId(parsedId);

  if (!user) {
    user = await db.users.create({
      telegramId: parsedId,
      username: 'admin',
      firstName: 'Admin',
      isAdmin: true,
      lastActiveAt: new Date(),
    });
    return { created: true, message: 'Новый пользователь создан и назначен админом' };
  }

  await db.users.update(parsedId, { isAdmin: true });
  return { created: false, message: `Пользователь ${user.firstName} теперь админ` };
}

// POST /api/admin/make-admin — назначить админом (JSON body)
router.post('/make-admin', async (req, res) => {
  try {
    const { telegramId } = req.body;
    if (!telegramId) {
      return res.status(400).json({ error: 'telegramId обязателен' });
    }
    const result = await makeAdmin(telegramId);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/make-admin/:telegramId — назначить админом через URL
router.get('/make-admin/:telegramId', async (req, res) => {
  try {
    const result = await makeAdmin(req.params.telegramId);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
