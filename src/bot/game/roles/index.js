/**
 * Реестр ролей игры «Мафия»
 * Централизованное управление всеми ролями
 * Легко добавлять новые роли — просто создайте файл роли и зарегистрируйте здесь
 */

const logger = require('../../../utils/logger').withContext('Roles');

// Импорт всех ролей
const Peaceful = require('./peaceful');
const Mafia = require('./mafia');
const Don = require('./don');
const Commissar = require('./commissar');
const Doctor = require('./doctor');
const Maniac = require('./maniac');
const Sheriff = require('./sheriff');
const Bodyguard = require('./bodyguard');
const Mistress = require('./mistress');

/**
 * Реестр всех доступных ролей
 * Ключ: id роли (латиница)
 * Значение: класс роли
 */
const roleRegistry = {
  peaceful: Peaceful,
  mafia: Mafia,
  don: Don,
  commissar: Commissar,
  doctor: Doctor,
  maniac: Maniac,
  sheriff: Sheriff,
  bodyguard: Bodyguard,
  mistress: Mistress,
};

/**
 * Команды по умолчанию
 * mafia (красные) vs peaceful (мирные)
 * don и commissar — лидеры команд
 * doctor, sheriff, bodyguard, mistress — мирные роли
 * maniac — играет сам за себя
 */
const teams = {
  mafia: ['mafia', 'don'],
  peaceful: ['peaceful', 'commissar', 'doctor', 'sheriff', 'bodyguard', 'mistress'],
  solo: ['maniac'],
};

/**
 * Получить класс роли по ID
 * @param {string} roleId - ID роли
 * @returns {object} Класс роли
 */
const getRole = (roleId) => {
  const Role = roleRegistry[roleId];
  if (!Role) {
    logger.warn(`Роль не найдена: ${roleId}`);
    return null;
  }
  return Role;
};

/**
 * Получить ID команды для роли
 * @param {string} roleId - ID роли
 * @returns {string} ID команды
 */
const getTeam = (roleId) => {
  for (const [team, roles] of Object.entries(teams)) {
    if (roles.includes(roleId)) return team;
  }
  return 'peaceful';
};

/**
 * Распределяет роли между игроками
 * @param {number} playerCount - Количество игроков
 * @param {string[]} [customRoles] - Кастомный набор ролей
 * @returns {string[]} Массив ролей для каждого игрока
 */
const distributeRoles = (playerCount, customRoles = null) => {
  const roles = [];

  if (customRoles && customRoles.length === playerCount) {
    // Используем кастомный набор ролей
    return shuffleArray([...customRoles]);
  }

  // Автоматическое распределение на основе количества игроков
  const mafiaCount = getMafiaCount(playerCount);
  const peacefulCount = playerCount - mafiaCount;

  // Добавляем мафию
  for (let i = 0; i < mafiaCount; i++) {
    if (i === 0) {
      roles.push('don'); // Первый — Дон
    } else {
      roles.push('mafia');
    }
  }

  // Добавляем мирные роли
  const peacefulRoles = getPeacefulRoles(playerCount, mafiaCount);
  roles.push(...peacefulRoles);

  // Перемешиваем
  return shuffleArray(roles);
};

/**
 * Количество мафии в зависимости от числа игроков
 * @param {number} playerCount - Количество игроков
 * @returns {number} Количество мафии
 */
const getMafiaCount = (playerCount) => {
  if (playerCount <= 5) return 1;
  if (playerCount <= 8) return 2;
  if (playerCount <= 12) return 3;
  return 4;
};

/**
 * Генерирует набор мирных ролей
 * @param {number} playerCount - Всего игроков
 * @param {number} mafiaCount - Количество мафии
 * @returns {string[]} Массив мирных ролей
 */
const getPeacefulRoles = (playerCount, mafiaCount) => {
  const peacefulCount = playerCount - mafiaCount;
  const roles = ['commissar', 'doctor', 'sheriff', 'bodyguard', 'mistress'];

  // Начинаем с обязательных ролей
  const assignedRoles = [];

  if (peacefulCount >= 2) assignedRoles.push('commissar');
  if (peacefulCount >= 3) assignedRoles.push('doctor');
  if (peacefulCount >= 4) assignedRoles.push('sheriff');
  if (peacefulCount >= 5) assignedRoles.push('bodyguard');
  if (peacefulCount >= 6) assignedRoles.push('mistress');

  // Если есть маньяк (добавляется при 8+ игроках)
  if (playerCount >= 8 && peacefulCount - assignedRoles.length >= 1) {
    assignedRoles.push('maniac');
  }

  // Оставшиеся — мирные жители
  while (assignedRoles.length < peacefulCount) {
    assignedRoles.push('peaceful');
  }

  return assignedRoles;
};

/**
 * Получить все доступные роли
 * @returns {object} Все роли с их метаданными
 */
const getAllRoles = () => {
  const result = {};
  for (const [id, Role] of Object.entries(roleRegistry)) {
    const instance = new Role();
    result[id] = {
      ...instance.getMetadata(),
      team: getTeam(id),
    };
  }
  return result;
};

/**
 * Перемешивание массива (Fisher-Yates)
 * @param {Array} arr
 * @returns {Array}
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
 * Получить ночные действия для всех ролей (порядок выполнения)
 * @returns {Array} Массив ролей с их ночными действиями
 */
const getNightActionOrder = () => {
  return [
    { role: 'mistress', priority: 1, action: 'block' },
    { role: 'bodyguard', priority: 2, action: 'protect' },
    { role: 'doctor', priority: 3, action: 'heal' },
    { role: 'commissar', priority: 4, action: 'check' },
    { role: 'sheriff', priority: 5, action: 'check' },
    { role: 'mafia', priority: 6, action: 'kill' },
    { role: 'don', priority: 7, action: 'kill' },
    { role: 'maniac', priority: 8, action: 'kill' },
  ];
};

module.exports = {
  roleRegistry,
  teams,
  getRole,
  getTeam,
  distributeRoles,
  getMafiaCount,
  getPeacefulRoles,
  getAllRoles,
  getNightActionOrder,
};
