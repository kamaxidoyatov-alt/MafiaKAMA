/**
 * Модуль кэширования
 * Использует Redis с автоматическим fallback на in-memory кэш
 */

const config = require('../config');
const logger = require('../utils/logger').withContext('Cache');

let cacheClient = null;
let useRedis = false;

// In-memory кэш как fallback
const memoryCache = new Map();

// Статистика кэша
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
};

/**
 * Инициализация кэша
 * Пытается подключиться к Redis, при неудаче использует in-memory
 */
const initCache = async () => {
  if (config.redisUrl) {
    try {
      const Redis = require('ioredis');
      cacheClient = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) return null; // Отключаем ретраи после 3 попыток
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
        enableAutoPipelining: false,
      });

      // Подавляем ошибки подключения (они обрабатываются в catch)
      cacheClient.on('error', (err) => {
        // Игнорируем ошибки подключения — используем in-memory кэш
        if (useRedis) {
          logger.warn(`Redis ошибка: ${err.message}`);
          useRedis = false;
          cacheClient = null;
        }
      });

      await cacheClient.connect();
      useRedis = true;
      logger.info('Подключено к Redis');
    } catch (error) {
      logger.warn(`Redis недоступен, используется in-memory кэш: ${error.message}`);
      useRedis = false;
      cacheClient = null;
    }
  } else {
    logger.info('Redis не настроен, используется in-memory кэш');
  }
};

/**
 * Получить значение из кэша
 * @param {string} key - Ключ
 * @returns {Promise<*>} Значение или null
 */
const get = async (key) => {
  if (useRedis && cacheClient) {
    try {
      const value = await cacheClient.get(key);
      if (value) {
        stats.hits++;
        return JSON.parse(value);
      }
      stats.misses++;
      return null;
    } catch (error) {
      logger.warn(`Ошибка Redis get: ${error.message}`);
      // Fallback на in-memory
    }
  }

  // In-memory fallback
  const entry = memoryCache.get(key);
  if (entry && entry.expiry > Date.now()) {
    stats.hits++;
    return entry.value;
  }
  if (entry) {
    memoryCache.delete(key);
  }
  stats.misses++;
  return null;
};

/**
 * Сохранить значение в кэш
 * @param {string} key - Ключ
 * @param {*} value - Значение
 * @param {number} ttlSeconds - Время жизни в секундах
 */
const set = async (key, value, ttlSeconds = 300) => {
  stats.sets++;

  if (useRedis && cacheClient) {
    try {
      await cacheClient.setex(key, ttlSeconds, JSON.stringify(value));
      return;
    } catch (error) {
      logger.warn(`Ошибка Redis set: ${error.message}`);
    }
  }

  // In-memory fallback
  memoryCache.set(key, {
    value,
    expiry: Date.now() + ttlSeconds * 1000,
  });
};

/**
 * Удалить значение из кэша
 * @param {string} key - Ключ
 */
const del = async (key) => {
  stats.deletes++;

  if (useRedis && cacheClient) {
    try {
      await cacheClient.del(key);
    } catch (error) {
      logger.warn(`Ошибка Redis del: ${error.message}`);
    }
  }

  memoryCache.delete(key);
};

/**
 * Очистить весь кэш
 */
const flushAll = async () => {
  if (useRedis && cacheClient) {
    try {
      await cacheClient.flushall();
    } catch (error) {
      logger.warn(`Ошибка Redis flush: ${error.message}`);
    }
  }
  memoryCache.clear();
};

/**
 * Получить статистику кэша
 * @returns {object} Статистика
 */
const getStats = () => {
  return {
    ...stats,
    hitRate: stats.hits + stats.misses > 0
      ? Math.round((stats.hits / (stats.hits + stats.misses)) * 100)
      : 0,
    memorySize: memoryCache.size,
    useRedis,
  };
};

/**
 * Обертка для кэширования результатов функции
 * @param {string} cacheKey - Ключ кэша
 * @param {Function} fetchFn - Функция получения данных
 * @param {number} ttlSeconds - Время жизни кэша
 * @returns {Promise<*>} Результат
 */
const memoize = async (cacheKey, fetchFn, ttlSeconds = 300) => {
  const cached = await get(cacheKey);
  if (cached !== null) return cached;

  const result = await fetchFn();
  if (result !== null && result !== undefined) {
    await set(cacheKey, result, ttlSeconds);
  }
  return result;
};

// Очистка redis при завершении
process.on('SIGINT', async () => {
  if (cacheClient) {
    await cacheClient.quit();
  }
  process.exit(0);
});

module.exports = {
  initCache,
  get,
  set,
  del,
  flushAll,
  getStats,
  memoize,
};
