/**
 * Supabase клиент
 * Инициализирует подключение к Supabase (PostgreSQL)
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const logger = require('../utils/logger').withContext('Supabase');

let supabase = null;
let serviceRoleClient = null;

/**
 * Инициализирует Supabase клиент
 * @returns {Promise<object>} Supabase клиент
 */
const initSupabase = async () => {
  try {
    if (!config.supabase.url || !config.supabase.anonKey) {
      logger.warn('SUPABASE_URL или SUPABASE_ANON_KEY не настроены');
      throw new Error('Supabase credentials not configured');
    }

    // Обычный клиент (с RLS)
    supabase = createClient(
      config.supabase.url,
      config.supabase.anonKey,
      {
        auth: { persistSession: false },
        db: { schema: 'public' },
      }
    );

    // Сервисный клиент (обходит RLS — для серверных операций)
    if (config.supabase.serviceRoleKey) {
      serviceRoleClient = createClient(
        config.supabase.url,
        config.supabase.serviceRoleKey,
        {
          auth: { persistSession: false },
          db: { schema: 'public' },
        }
      );
    }

    // Проверяем подключение
    const { error } = await supabase.from('users').select('id', { count: 'exact', head: true });
    if (error && error.code !== '42P01') { // 42P01 = table doesn't exist yet
      logger.warn(`Supabase connection warning: ${error.message}`);
    }

    logger.info('✅ Supabase клиент инициализирован');
    return supabase;
  } catch (error) {
    logger.error(`❌ Ошибка инициализации Supabase: ${error.message}`);
    throw error;
  }
};

/**
 * Возвращает обычный Supabase клиент
 * @returns {object} Supabase клиент
 */
const getClient = () => {
  if (!supabase) {
    throw new Error('Supabase клиент не инициализирован. Вызовите initSupabase()');
  }
  return supabase;
};

/**
 * Возвращает сервисный Supabase клиент (обходит RLS)
 * @returns {object} Сервисный клиент
 */
const getServiceClient = () => {
  if (!serviceRoleClient) {
    // Если сервисный ключ не задан, используем обычный клиент
    return getClient();
  }
  return serviceRoleClient;
};

/**
 * Проверяет статус подключения к Supabase
 * @returns {Promise<object>} Статус
 */
const checkConnection = async () => {
  try {
    const client = getClient();
    const startTime = Date.now();
    const { count, error } = await client.from('users').select('*', { count: 'exact', head: true });
    const latency = Date.now() - startTime;

    if (error) {
      return { connected: false, error: error.message, latency };
    }

    return { connected: true, latency, usersCount: count };
  } catch (error) {
    return { connected: false, error: error.message };
  }
};

module.exports = {
  initSupabase,
  getClient,
  getServiceClient,
  checkConnection,
};
