/**
 * Менеджер игровых комнат
 * Управляет созданием, поиском и удалением комнат
 */

const { generateRoomCode } = require('../../utils/helpers');
const logger = require('../../utils/logger').withContext('RoomManager');
const db = require('../../database/supabase-queries');

// In-memory кэш активных комнат для быстрого доступа
const activeRooms = new Map();

/**
 * Создаёт новую игровую комнату
 * @param {object} creator - Данные создателя { telegramId, username, firstName }
 * @param {object} options - Настройки комнаты
 * @returns {Promise<object>} Созданная комната
 */
const createRoom = async (creator, options = {}) => {
  const {
    name = 'Комната Мафии',
    type = 'public',
    maxPlayers = 10,
    settings = {},
  } = options;

  // Генерируем уникальный код комнаты
  let code;
  let isUnique = false;
  while (!isUnique) {
    code = generateRoomCode();
    isUnique = await db.rooms.isCodeUnique(code);
  }

  const room = await db.rooms.create({
    code,
    name,
    type,
    status: 'waiting',
    creatorId: creator.telegramId,
    maxPlayers,
    players: [{
      telegramId: creator.telegramId,
      username: creator.username || '',
      firstName: creator.firstName || 'Создатель',
      lastName: creator.lastName || '',
      chatId: creator.chatId || null,
      isReady: false,
      seatNumber: 1,
    }],
    settings: {
      dayDuration: settings.dayDuration || 60,
      nightDuration: settings.nightDuration || 45,
      voteDuration: settings.voteDuration || 40,
      roles: settings.roles || [],
      autoStart: settings.autoStart !== false,
      isRanked: settings.isRanked !== false,
    },
  });
  activeRooms.set(room.code, room);

  logger.info(`Создана комната ${code}: ${name} (${type})`);
  return room;
};

/**
 * Находит комнату по коду
 * @param {string} code - Код комнаты
 * @returns {Promise<object|null>} Комната или null
 */
const findRoomByCode = async (code) => {
  // Сначала проверяем кэш
  if (activeRooms.has(code)) {
    return activeRooms.get(code);
  }

  // Ищем в БД
  const room = await db.rooms.findByCode(code);
  if (room) {
    activeRooms.set(room.code, room);
  }
  return room;
};

/**
 * Добавляет игрока в комнату
 * @param {object} room - Комната
 * @param {object} player - Игрок { telegramId, username, firstName, chatId }
 * @returns {Promise<object>} Результат
 */
const addPlayerToRoom = async (room, player) => {
  // Проверки
  if (room.status !== 'waiting') {
    return { success: false, reason: 'Игра уже началась' };
  }

  if (room.players.length >= room.maxPlayers) {
    return { success: false, reason: 'Комната заполнена' };
  }

  if (room.players.some(p => p.telegramId === player.telegramId)) {
    return { success: false, reason: 'Вы уже в комнате' };
  }

  // Добавляем игрока
  const seatNumber = room.players.length + 1;
  room.players.push({
    telegramId: player.telegramId,
    username: player.username || '',
    firstName: player.firstName || 'Игрок',
    lastName: player.lastName || '',
    chatId: player.chatId || null,
    isReady: false,
    seatNumber,
  });

  room.lastActivity = new Date();
  const updated = await db.rooms.update(room.code, { players: room.players, lastActivity: new Date() });
  if (updated) Object.assign(room, updated);
  activeRooms.set(room.code, room);

  logger.info(`Игрок ${player.firstName} присоединился к комнате ${room.code}`);
  return { success: true, room };
};

/**
 * Удаляет игрока из комнаты
 * @param {object} room - Комната
 * @param {number} telegramId - ID игрока
 * @returns {Promise<object>} Результат
 */
const removePlayerFromRoom = async (room, telegramId) => {
  const playerIndex = room.players.findIndex(p => p.telegramId === telegramId);
  if (playerIndex === -1) {
    return { success: false, reason: 'Игрок не в комнате' };
  }

  // Если создатель покидает комнату — удаляем комнату
  if (room.creatorId === telegramId) {
    await deleteRoom(room.code);
    return { success: true, roomDeleted: true };
  }

  room.players.splice(playerIndex, 1);
  
  // Перенумеровываем места
  room.players.forEach((p, idx) => {
    p.seatNumber = idx + 1;
  });

  room.lastActivity = new Date();
  const updated = await db.rooms.update(room.code, { players: room.players, lastActivity: new Date() });
  if (updated) Object.assign(room, updated);
  activeRooms.set(room.code, room);

  return { success: true, room };
};

/**
 * Удаляет комнату
 * @param {string} code - Код комнаты
 */
const deleteRoom = async (code) => {
  await db.rooms.delete(code);
  activeRooms.delete(code);
  logger.info(`Комната ${code} удалена`);
};

/**
 * Отмечает готовность игрока
 * @param {object} room - Комната
 * @param {number} telegramId - ID игрока
 * @param {boolean} isReady - Готовность
 * @returns {Promise<object>} Результат
 */
const toggleReady = async (room, telegramId, isReady) => {
  const player = room.players.find(p => p.telegramId === telegramId);
  if (!player) {
    return { success: false, reason: 'Игрок не в комнате' };
  }

  player.isReady = isReady;
  room.lastActivity = new Date();
  const updated = await db.rooms.update(room.code, { players: room.players, lastActivity: new Date() });
  if (updated) Object.assign(room, updated);
  activeRooms.set(room.code, room);

  return { success: true, room };
};

/**
 * Получает список публичных комнат
 * @returns {Promise<Array>} Список комнат
 */
const getPublicRooms = async () => {
  const rooms = await db.rooms.findPublicWaiting(20);

  return rooms;
};

/**
 * Обновляет кэш комнаты из БД
 * @param {string} code - Код комнаты
 * @returns {Promise<object|null>} Комната
 */
const refreshRoom = async (code) => {
  const room = await db.rooms.findByCode(code);
  if (room) {
    activeRooms.set(room.code, room);
  } else {
    activeRooms.delete(code);
  }
  return room;
};

/**
 * Восстанавливает комнаты из БД в activeRooms кэш (после перезапуска)
 */
const recoverRooms = async () => {
  try {
    const waitingRooms = await db.rooms.findAllWaiting();
    let count = 0;
    for (const room of waitingRooms) {
      activeRooms.set(room.code, room);
      count++;
    }
    logger.info(`Восстановлено ${count} активных комнат из БД`);
    return count;
  } catch (error) {
    logger.error(`Ошибка восстановления комнат: ${error.message}`);
    return 0;
  }
};

/**
 * Очищает неактивные комнаты
 * Запускается по расписанию
 */
const cleanupInactiveRooms = async () => {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 час
  const inactiveRooms = await db.rooms.findInactive(60);

  for (const room of inactiveRooms) {
    logger.info(`Очистка неактивной комнаты ${room.code}`);
    activeRooms.delete(room.code);
    await db.rooms.delete(room.code);
  }
};

module.exports = {
  activeRooms,
  createRoom,
  findRoomByCode,
  addPlayerToRoom,
  removePlayerFromRoom,
  deleteRoom,
  toggleReady,
  getPublicRooms,
  refreshRoom,
  recoverRooms,
  cleanupInactiveRooms,
};
