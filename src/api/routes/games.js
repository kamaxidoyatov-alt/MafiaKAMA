const express = require('express');
const router = express.Router();
const db = require('../../database/supabase-queries');
const gameService = require('../../services/gameService');

router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const games = await db.games.find({}, { sortBy: 'created_at', sortDir: 'desc', limit });
    res.json({ games, total: games.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/active', async (req, res) => {
  try {
    const games = await db.games.find({ status: 'in_progress' }, { limit: 100 });
    res.json({ games, count: games.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:gameId', async (req, res) => {
  try {
    const game = await db.games.findByGameId(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
