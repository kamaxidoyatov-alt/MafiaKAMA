/**
 * Вспомогательные функции приложения
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Генерирует уникальный ID
 * @returns {string} UUID
 */
const generateId = () => uuidv4();

/**
 * Генерирует короткий код комнаты (4 символа)
 * @returns {string} Код комнаты
 */
const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * Задержка выполнения (sleep)
 * @param {number} ms - Миллисекунды
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Форматирует дату для отображения
 * @param {Date|string} date - Дата
 * @returns {string} Отформатированная дата
 */
const formatDate = (date) => {
  const d = new Date(date);
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Экранирует Markdown для Telegram
 * @param {string} text - Текст для экранирования
 * @returns {string} Экранированный текст
 */
const escapeMarkdown = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/&/g, '\\&')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/!/g, '\\!')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=');
};

/**
 * Выбирает случайный элемент из массива
 * @param {Array} arr - Массив
 * @returns {*} Случайный элемент
 */
const randomItem = (arr) => {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
};

/**
 * Перемешивает массив (Fisher-Yates)
 * @param {Array} arr - Массив для перемешивания
 * @returns {Array} Перемешанный массив
 */
const shuffleArray = (arr) => {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Проверяет является ли значение числом
 * @param {*} value - Значение для проверки
 * @returns {boolean}
 */
const isNumber = (value) => {
  return !isNaN(parseFloat(value)) && isFinite(value);
};

/**
 * Безопасный парсинг JSON
 * @param {string} str - JSON строка
 * @param {*} defaultVal - Значение по умолчанию
 * @returns {*} Распарсенный объект или значение по умолчанию
 */
const safeJsonParse = (str, defaultVal = null) => {
  try {
    return JSON.parse(str);
  } catch {
    return defaultVal;
  }
};

/**
 * Терминирует процесс с сообщением об ошибке
 * @param {string} message - Сообщение об ошибке
 */
const fatalError = (message) => {
  console.error(`[FATAL] ${message}`);
  process.exit(1);
};

/**
 * Экранирует HTML-спецсимволы для Telegram
 * @param {string} text - Текст для экранирования
 * @returns {string} Экранированный текст
 */
const escapeHtml = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

module.exports = {
  generateId,
  generateRoomCode,
  sleep,
  formatDate,
  escapeMarkdown,
  escapeHtml,
  randomItem,
  shuffleArray,
  isNumber,
  safeJsonParse,
  fatalError,
};
