/**
 * Модуль управления режимом сна бота
 *
 * Бот просыпается при активности (команды, сообщения) и
 * автоматически засыпает после 35 минут бездействия.
 *
 * В спящем режиме бот отвечает только на /start,
 * остальные команды получают уведомление "бот спит".
 */

const config = require('../config');
const logger = require('../utils/logger').withContext('SleepMode');

const INACTIVITY_TIMEOUT_MS = (config.sleepTimeoutMinutes || 35) * 60 * 1000;

let isSleeping = false; // Начинаем бодрствующим
let sleepTimer = null;
let sleepTimerStartedAt = null;
const wakeUpCallbacks = [];
const sleepCallbacks = [];

// Лог активности
const MAX_LOG_ENTRIES = 500;
const activityLog = [];
let logIdCounter = 0;

/**
 * Добавляет запись в лог активности
 * @param {object} info - { action, source, user, details }
 */
function addLogEntry(info) {
  const entry = {
    id: ++logIdCounter,
    timestamp: new Date().toISOString(),
    action: info.action || 'activity', // 'wake' | 'sleep' | 'activity' | 'blocked'
    source: info.source || 'unknown',  // 'command' | 'message' | 'callback' | 'group_add' | 'auto'
    user: info.user || null,           // { firstName, username, telegramId }
    details: info.details || '',
  };
  activityLog.push(entry);
  // Ограничиваем размер лога
  if (activityLog.length > MAX_LOG_ENTRIES) {
    activityLog.splice(0, activityLog.length - MAX_LOG_ENTRIES);
  }
}

/**
 * Записывает активность — будит бота (если спал) и сбрасывает таймер сна
 * @param {object} [user] - { firstName, username, telegramId }
 * @param {string} [source] - источник активности
 * @param {string} [details] - доп. описание
 */
function recordActivity(user, source = 'message', details = '') {
  const wasSleeping = isSleeping;
  if (isSleeping) {
    wakeUp(user, source, details);
  }
  addLogEntry({
    action: wasSleeping ? 'wake' : 'activity',
    source,
    user: user || null,
    details,
  });
  resetSleepTimer();
}

/**
 * Пробуждает бота
 * @param {object} [user] - { firstName, username, telegramId }
 * @param {string} [source]
 * @param {string} [details]
 */
function wakeUp(user, source = 'auto', details = '') {
  if (!isSleeping) return;
  isSleeping = false;
  addLogEntry({ action: 'wake', source, user: user || null, details });
  logger.info(`🤖 Бот проснулся${user ? ` (${user.firstName || user.telegramId})` : ''}`);
  wakeUpCallbacks.forEach(cb => cb());
}

/**
 * Усыпляет бота
 */
function sleep() {
  if (isSleeping) return;
  isSleeping = true;
  addLogEntry({ action: 'sleep', source: 'auto', user: null, details: `${config.sleepTimeoutMinutes || 35} мин бездействия` });
  logger.info(`😴 Бот перешёл в спящий режим (нет активности ${config.sleepTimeoutMinutes || 35} мин)`);
  sleepCallbacks.forEach(cb => cb());
}

/**
 * Сбрасывает таймер сна (перезапускает отсчёт бездействия)
 */
function resetSleepTimer() {
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }
  sleepTimerStartedAt = Date.now();
  sleepTimer = setTimeout(() => {
    sleepTimerStartedAt = null;
    sleep();
  }, INACTIVITY_TIMEOUT_MS);
  // Не блокируем завершение процесса Node.js
  if (sleepTimer.unref) sleepTimer.unref();
}

/**
 * Регистрирует колбэк на пробуждение
 * @param {Function} cb
 */
function onWakeUp(cb) {
  wakeUpCallbacks.push(cb);
}

/**
 * Регистрирует колбэк на засыпание
 * @param {Function} cb
 */
function onSleep(cb) {
  sleepCallbacks.push(cb);
}

/**
 * Возвращает копию лога активности (последние записи — первые)
 * @param {number} [limit=100]
 * @returns {Array}
 */
function getLogs(limit = 100) {
  return activityLog.slice(-limit).reverse();
}

/**
 * Возвращает оставшееся время до сна в мс (или null если таймер не активен)
 * @returns {number|null}
 */
function getSleepTimerRemaining() {
  if (!sleepTimerStartedAt) return null;
  const elapsed = Date.now() - sleepTimerStartedAt;
  const remaining = INACTIVITY_TIMEOUT_MS - elapsed;
  return Math.max(0, remaining);
}

/**
 * Очищает лог активности
 */
function clearLogs() {
  activityLog.length = 0;
}

/**
 * Очищает таймер и колбэки
 */
function destroy() {
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }
  wakeUpCallbacks.length = 0;
  sleepCallbacks.length = 0;
  activityLog.length = 0;
}

module.exports = {
  recordActivity,
  addLogEntry,
  wakeUp,
  sleep,
  onWakeUp,
  onSleep,
  resetSleepTimer,
  destroy,
  getLogs,
  getSleepTimerRemaining,
  clearLogs,
  get isSleeping() {
    return isSleeping;
  },
};
