/**
 * Конфигурация приложения
 * Загружает настройки из переменных окружения (.env)
 */
require('dotenv').config();

const config = {
  // Telegram Bot
  botToken: process.env.BOT_TOKEN,

  // Сервер
  port: parseInt(process.env.PORT, 10) || 4001,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // Supabase (PostgreSQL)
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  // Redis (кэш — остаётся поверх Supabase)
  redisUrl: process.env.REDIS_URL,

  // LLM API
  llmProvider: process.env.LLM_PROVIDER || 'openai',
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  geminiApiKey: process.env.GEMINI_API_KEY,
  claudeApiKey: process.env.CLAUDE_API_KEY,
  claudeModel: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',

  // Админ-панель
  adminEmail: process.env.ADMIN_EMAIL || 'admin@mafia-bot.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  sessionSecret: process.env.SESSION_SECRET || 'mafia-secret-default',
  jwtSecret: process.env.JWT_SECRET || 'mafia-jwt-default',

  // Настройки игры
  game: {
    starCost: parseInt(process.env.STAR_COST, 10) || 1,
    minPlayersToStart: parseInt(process.env.MIN_PLAYERS_TO_START, 10) || 4,
    maxPlayers: parseInt(process.env.MAX_PLAYERS, 10) || 16,
    dayDurationSeconds: parseInt(process.env.DAY_DURATION_SECONDS, 10) || 60,
    nightDurationSeconds: parseInt(process.env.NIGHT_DURATION_SECONDS, 10) || 45,
    voteDurationSeconds: parseInt(process.env.VOTE_DURATION_SECONDS, 10) || 40,
    roomCleanupIntervalMinutes: parseInt(process.env.ROOM_CLEANUP_INTERVAL_MINUTES, 10) || 30,
    gameRecoveryIntervalSeconds: parseInt(process.env.GAME_RECOVERY_INTERVAL_SECONDS, 10) || 10,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 30,
  },

  // Супер-админы (всегда имеют права администратора, даже после сброса БД)
  superAdminIds: (process.env.SUPER_ADMIN_IDS || '8357557157').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)),

  // Sleep Mode
  sleepTimeoutMinutes: parseInt(process.env.SLEEP_TIMEOUT_MINUTES, 10) || 35,

  // Логирование
  logLevel: process.env.LOG_LEVEL || 'debug',
  logDir: process.env.LOG_DIR || './logs',
};

module.exports = config;
