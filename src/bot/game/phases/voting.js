/**
 * Менеджер фазы голосования
 * Управляет голосованием игроков и определяет результат
 */

const logger = require('../../../utils/logger').withContext('Voting');

/**
 * Запускает фазу голосования
 * @param {object} game - Состояние игры
 * @param {Array} votes - Массив голосов [{ voterId, targetId }]
 * @returns {Promise<object>} Результат голосования
 */
const runVotingPhase = async (game, votes = []) => {
  const alivePlayers = game.players.filter(p => p.isAlive);
  const result = {
    votes: [],
    voteCount: {},
    totalVotes: 0,
    executedId: null,
    executedName: null,
    executedRole: null,
    tie: false,
    messages: [],
  };

  // Если голоса не переданы, генерируем для AI-агентов
  const votingData = votes.length > 0 ? votes : await generateAIVotes(game);

  // Подсчитываем голоса
  for (const vote of votingData) {
    if (vote.targetId) {
      result.votes.push(vote);
      result.voteCount[vote.targetId] = (result.voteCount[vote.targetId] || 0) + 1;
      result.totalVotes++;
    }
  }

  // Определяем, кто набрал больше всего голосов
  let maxVotes = 0;
  let topCandidates = [];

  for (const [targetId, count] of Object.entries(result.voteCount)) {
    if (count > maxVotes) {
      maxVotes = count;
      topCandidates = [parseInt(targetId)];
    } else if (count === maxVotes) {
      topCandidates.push(parseInt(targetId));
    }
  }

  // Проверка на ничью
  if (topCandidates.length > 1) {
    result.tie = true;
    result.messages.push('🤝 Ничья — никто не исключён');
  } else if (topCandidates.length === 1) {
    const executedId = topCandidates[0];
    const executed = game.players.find(p => p.telegramId === executedId);

    if (executed) {
      executed.isAlive = false;
      executed.executedByVote = true;
      executed.roundDied = game.round;

      result.executedId = executedId;
      result.executedName = executed.firstName;
      result.executedRole = executed.role;

      result.messages.push(
        `⚖️ По результатам голосования исключён игрок ${executed.firstName} (${getRoleDisplayName(executed.role)})`
      );
    }
  }

  result.voteCountDisplay = formatVoteCount(game, result.voteCount);
  return result;
};

/**
 * Генерирует голоса для AI-агентов
 * @param {object} game - Состояние игры
 * @returns {Promise<Array>} Массив голосов
 */
const generateAIVotes = async (game) => {
  const votes = [];
  const alivePlayers = game.players.filter(p => p.isAlive);

  for (const player of alivePlayers) {
    // Для AI-агентов — используем их логику
    if (player.aiPersonality) {
      const target = await getAIVoteTarget(game, player);
      votes.push({ voterId: player.telegramId, targetId: target });
    } else {
      // Для реальных игроков — ожидаем ввод
      // Пока пропускаем, голоса будут добавлены позже
    }
  }

  return votes;
};

/**
 * Определяет цель голосования AI-агента
 * @param {object} game - Состояние игры
 * @param {object} player - Игрок-AI
 * @returns {Promise<number|null>} ID цели
 */
const getAIVoteTarget = async (game, player) => {
  const aliveOthers = game.players.filter(p => p.isAlive && p.telegramId !== player.telegramId);
  if (aliveOthers.length === 0) return null;

  // На основе памяти и подозрений
  const suspicions = player.aiMemory?.suspicions || {};

  // Если есть подозрения, голосуем за самого подозрительного
  if (Object.keys(suspicions).length > 0) {
    const sorted = Object.entries(suspicions).sort((a, b) => b[1] - a[1]);
    const topSuspicion = parseInt(sorted[0][0]);
    if (aliveOthers.some(p => p.telegramId === topSuspicion)) {
      return topSuspicion;
    }
  }

  // Иначе случайный выбор
  const randomTarget = aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
  return randomTarget.telegramId;
};

/**
 * Форматирует подсчёт голосов для отображения
 * @param {object} game - Состояние игры
 * @param {object} voteCount - Объект с подсчётом голосов
 * @returns {string} Отформатированный текст
 */
const formatVoteCount = (game, voteCount) => {
  let text = '📊 **Результаты голосования:**\n\n';

  const sorted = Object.entries(voteCount).sort((a, b) => b[1] - a[1]);

  for (const [playerId, count] of sorted) {
    const player = game.players.find(p => p.telegramId === parseInt(playerId));
    if (player) {
      text += `${player.firstName}: ${count} голос(ов)\n`;
    }
  }

  if (sorted.length === 0) {
    text += 'Голосов не было.\n';
  }

  return text;
};

/**
 * Получает отображаемое имя роли
 * @param {string} roleId - ID роли
 * @returns {string} Отображаемое имя
 */
const getRoleDisplayName = (roleId) => {
  const roleNames = {
    peaceful: 'Мирный житель',
    mafia: 'Мафия',
    don: 'Дон',
    commissar: 'Комиссар',
    doctor: 'Доктор',
    maniac: 'Маньяк',
    sheriff: 'Шериф',
    bodyguard: 'Телохранитель',
    mistress: 'Любовница',
  };
  return roleNames[roleId] || roleId || 'Неизвестно';
};

module.exports = {
  runVotingPhase,
  generateAIVotes,
  formatVoteCount,
  getRoleDisplayName,
};
