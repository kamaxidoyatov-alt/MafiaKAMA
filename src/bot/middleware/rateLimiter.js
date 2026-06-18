/**
 * Rate Limiter для Telegram бота
 * Защита от флуда и спама
 */

const config = require('../../config');
const logger = require('../../utils/logger').withContext('RateLimiter');

// Хранилище запросов (in-memory)
const requestCounts = new Map();
// Время блокировки
const blockedUsers = new Map();
// Хранилище команд для Anti-Flood
const commandHistory = new Map();

/**
 * Проверяет, не превысил ли пользователь лимит запросов
 * @param {number} telegramId - ID пользователя
 * @returns {boolean} true если запрос разрешён, false если превышен лимит
 */
const checkRateLimit = (telegramId) => {
  // Проверка блокировки
  if (blockedUsers.has(telegramId)) {
    const blockedUntil = blockedUsers.get(telegramId);
    if (Date.now() < blockedUntil) {
      return false;
    }
    blockedUsers.delete(telegramId);
  }

  const now = Date.now();
  const windowMs = config.rateLimit.windowMs;
  const maxRequests = config.rateLimit.maxRequests;

  if (!requestCounts.has(telegramId)) {
    requestCounts.set(telegramId, { count: 1, windowStart: now });
    return true;
  }

  const userData = requestCounts.get(telegramId);

  // Если окно истекло — сбрасываем
  if (now - userData.windowStart > windowMs) {
    userData.count = 1;
    userData.windowStart = now;
    return true;
  }

  // Проверяем лимит
  if (userData.count >= maxRequests) {
    // Блокируем на 2 минуты
    blockedUsers.set(telegramId, now + 120000);
    logger.warn(`Rate limit превышен для пользователя ${telegramId}`);
    return false;
  }

  userData.count++;
  return true;
};

/**
 * Anti-Flood: проверяет повторяющиеся команды
 * @param {number} telegramId - ID пользователя
 * @param {string} command - Команда
 * @returns {boolean} true если команда разрешена
 */
const checkAntiFlood = (telegramId, command) => {
  const now = Date.now();
  const key = `${telegramId}:${command}`;

  if (!commandHistory.has(key)) {
    commandHistory.set(key, { count: 1, lastTime: now });
    return true;
  }

  const data = commandHistory.get(key);

  // Если прошло больше 3 секунд — сбрасываем
  if (now - data.lastTime > 3000) {
    data.count = 1;
    data.lastTime = now;
    return true;
  }

  // Не более 3 одинаковых команд за 3 секунды
  if (data.count >= 3) {
    return false;
  }

  data.count++;
  data.lastTime = now;
  return true;
};

/**
 * Middleware для проверки rate limit
 * @param {object} bot - Экземпляр бота
 */
const applyRateLimiter = (bot) => {
  // Перехватываем все сообщения
  bot.on('message', (msg) => {
    const telegramId = msg.from.id;

    if (!checkRateLimit(telegramId)) {
      bot.sendMessage(msg.chat.id, '⚠️ Слишком много запросов. Пожалуйста, подождите 2 минуты.')
        .catch(() => {});
      return;
    }

    if (msg.text && msg.text.startsWith('/')) {
      if (!checkAntiFlood(telegramId, msg.text)) {
        bot.sendMessage(msg.chat.id, '⚠️ Пожалуйста, не повторяйте команды так часто.')
          .catch(() => {});
        return;
      }
    }
  });

  // Перехватываем callback queries
  bot.on('callback_query', (query) => {
    const telegramId = query.from.id;

    if (!checkRateLimit(telegramId)) {
      bot.answerCallbackQuery(query.id, {
        text: '⚠️ Слишком много запросов. Подождите.',
        show_alert: true,
      }).catch(() => {});
      return;
    }
  });

  logger.info('Rate limiter применён');
};

/**
 * Очистка устаревших данных
 * Запускается каждые 5 минут
 */
setInterval(() => {
  const now = Date.now();

  // Очистка rate limit данных
  for (const [id, data] of requestCounts) {
    if (now - data.windowStart > config.rateLimit.windowMs * 2) {
      requestCounts.delete(id);
    }
  }

  // Очистка блокировок
  for (const [id, blockedUntil] of blockedUsers) {
    if (now > blockedUntil) {
      blockedUsers.delete(id);
    }
  }

  // Очистка истории команд
  for (const [key, data] of commandHistory) {
    if (now - data.lastTime > 10000) {
      commandHistory.delete(key);
    }
  }
}, 300000);

module.exports = {
  applyRateLimiter,
  checkRateLimit,
  checkAntiFlood,
};
