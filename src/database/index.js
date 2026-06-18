/**
 * Подключение к базе данных через Supabase (PostgreSQL)
 * Заменяет предыдущее подключение через Mongoose к MongoDB
 */

const config = require('../config');
const logger = require('../utils/logger').withContext('Database');
const { initSupabase, checkConnection } = require('./supabase');

let isConnected = false;

/**
 * Подключается к Supabase
 * @returns {Promise<boolean>}
 */
const connectDatabase = async () => {
  try {
    if (!config.supabase.url || !config.supabase.anonKey) {
      logger.warn('⚠️ Supabase не настроен. Проверьте SUPABASE_URL и SUPABASE_ANON_KEY в .env');
      logger.info('ℹ️ Приложение будет работать без сохранения данных.');
      isConnected = false;
      return false;
    }

    await initSupabase();

    // Проверяем подключение
    const status = await checkConnection();
    if (status.connected) {
      logger.info(`✅ Подключено к Supabase (латентность: ${status.latency}ms)`);
      isConnected = true;
    } else {
      logger.warn(`⚠️ Supabase подключение нестабильно: ${status.error}`);
      isConnected = false;
    }

    return isConnected;
  } catch (error) {
    logger.error(`❌ Ошибка подключения к Supabase: ${error.message}`);
    isConnected = false;
    return false;
  }
};

/**
 * Проверяет, активно ли подключение к БД
 * @returns {boolean}
 */
const isDatabaseConnected = () => isConnected;

/**
 * Останавливает подключение (заглушка для совместимости)
 */
const stopDatabase = async () => {
  isConnected = false;
  logger.info('Соединение с БД закрыто');
};

module.exports = { connectDatabase, stopDatabase, isDatabaseConnected };
