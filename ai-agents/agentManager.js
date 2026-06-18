/**
 * Менеджер AI-агентов
 * Управляет всеми 60 AI-агентами, их состояниями и действиями
 * Поддерживает параллельную работу нескольких агентов в разных играх
 */

const AgentMemory = require('./memory');
const { getRandomPersonality, getAllPersonalities } = require('./personalities');
const { getAIDecision, getAINightTarget } = require('../src/services/llmService');
const logger = require('../src/utils/logger').withContext('AgentManager');

// Хранилище всех AI-агентов
const agents = new Map(); // agentId -> { personality, memory, ... }

// Маппинг: telegramId агента -> agentId
const agentIdMapping = new Map();

// Сколько AI агентов активно в данный момент
let activeAgentCount = 0;

// Диапазон Telegram ID для AI-агентов (чтобы не пересекаться с реальными пользователями)
const AI_TELEGRAM_ID_START = 1000000000;
const AI_TELEGRAM_ID_END = 1000000060;

/**
 * Инициализирует всех AI-агентов
 * Создаёт 60 уникальных агентов с личностями и памятью
 */
const initializeAgents = () => {
  const personalities = getAllPersonalities();

  for (const personality of personalities) {
    const agentId = personality.id;
    const telegramId = AI_TELEGRAM_ID_START + agentId - 1;

    const agent = {
      agentId,
      telegramId,
      personality,
      memory: new AgentMemory(agentId),
      isInGame: false,
      currentGameId: null,
      currentRoomCode: null,
      isAlive: false,
      role: null,
    };

    agents.set(agentId, agent);
    agentIdMapping.set(telegramId, agentId);
  }

  logger.info(`Инициализировано ${agents.size} AI-агентов`);
  return agents.size;
};

/**
 * Получает агента по ID
 * @param {number} agentId - ID агента
 * @returns {object|null} Агент
 */
const getAgent = (agentId) => {
  return agents.get(agentId) || null;
};

/**
 * Получает агента по Telegram ID
 * @param {number} telegramId - Telegram ID
 * @returns {object|null} Агент
 */
const getAgentByTelegramId = (telegramId) => {
  const agentId = agentIdMapping.get(telegramId);
  if (!agentId) return null;
  return agents.get(agentId);
};

/**
 * Проверяет, является ли Telegram ID AI-агентом
 * @param {number} telegramId - Telegram ID
 * @returns {boolean}
 */
const isAIAgent = (telegramId) => {
  return telegramId >= AI_TELEGRAM_ID_START && telegramId < AI_TELEGRAM_ID_END;
};

/**
 * Находит свободных (не в игре) AI-агентов
 * @param {number} count - Сколько агентов нужно
 * @returns {Array} Массив агентов
 */
const findFreeAgents = (count) => {
  const freeAgents = [];
  for (const [id, agent] of agents) {
    if (!agent.isInGame && freeAgents.length < count) {
      freeAgents.push(agent);
    }
  }
  return freeAgents;
};

/**
 * Заполняет комнату AI-агентами до нужного количества
 * @param {object} room - Комната
 * @param {number} targetPlayerCount - Целевое количество игроков
 * @returns {Promise<Array>} Добавленные агенты
 */
const fillRoomWithAgents = async (room, targetPlayerCount) => {
  const currentPlayers = room.players.length;
  const needed = targetPlayerCount - currentPlayers;

  if (needed <= 0) return [];

  const freeAgents = findFreeAgents(needed);
  const addedAgents = [];

  for (const agent of freeAgents) {
    if (addedAgents.length >= needed) break;

    agent.isInGame = true;
    agent.currentGameId = null;
    agent.currentRoomCode = room.code;
    agent.memory.clear();
    agent.memory.myRole = null;

    // Добавляем агента в комнату
    room.players.push({
      telegramId: agent.telegramId,
      username: `ai_${agent.personality.name.toLowerCase()}`,
      firstName: agent.personality.name,
      lastName: '(AI)',
      isReady: true,
      seatNumber: room.players.length + 1,
    });

    addedAgents.push(agent);
  }

  logger.info(`Добавлено ${addedAgents.length} AI-агентов в комнату ${room.code}`);
  return addedAgents;
};

/**
 * Получает решение агента (голосование)
 * @param {object} agent - Агент
 * @param {object} gameContext - Контекст игры
 * @returns {Promise<number|null>} ID выбранного игрока
 */
const getAgentVote = async (agent, gameContext) => {
  try {
    // Обновляем память агента
    agent.memory.saveRoundState(gameContext.round, gameContext);
    agent.memory.role = agent.role;

    // Используем LLM для принятия решения
    const personalityData = {
      ...agent.personality,
      role: agent.role,
      suspicions: agent.memory.suspicions,
    };

    const targetId = await getAIDecision(personalityData, gameContext);

    // Если LLM не вернул результат, используем эвристику
    if (!targetId) {
      return getHeuristicVote(agent, gameContext);
    }

    agent.memory.recordVote(gameContext.round, targetId);
    return targetId;

  } catch (error) {
    logger.error(`Ошибка голосования агента ${agent.agentId}: ${error.message}`);
    return getHeuristicVote(agent, gameContext);
  }
};

/**
 * Эвристический выбор голоса (без LLM)
 * @param {object} agent - Агент
 * @param {object} gameContext - Контекст игры
 * @returns {number|null} ID цели
 */
const getHeuristicVote = (agent, gameContext) => {
  const alivePlayers = gameContext.players?.filter(
    p => p.isAlive && p.telegramId !== agent.telegramId
  ) || [];

  if (alivePlayers.length === 0) return null;

  // 1. Если есть подозрения — голосуем за самого подозрительного
  const mostSuspicious = agent.memory.getMostSuspicious();
  if (mostSuspicious && alivePlayers.some(p => p.telegramId === mostSuspicious.playerId)) {
    return mostSuspicious.playerId;
  }

  // 2. Иначе — случайный выбор
  const randomPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
  return randomPlayer.telegramId;
};

/**
 * Получает ночное действие агента
 * @param {object} agent - Агент
 * @param {object} gameContext - Контекст игры
 * @returns {Promise<number|null>} ID цели
 */
const getAgentNightAction = async (agent, gameContext) => {
  try {
    const personalityData = {
      ...agent.personality,
      role: agent.role,
      suspicions: agent.memory.suspicions,
    };

    const targetId = await getAINightTarget(personalityData, gameContext);

    if (!targetId) {
      return getHeuristicNightAction(agent, gameContext);
    }

    agent.memory.recordNightAction(gameContext.phase, gameContext.round, 'night_action', targetId);
    return targetId;

  } catch (error) {
    logger.error(`Ошибка ночного действия агента ${agent.agentId}: ${error.message}`);
    return getHeuristicNightAction(agent, gameContext);
  }
};

/**
 * Эвристический выбор ночной цели
 * @param {object} agent - Агент
 * @param {object} gameContext - Контекст игры
 * @returns {number|null} ID цели
 */
const getHeuristicNightAction = (agent, gameContext) => {
  const aliveOthers = gameContext.players?.filter(
    p => p.isAlive && p.telegramId !== agent.telegramId
  ) || [];

  if (aliveOthers.length === 0) return null;

  switch (agent.role) {
    case 'mafia':
    case 'don':
      // Мафия убивает самого подозрительного (с их точки зрения — мирного)
      return getRandomTargetAlive(aliveOthers);

    case 'commissar':
    case 'sheriff':
      // Проверяют самого подозрительного
      return agent.memory.getMostSuspicious()?.playerId || getRandomTargetAlive(aliveOthers);

    case 'doctor':
      // Лечит рандомного живого
      return getRandomTargetAlive(aliveOthers);

    case 'maniac':
      // Убивает рандомного
      return getRandomTargetAlive(aliveOthers);

    case 'bodyguard':
      // Защищает рандомного
      return getRandomTargetAlive(aliveOthers);

    case 'mistress':
      // Посещает рандомного
      return getRandomTargetAlive(aliveOthers);

    default:
      return null;
  }
};

/**
 * Случайный выбор цели из списка
 * @param {Array} players - Список игроков
 * @returns {number} ID
 */
const getRandomTargetAlive = (players) => {
  return players[Math.floor(Math.random() * players.length)].telegramId;
};

/**
 * Освобождает агента после игры
 * @param {number} agentId - ID агента
 */
const releaseAgent = (agentId) => {
  const agent = agents.get(agentId);
  if (agent) {
    agent.isInGame = false;
    agent.currentGameId = null;
    agent.currentRoomCode = null;
    agent.isAlive = false;
    agent.role = null;
  }
};

/**
 * Освобождает всех агентов в комнате
 * @param {string} roomCode - Код комнаты
 */
const releaseAgentsInRoom = (roomCode) => {
  for (const [id, agent] of agents) {
    if (agent.currentRoomCode === roomCode) {
      releaseAgent(id);
    }
  }
};

/**
 * Устанавливает роль агенту
 * @param {number} agentId - ID агента
 * @param {string} role - Роль
 * @param {number} gameId - ID игры
 */
const setAgentRole = (agentId, role, gameId) => {
  const agent = agents.get(agentId);
  if (agent) {
    agent.role = role;
    agent.currentGameId = gameId;
    agent.isAlive = true;
    agent.memory.role = role;
    agent.memory.myRole = role;
  }
};

/**
 * Получает статистику AI-агентов
 * @returns {object} Статистика
 */
const getAgentStats = () => {
  const inGame = [];
  const free = [];

  for (const [id, agent] of agents) {
    if (agent.isInGame) {
      inGame.push(agent.personality.name);
    } else {
      free.push(agent.personality.name);
    }
  }

  return {
    total: agents.size,
    inGame: inGame.length,
    free: free.length,
    inGameAgents: inGame,
    freeAgents: free,
  };
};

/**
 * Генерирует контекст игры для AI-агента
 * @param {object} game - Состояние игры
 * @param {object} agent - Агент
 * @returns {object} Контекст
 */
const buildGameContext = (game, agent) => {
  const alivePlayers = game.players.filter(p => p.isAlive);

  return {
    gameId: game.gameId,
    round: game.round,
    phase: game.phase,
    aliveCount: alivePlayers.length,
    isAlive: agent.isAlive,
    players: game.players.map(p => ({
      telegramId: p.telegramId,
      firstName: p.firstName,
      isAlive: p.isAlive,
      role: p.telegramId === agent.telegramId ? p.role : undefined,
      seatNumber: p.seatNumber,
    })),
    nightResult: game.nightResults?.length > 0
      ? `Погибли: ${game.nightResults[game.nightResults.length - 1]?.diedDuringNight?.map(d => d.firstName).join(', ') || 'никто'}`
      : null,
    recentEvents: game.actions?.slice(-5) || [],
  };
};

module.exports = {
  initializeAgents,
  getAgent,
  getAgentByTelegramId,
  isAIAgent,
  findFreeAgents,
  fillRoomWithAgents,
  getAgentVote,
  getAgentNightAction,
  releaseAgent,
  releaseAgentsInRoom,
  setAgentRole,
  getAgentStats,
  buildGameContext,
};
