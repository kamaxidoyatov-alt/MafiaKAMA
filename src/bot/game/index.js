/**
 * Главный движок игры «Мафия»
 * Управляет полным жизненным циклом игры: от старта до завершения
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger').withContext('GameEngine');
const db = require('../../database/supabase-queries');
const { distributeRoles, getRole } = require('./roles');
const { runNightPhase, getNightResultsMessage } = require('./phases/night');
const { runDayPhase } = require('./phases/day');
const { runVotingPhase, getRoleDisplayName } = require('./phases/voting');
const { activeRooms } = require('./room');

// Хранилище активных игр (in-memory для быстрого доступа)
const activeGames = new Map();

// Таймеры фаз
const phaseTimers = new Map();

// WebSocket для отправки обновлений
let io = null;

/**
 * Устанавливает WebSocket соединение для отправки обновлений
 * @param {object} socketIO - Экземпляр Socket.IO
 */
const setSocketIO = (socketIO) => {
  io = socketIO;
};

/**
 * Запускает новую игру в комнате
 * @param {string} roomCode - Код комнаты
 * @returns {Promise<object>} Игра
 */
const startGame = async (roomCode) => {
  const room = activeRooms.get(roomCode) || await db.rooms.findByCode(roomCode);
  if (!room) throw new Error('Комната не найдена');

  if (room.players.length < 4) {
    throw new Error('Недостаточно игроков для старта (минимум 4)');
  }

  // Создаём игру
  const gameId = uuidv4();
  const players = room.players.map(p => ({
    telegramId: p.telegramId,
    username: p.username,
    firstName: p.firstName,
    role: null,
    isAlive: true,
    seatNumber: p.seatNumber,
    nightActions: [],
    votesReceived: [],
  }));

  // Распределяем роли
  const roles = distributeRoles(players.length, room.settings.roles);
  players.forEach((p, idx) => {
    p.role = roles[idx];
  });

  const game = await db.games.create({
    gameId,
    roomCode,
    status: 'in_progress',
    phase: 'night',
    round: 1,
    players,
    maxPlayers: room.maxPlayers,
    phaseDurations: {
      day: room.settings.dayDuration || 60,
      night: room.settings.nightDuration || 45,
      vote: room.settings.voteDuration || 40,
    },
    isRanked: room.settings.isRanked !== false,
  });

  // Обновляем статус комнаты
  room.status = 'playing';
  room.currentGameId = gameId;
  const roomUpdated = await db.rooms.update(roomCode, { status: 'playing', currentGameId: gameId });
  if (roomUpdated) Object.assign(room, roomUpdated);
  activeRooms.set(roomCode, room);
  activeGames.set(gameId, game);

  // Логируем старт игры
  await db.gameLogs.create({
    gameId, roomCode, round: 0, phase: 'lobby', eventType: 'game_start',
    message: `Игра началась! ${players.length} игроков.`,
    metadata: { playerCount: players.length, roles },
  });

  logger.info(`Игра ${gameId} началась в комнате ${roomCode} с ${players.length} игроками`);

  // Отправляем роли игрокам
  await sendRolesToPlayers(game);

  // Запускаем первую ночь
  await startNightPhase(game);

  // Отправляем обновление через WebSocket
  emitGameUpdate(game);

  return game;
};

/**
 * Отправляет роли игрокам
 * @param {object} game - Состояние игры
 */
const sendRolesToPlayers = async (game) => {
  for (const player of game.players) {
    const RoleClass = getRole(player.role);
    if (!RoleClass) continue;

    const roleInstance = new RoleClass();
    const hint = roleInstance.getHint();

    // Для реальных игроков — отправляем через бота
    // Для AI-агентов — сохраняем в память
    if (player.aiPersonality) {
      player.aiMemory = player.aiMemory || {};
      player.aiMemory.myRole = player.role;
      player.aiMemory.roleHint = hint;
    }

    // Здесь будет отправка сообщения через Telegram бота
    logger.debug(`Роль игрока ${player.firstName}: ${player.role}`);
  }
};

/**
 * Запускает ночную фазу
 * @param {object} game - Состояние игры
 */
const startNightPhase = async (game) => {
  game.phase = 'night';
  game.phaseTimestamps.nightStartedAt = new Date();
  await db.games.update(game.gameId, { phase: 'night', phaseTimestamps: game.phaseTimestamps });

  await db.gameLogs.create({
    gameId: game.gameId, roomCode: game.roomCode, round: game.round, phase: 'night', eventType: 'phase_change',
    message: `🌙 Раунд ${game.round}. Наступила ночь.`,
  });

  // Отправляем информацию ролям об их действиях
  for (const player of game.players.filter(p => p.isAlive)) {
    const RoleClass = getRole(player.role);
    if (!RoleClass) continue;
    const roleInstance = new RoleClass();

    if (roleInstance.canActAtNight) {
      const actionDesc = roleInstance.getNightActionDescription(game, player.telegramId);
      // Отправляем игроку запрос на действие
    }
  }

  // Запускаем таймер ночи
  startPhaseTimer(game, 'night', async () => {
    await resolveNightPhase(game);
  });

  emitGameUpdate(game);
};

/**
 * Завершает ночную фазу и применяет результаты
 * @param {object} game - Состояние игры
 */
const resolveNightPhase = async (game) => {
  clearPhaseTimer(game.gameId);

  // Выполняем ночные действия
  const { nightState, nightResults } = await runNightPhase(game);

  // Логируем результаты ночи
  await db.gameLogs.create({
    gameId: game.gameId, roomCode: game.roomCode, round: game.round, phase: 'night', eventType: 'night_action',
    message: getNightResultsMessage(nightResults),
    metadata: nightResults,
  });

  // Сохраняем ночные результаты в игру
  game.nightResults.push({
    round: game.round,
    mafiaTarget: nightState.mafiaTarget,
    mafiaTargetSavedByDoctor: nightResults.savedByDoctor,
    mafiaTargetProtectedByBodyguard: nightResults.protectedByBodyguard,
    maniacTarget: nightState.maniacTarget,
    doctorHeal: nightState.doctorHeal,
    commissarCheck: nightState.commissarCheck?.targetId || null,
    commissarCheckResult: nightState.commissarCheck?.team || null,
    sheriffCheck: nightState.sheriffCheck?.targetId || null,
    sheriffCheckResult: nightState.sheriffCheck?.isMafia ? 'mafia' : 'peaceful',
    bodyguardProtect: nightState.bodyguardProtect,
    mistressVisit: nightState.mistressVisit,
  });

  await db.games.update(game.gameId, { nightResults: game.nightResults, players: game.players });
  activeGames.set(game.gameId, game);

  // Проверяем условия победы
  const winner = checkWinCondition(game);
  if (winner) {
    await endGame(game, winner);
    return;
  }

  // Переходим к дню
  await startDayPhase(game, nightResults);

  emitGameUpdate(game);
};

/**
 * Запускает дневную фазу
 * @param {object} game - Состояние игры
 * @param {object} nightResults - Результаты ночи
 */
const startDayPhase = async (game, nightResults) => {
  game.phase = 'day';
  game.phaseTimestamps.dayStartedAt = new Date();
  await db.games.update(game.gameId, { phase: 'day', phaseTimestamps: game.phaseTimestamps });

  const dayState = await runDayPhase(game, nightResults);

  await db.gameLogs.create({
    gameId: game.gameId, roomCode: game.roomCode, round: game.round, phase: 'day', eventType: 'phase_change',
    message: `☀️ Раунд ${game.round}. Наступил день.`,
  });

  // Отправляем информацию о результатах ночи всем игрокам
  // TODO: отправить через Telegram бота

  // Запускаем таймер дня
  startPhaseTimer(game, 'day', async () => {
    await startVotingPhase(game);
  });

  emitGameUpdate(game);
};

/**
 * Запускает фазу голосования
 * @param {object} game - Состояние игры
 */
const startVotingPhase = async (game) => {
  game.phase = 'vote';
  game.phaseTimestamps.voteStartedAt = new Date();
  await db.games.update(game.gameId, { phase: 'vote', phaseTimestamps: game.phaseTimestamps });

  await db.gameLogs.create({
    gameId: game.gameId, roomCode: game.roomCode, round: game.round, phase: 'vote', eventType: 'phase_change',
    message: '🗳️ Началось голосование!',
  });

  // Симулируем голоса AI-агентов
  const voteResult = await runVotingPhase(game);

  await db.gameLogs.create({
    gameId: game.gameId, roomCode: game.roomCode, round: game.round, phase: 'vote', eventType: 'vote_result',
    message: voteResult.messages.join('\n'),
    metadata: { voteCount: voteResult.voteCount, executedId: voteResult.executedId },
  });

  await db.games.update(game.gameId, { players: game.players, actions: game.actions, lastVoteResult: game.lastVoteResult });
  activeGames.set(game.gameId, game);

  // Проверяем победу
  const winner = checkWinCondition(game);
  if (winner) {
    await endGame(game, winner);
    return;
  }

  // Увеличиваем раунд и начинаем новую ночь
  game.round++;
  await db.games.update(game.gameId, { round: game.round });
  await startNightPhase(game);

  emitGameUpdate(game);
};

/**
 * Проверяет условия победы
 * @param {object} game - Состояние игры
 * @returns {string|null} Победившая команда или null
 */
const checkWinCondition = (game) => {
  const alivePlayers = game.players.filter(p => p.isAlive);
  if (alivePlayers.length === 0) return 'draw';

  // Проверка победы мафии
  const mafiaAlive = alivePlayers.filter(p => ['mafia', 'don'].includes(p.role)).length;
  const peacefulAlive = alivePlayers.filter(p => !['mafia', 'don', 'maniac'].includes(p.role)).length;
  const maniacAlive = alivePlayers.filter(p => p.role === 'maniac').length;

  // Мафия победила: мафии больше или равно количеству мирных (без маньяка)
  if (mafiaAlive >= peacefulAlive && mafiaAlive > 0) {
    return 'mafia';
  }

  // Мирные победили: вся мафия мертва
  if (mafiaAlive === 0 && maniacAlive === 0) {
    return 'peaceful';
  }

  // Маньяк победил: остался один
  if (alivePlayers.length === 1 && maniacAlive === 1) {
    return 'maniac';
  }

  return null;
};

/**
 * Завершает игру
 * @param {object} game - Состояние игры
 * @param {string} winner - Победившая команда
 */
const endGame = async (game, winner) => {
  clearPhaseTimer(game.gameId);

  game.status = 'finished';
  game.phase = 'finished';
  game.winner = winner;
  game.phaseTimestamps.finishedAt = new Date();
  await db.games.update(game.gameId, {
    status: 'finished', phase: 'finished', winner,
    phaseTimestamps: game.phaseTimestamps,
    players: game.players,
    actions: game.actions,
    nightResults: game.nightResults,
  });

  // Обновляем комнату
  const room = activeRooms.get(game.roomCode);
  if (room) {
    room.status = 'finished';
    room.currentGameId = null;
    await db.rooms.update(game.roomCode, { status: 'finished', currentGameId: null });
    activeRooms.delete(game.roomCode);
  }

  // Обновляем статистику игроков
  await updatePlayerStats(game, winner);

  activeGames.delete(game.gameId);

  await db.gameLogs.create({
    gameId: game.gameId, roomCode: game.roomCode, round: game.round, phase: 'finished', eventType: 'game_end',
    message: `🏆 Игра завершена! Победила команда "${winner}"`,
    metadata: { winner },
  });

  logger.info(`Игра ${game.gameId} завершена. Победитель: ${winner}`);

  emitGameUpdate(game);
};

/**
 * Обновляет статистику игроков после игры
 * @param {object} game - Состояние игры
 * @param {string} winner - Победитель
 */
const updatePlayerStats = async (game, winner) => {
  for (const player of game.players) {
    try {
      const user = await db.users.findByTelegramId(player.telegramId);
      if (!user) continue;

      const isWinner = (
        (winner === 'mafia' && ['mafia', 'don'].includes(player.role)) ||
        (winner === 'peaceful' && !['mafia', 'don', 'maniac'].includes(player.role)) ||
        (winner === 'maniac' && player.role === 'maniac')
      );

      user.stats.totalGames++;
      if (isWinner) {
        user.stats.wins++;
        user.rating += 25;
      } else {
        user.stats.losses++;
        user.rating = Math.max(100, user.rating - 15);
      }

      if (player.killedByMafia || player.killedByManiac) {
        user.stats.deaths++;
      } else if (player.isAlive) {
        user.stats.survived++;
      }

      // Статистика по ролям
      const roleKey = `winsAs${player.role.charAt(0).toUpperCase() + player.role.slice(1)}`;
      if (isWinner && user.stats[roleKey] !== undefined) {
        user.stats[roleKey]++;
      }

      user.ratingHistory.push({
        date: new Date(),
        rating: user.rating,
        change: isWinner ? 25 : -15,
      });

      await db.users.update(player.telegramId, {
        stats: user.stats,
        rating: user.rating,
        ratingHistory: user.ratingHistory,
      });
    } catch (error) {
      if (error.message !== 'User not found') {
        logger.error(`Ошибка обновления статистики игрока ${player.telegramId}: ${error.message}`);
      }
    }
  }
};

/**
 * Запускает таймер фазы
 * @param {object} game - Состояние игры
 * @param {string} phase - Фаза
 * @param {Function} callback - Функция по истечению времени
 */
const startPhaseTimer = (game, phase, callback) => {
  clearPhaseTimer(game.gameId);

  const duration = game.phaseDurations[phase] || 60;
  const timer = setTimeout(async () => {
    try {
      await callback();
    } catch (error) {
      logger.error(`Ошибка в таймере фазы ${phase} игры ${game.gameId}: ${error.message}`);
    }
  }, duration * 1000);

  phaseTimers.set(game.gameId, timer);
};

/**
 * Очищает таймер фазы
 * @param {string} gameId - ID игры
 */
const clearPhaseTimer = (gameId) => {
  if (phaseTimers.has(gameId)) {
    clearTimeout(phaseTimers.get(gameId));
    phaseTimers.delete(gameId);
  }
};

/**
 * Отправляет обновление игры через WebSocket
 * @param {object} game - Состояние игры
 */
const emitGameUpdate = (game) => {
  if (!io) return;

  const safeData = {
    gameId: game.gameId,
    roomCode: game.roomCode,
    phase: game.phase,
    round: game.round,
    status: game.status,
    winner: game.winner,
    players: game.players.map(p => ({
      telegramId: p.telegramId,
      firstName: p.firstName,
      isAlive: p.isAlive,
      seatNumber: p.seatNumber,
      role: p.role === game.phase === 'finished' ? p.role : undefined,
    })),
  };

  io.to(`game:${game.gameId}`).emit('gameUpdate', safeData);
  io.to(`room:${game.roomCode}`).emit('roomUpdate', safeData);
};

/**
 * Восстанавливает активные игры после перезапуска сервера
 * @returns {Promise<void>}
 */
const recoverGames = async () => {
  logger.info('Восстановление активных игр...');

  const activeGamesFromDB = await db.games.find({ status: 'in_progress' }, { limit: 100 });

  for (const game of activeGamesFromDB) {
    activeGames.set(game.gameId, game);
    logger.info(`Восстановлена игра ${game.gameId} (фаза: ${game.phase}, раунд: ${game.round})`);
  }

  logger.info(`Восстановлено ${activeGamesFromDB.length} активных игр`);
};

/**
 * Получает активную игру по ID
 * @param {string} gameId - ID игры
 * @returns {object|null} Игра
 */
const getActiveGame = (gameId) => {
  return activeGames.get(gameId) || null;
};

/**
 * Получает игру по коду комнаты
 * @param {string} roomCode - Код комнаты
 * @returns {Promise<object|null>} Игра
 */
const getGameByRoomCode = async (roomCode) => {
  // Сначала проверяем activeGames
  for (const [id, game] of activeGames) {
    if (game.roomCode === roomCode) return game;
  }
  // Ищем в БД
  const games = await db.games.find({ roomCode, status: 'in_progress' }, { limit: 1 });
  return games[0] || null;
};

module.exports = {
  setSocketIO,
  startGame,
  getActiveGame,
  getGameByRoomCode,
  recoverGames,
  activeGames,
  checkWinCondition,
};
