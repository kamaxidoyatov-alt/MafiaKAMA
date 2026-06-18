const express = require('express');
const router = express.Router();
const playerService = require('../../services/playerService');
const statsService = require('../../services/statsService');

router.get('/', async (req, res) => {
  try {
    const top = await statsService.getLeaderboards();
    res.json(top);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:telegramId', async (req, res) => {
  try {
    const stats = await playerService.getPlayerStats(parseInt(req.params.telegramId));
    if (!stats) return res.status(404).json({ error: 'Игрок не найден' });
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
