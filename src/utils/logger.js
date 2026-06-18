/**
 * Модуль логирования приложения
 * Использует winston для структурированного логирования
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Создаем директорию для логов если её нет
const logDir = config.logDir;
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Формат для вывода в консоль (цветной, читаемый)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// Формат для файлов (JSON)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Создаем экземпляр логгера
const logger = winston.createLogger({
  level: config.logLevel,
  transports: [
    // Все логи пишем в файл
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    // Ошибки отдельно
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

// В режиме разработки добавляем вывод в консоль
if (config.isDev || config.nodeEnv === 'development') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

/**
 * Создает логгер с дополнительным контекстом
 * @param {string} module - Имя модуля
 * @returns {object} - Логгер с контекстом
 */
logger.withContext = (module) => {
  return {
    info: (message, meta = {}) => logger.info(`[${module}] ${message}`, meta),
    warn: (message, meta = {}) => logger.warn(`[${module}] ${message}`, meta),
    error: (message, meta = {}) => logger.error(`[${module}] ${message}`, meta),
    debug: (message, meta = {}) => logger.debug(`[${module}] ${message}`, meta),
  };
};

module.exports = logger;
