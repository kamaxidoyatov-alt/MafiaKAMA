/**
 * Менеджер дневной фазы
 * Управляет обсуждением, подозрениями и подготовкой к голосованию
 */

const logger = require('../../../utils/logger').withContext('DayPhase');

/**
 * Запускает дневную фазу
 * @param {object} game - Состояние игры
 * @param {object} nightResults - Результаты ночной фазы
 * @returns {Promise<object>} Результаты дневной фазы
 */
const runDayPhase = async (game, nightResults) => {
  const dayState = {
    discussions: [],
    accusations: [],
    defenses: [],
    messages: [],
  };

  // Уведомление о результатах ночи
  const nightMessage = getDayStartMessage(game, nightResults);
  dayState.messages.push(nightMessage);

  // Симуляция обсуждения (для AI-агентов)
  if (game.players.some(p => p.aiPersonality)) {
    dayState.discussions = await simulateDayDiscussion(game, nightResults);
  }

  return dayState;
};

/**
 * Создаёт сообщение о начале дня
 * @param {object} game - Состояние игры
 * @param {object} nightResults - Результаты ночи
 * @returns {string} Текст сообщения
 */
const getDayStartMessage = (game, nightResults) => {
  const alivePlayers = game.players.filter(p => p.isAlive);
  
  let message = '☀️ **ДЕНЬ**\n\n';
  message += `Раунд ${game.round}\n\n`;

  if (nightResults.diedDuringNight.length > 0) {
    message += '💀 **Ночные жертвы:**\n';
    for (const victim of nightResults.diedDuringNight) {
      message += `• ${victim.firstName}\n`;
    }
    message += '\n';
  } else {
    message += '✅ Ночь прошла спокойно. Все живы.\n\n';
  }

  message += `👥 **Осталось игроков:** ${alivePlayers.length}\n\n`;
  message += '🗣️ **Обсуждение:**\n';
  message += 'Вы можете высказывать свои подозрения. Используйте кнопки ниже для действий.\n';

  return message;
};

/**
 * Симулирует обсуждение для AI-агентов
 * @param {object} game - Состояние игры
 * @param {object} nightResults - Результаты ночи
 * @returns {Promise<Array>} Массив обсуждений
 */
const simulateDayDiscussion = async (game, nightResults) => {
  // Для AI-агентов — используем LLM для генерации обсуждения
  // Для реальных игроков — ожидаем ввод
  const discussions = [];

  const aiPlayers = game.players.filter(p => p.aiPersonality && p.isAlive);

  for (const player of aiPlayers) {
    // Формируем контекст для AI
    const context = buildDiscussionContext(game, player, nightResults);
    discussions.push({
      playerId: player.telegramId,
      firstName: player.firstName,
      context,
    });
  }

  return discussions;
};

/**
 * Формирует контекст для обсуждения AI-агента
 * @param {object} game - Состояние игры
 * @param {object} player - Игрок
 * @param {object} nightResults - Результаты ночи
 * @returns {object} Контекст
 */
const buildDiscussionContext = (game, player, nightResults) => {
  const alivePlayers = game.players.filter(p => p.isAlive);
  const deadPlayers = game.players.filter(p => !p.isAlive);

  return {
    yourRole: player.role,
    yourName: player.firstName,
    alivePlayers: alivePlayers.map(p => ({
      id: p.telegramId,
      name: p.firstName,
      seatNumber: p.seatNumber,
    })),
    deadPlayers: deadPlayers.map(p => ({
      name: p.firstName,
      killedBy: p.killedByMafia ? 'mafia' : p.killedByManiac ? 'maniac' : p.executedByVote ? 'vote' : 'unknown',
    })),
    nightVictims: nightResults.diedDuringNight,
    round: game.round,
    memory: player.aiMemory || [],
  };
};

module.exports = {
  runDayPhase,
  getDayStartMessage,
  buildDiscussionContext,
};
