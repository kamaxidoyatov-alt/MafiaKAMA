/**
 * API маршруты для управления комнатами
 */

const express = require('express');
const router = express.Router();
const { findRoomByCode, getPublicRooms } = require('../../bot/game/room');

// GET /api/rooms — список публичных комнат
router.get('/', async (req, res) => {
  try {
    const rooms = await getPublicRooms();
    res.json({ rooms });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/rooms/:code — информация о комнате
router.get('/:code', async (req, res) => {
  try {
    const room = await findRoomByCode(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });
    res.json({ room });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
