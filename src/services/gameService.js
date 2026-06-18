/**
 * Игровой сервис
 * Промежуточный слой между Telegram ботом и игровым движком
 * Управляет жизненным циклом игр, обработкой действий игроков — через Supabase
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger').withContext('GameService');
const db = require('../database/supabase-queries');
const gameEngine = require('../bot/game');
const roomManager = require('../bot/game/room');
const { agentManager } = require('../../ai-agents/agentManager');

/**
 * Обрабатывает запрос на старт игры
 * @param {string} roomCode - Код комнаты
 * @param {number} creatorId - ID создателя
 * @returns {Promise<object>} Результат
 */
const handleStartGame = async (roomCode, creatorId) => {
  try {
    const room = await roomManager.findRoomByCode(roomCode);
    if (!room) {
      return { success: false, message: '❌ Комната не найдена.' };
    }

    if (room.creatorId !== creatorId) {
      return { success: false, message: '⛔ Только создатель может начать игру.' };
    }

    if (room.players.length < 4) {
      return { success: false, message: `❌ Нужно минимум 4 игрока. Сейчас: ${room.players.length}` };
    }

    // Дозаполняем AI-агентами, если нужно (до 6 игроков минимум для хорошей игры)
    let targetCount = Math.max(6, Math.min(room.players.length, room.maxPlayers));
    if (room.players.length < targetCount) {
      const added = await agentManager.fillRoomWithAgents(room, targetCount);
      if (added.length > 0) {
        await db.rooms.update(room.code, { players: room.players });
        roomManager.activeRooms.set(room.code, room);
      }
    }

    const game = await gameEngine.startGame(roomCode);
    return { success: true, game };

  } catch (error) {
    logger.error(`Ошибка старта игры: ${error.message}`);
    return { success: false, message: `❌ Ошибка: ${error.message}` };
  }
};

/**
 * Обрабатывает голос игрока
 * @param {number} voterId - ID голосующего
 * @param {number} targetId - ID цели
 * @param {string} gameId - ID игры
 * @returns {Promise<object>} Результат
 */
const handleVote = async (voterId, targetId, gameId) => {
  try {
    const game = await db.games.findByGameId(gameId);
    if (!game || game.phase !== 'vote') {
      return { success: false, message: '❌ Сейчас не фаза голосования.' };
    }

    const voter = game.players.find(p => p.telegramId === voterId);
    if (!voter || !voter.isAlive) {
      return { success: false, message: '❌ Вы не можете голосовать.' };
    }

    // Сохраняем голос
    const actions = [...game.actions];
    const existingVoteIndex = actions.findIndex(
      a => a.actorId === voterId && a.action === 'vote' && a.round === game.round
    );

    if (existingVoteIndex >= 0) {
      actions[existingVoteIndex].targetId = targetId;
    } else {
      actions.push({
        phase: 'vote',
        round: game.round,
        actorId: voterId,
        targetId,
        action: 'vote',
        timestamp: new Date().toISOString(),
      });
    }

    await db.games.update(gameId, { actions });

    return { success: true, message: '✅ Голос принят!' };
  } catch (error) {
    logger.error(`Ошибка голосования: ${error.message}`);
    return { success: false, message: '❌ Ошибка голосования.' };
  }
};

/**
 * Обрабатывает ночное действие игрока
 * @param {number} actorId - ID действующего игрока
 * @param {number} targetId - ID цели
 * @param {string} gameId - ID игры
 * @param {string} action - Тип действия
 * @returns {Promise<object>} Результат
 */
const handleNightAction = async (actorId, targetId, gameId, action) => {
  try {
    const game = await db.games.findByGameId(gameId);
    if (!game || game.phase !== 'night') {
      return { success: false, message: '❌ Сейчас не ночная фаза.' };
    }

    const players = [...game.players];
    const player = players.find(p => p.telegramId === actorId);
    if (!player || !player.isAlive) {
      return { success: false, message: '❌ Вы не можете действовать.' };
    }

    const target = players.find(p => p.telegramId === targetId);
    if (!target || !target.isAlive) {
      return { success: false, message: '❌ Цель не найдена или мертва.' };
    }

    // Сохраняем ночное действие
    player.nightActions = player.nightActions || [];
    player.nightActions.push({
      round: game.round,
      action,
      targetId,
      success: true,
    });

    const actions = [...game.actions];
    actions.push({
      phase: 'night',
      round: game.round,
      actorId,
      targetId,
      action,
      timestamp: new Date().toISOString(),
    });

    await db.games.update(gameId, { players, actions });

    return { success: true, message: '🌙 Действие принято!' };
  } catch (error) {
    logger.error(`Ошибка ночного действия: ${error.message}`);
    return { success: false, message: '❌ Ошибка действия.' };
  }
};

/**
 * Получает состояние игры для конкретного игрока
 * @param {string} gameId - ID игры
 * @param {number} playerId - ID игрока
 * @returns {Promise<object|null>} Состояние игры
 */
const getGameStateForPlayer = async (gameId, playerId) => {
  try {
    const game = await db.games.findByGameId(gameId);
    if (!game) return null;

    const player = game.players.find(p => p.telegramId === playerId);

    // Формируем безопасное состояние (без ролей других игроков)
    const safeState = {
      gameId: game.gameId,
      phase: game.phase,
      round: game.round,
      status: game.status,
      winner: game.winner,
      players: game.players.map(p => ({
        telegramId: p.telegramId,
        firstName: p.firstName,
        isAlive: p.isAlive,
        seatNumber: p.seatNumber,
        isReady: p.isAlive,
        role: p.telegramId === playerId ? p.role : undefined,
      })),
      actions: game.actions.slice(-20),
      gameLog: game.gameLog?.slice(-10),
      myRole: player?.role || null,
      isAlive: player?.isAlive || false,
    };

    return safeState;
  } catch (error) {
    logger.error(`Ошибка получения состояния игры: ${error.message}`);
    return null;
  }
};

/**
 * Получает историю игр игрока
 * @param {number} telegramId - ID игрока
 * @param {number} limit - Лимит
 * @returns {Promise<Array>} История игр
 */
const getPlayerGameHistory = async (telegramId, limit = 10) => {
  try {
    const games = await db.games.find(
      { status: 'finished', playerTelegramId: telegramId },
      { sortBy: 'created_at', sortDir: 'desc', limit }
    );

    return games.map(game => {
      const playerData = game.players.find(p => p.telegramId === telegramId);
      const isWinner = (
        (game.winner === 'mafia' && ['mafia', 'don'].includes(playerData?.role)) ||
        (game.winner === 'peaceful' && !['mafia', 'don', 'maniac'].includes(playerData?.role)) ||
        (game.winner === 'maniac' && playerData?.role === 'maniac')
      );

      return {
        gameId: game.gameId,
        date: game.createdAt,
        role: playerData?.role,
        isAlive: playerData?.isAlive,
        winner: game.winner,
        isWinner,
        roundDied: playerData?.roundDied || -1,
        round: game.round,
      };
    });
  } catch (error) {
    logger.error(`Ошибка истории игр: ${error.message}`);
    return [];
  }
};

/**
 * Отменяет игру
 * @param {string} gameId - ID игры
 * @returns {Promise<object>} Результат
 */
const cancelGame = async (gameId) => {
  try {
    const game = await db.games.findByGameId(gameId);
    if (!game) return { success: false, message: '❌ Игра не найдена.' };

    await db.games.update(gameId, {
      status: 'cancelled',
      phase: 'finished',
      phaseTimestamps: { ...game.phaseTimestamps, finishedAt: new Date().toISOString() },
    });

    // Освобождаем агентов
    agentManager.releaseAgentsInRoom(game.roomCode);

    return { success: true, message: '✅ Игра отменена.' };
  } catch (error) {
    logger.error(`Ошибка отмены игры: ${error.message}`);
    return { success: false, message: '❌ Ошибка отмены.' };
  }
};

module.exports = {
  handleStartGame,
  handleVote,
  handleNightAction,
  getGameStateForPlayer,
  getPlayerGameHistory,
  cancelGame,
};
