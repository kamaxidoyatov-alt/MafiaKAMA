/**
 * 🎮 **Главная точка входа приложения**
 * 
 * Инициализирует и запускает все компоненты:
 * - Подключение к MongoDB
 * - Инициализация кэша (Redis/In-Memory)
 * - Telegram бот
 * - Express сервер + WebSocket
 * - API маршруты
 * - Восстановление активных игр
 * - Планировщик очистки комнат
 * - Система AI-агентов
 */

require('dotenv').config();

const config = require('./config');
const logger = require('./utils/logger').withContext('Main');
const { fatalError } = require('./utils/helpers');
const { connectDatabase, isDatabaseConnected } = require('./database');
const { initCache } = require('./database/cache');
const { initBot } = require('./bot');
const { initServer } = require('./api/server');
const { setSocketIO } = require('./bot/game');
const { recoverGames } = require('./bot/game');
const { cleanupInactiveRooms } = require('./bot/game/room');
const { initializeAgents } = require('../ai-agents/agentManager');
const cron = require('node-cron');

/**
 * Главная функция запуска приложения
 */
async function main() {
  logger.info('========================================');
  logger.info('  🎭 MafiaBOT — Telegram Mafia Game');
  logger.info(`  Версия: 1.0.0`);
  logger.info(`  Режим: ${config.nodeEnv}`);
  logger.info('========================================');

  try {
    // 1. Подключаемся к Supabase
    logger.info('📦 Подключение к Supabase (PostgreSQL)...');
    const dbConnected = await connectDatabase();
    if (!dbConnected) {
      logger.warn('⚠️ Приложение запущено без подключения к БД. Данные не будут сохраняться.');
    }

    // 2. Инициализируем кэш
    logger.info('⚡ Инициализация кэша...');
    await initCache();

    // 3. Инициализируем AI-агентов
    logger.info('🤖 Инициализация AI-агентов...');
    const agentCount = initializeAgents();
    logger.info(`✅ Создано ${agentCount} AI-агентов`);

    // 4. Запускаем Telegram бота
    logger.info('🤖 Запуск Telegram бота...');
    const bot = await initBot();

    // 5. Запускаем Express сервер с WebSocket
    logger.info('🌐 Запуск HTTP сервера...');
    const { server, io } = await initServer(bot);
    
    // Передаём WebSocket игровому движку
    setSocketIO(io);
    logger.info('✅ WebSocket подключён к игровому движку');

    // 6. Восстанавливаем активные игры
    logger.info('🔄 Восстановление активных игр...');
    await recoverGames();

    // 7. Планировщик: очистка неактивных комнат каждые 30 минут
    cron.schedule('*/30 * * * *', async () => {
      logger.debug('🧹 Очистка неактивных комнат...');
      await cleanupInactiveRooms();
    });

    // 8. Планировщик: восстановление игр каждые 10 секунд
    cron.schedule(`*/${config.game.gameRecoveryIntervalSeconds} * * * * *`, async () => {
      // Проверка активных игр
    });

    logger.info('========================================');
    logger.info('  ✅ Все компоненты запущены успешно!');
    logger.info(`  🌐 Сервер: http://localhost:${config.port}`);
    logger.info(`  🤖 Бот: @MafiaGameBot`);
    logger.info('========================================');

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('🛑 Завершение работы...');
      bot?.stopPolling?.();
      server?.close?.();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('🛑 Завершение работы...');
      bot?.stopPolling?.();
      server?.close?.();
      process.exit(0);
    });

    // Обработка необработанных ошибок
    process.on('uncaughtException', (error) => {
      logger.error(`🚨 Необработанная ошибка: ${error.message}`, { stack: error.stack });
    });

    process.on('unhandledRejection', (reason) => {
      logger.error(`🚨 Необработанный rejection: ${reason}`);
    });

  } catch (error) {
    logger.error(`❌ Критическая ошибка при запуске: ${error.message}`);
    logger.error(error.stack);
    fatalError(`Не удалось запустить приложение: ${error.message}`);
  }
}

// Запускаем приложение
main();
