/**
 * Административные команды бота
 * Управление комнатами, бан игроков, просмотр статистики
 */

const db = require('../../database/supabase-queries');
const { adminMenu } = require('../keyboards');
const cache = require('../../database/cache');
const config = require('../../config');
const logger = require('../../utils/logger').withContext('CmdAdmin');

/**
 * Проверяет, является ли пользователь администратором
 * @param {number} telegramId - ID пользователя
 * @returns {Promise<boolean>}
 */
const isAdmin = async (telegramId) => {
  const user = await db.users.findByTelegramId(telegramId);
  return user?.isAdmin === true;
};

/**
 * Обрабатывает команду /admin
 * @param {object} bot - Экземпляр бота
 * @param {object} msg - Сообщение Telegram
 */
const handleAdmin = async (bot, msg) => {
  const chatId = msg.chat.id;
  const from = msg.from;

  if (!(await isAdmin(from.id))) {
    await bot.sendMessage(chatId, '⛔ У вас нет прав администратора.');
    return;
  }

  await bot.sendMessage(chatId, '⚙️ **Админ-панель**\n\nВыберите раздел:', {
    parse_mode: 'Markdown',
    ...adminMenu(),
  });
};

/**
 * Показывает дашборд администратора
 * @param {object} bot - Экземпляр бота
 * @param {object} query - CallbackQuery
 */
const handleAdminDashboard = async (bot, query) => {
  const chatId = query.message.chat.id;

  try {
    const [totalUsers, totalGames, activeGamesCount, bannedUsers] = await Promise.all([
      db.users.count(),
      db.games.count(),
      db.games.count({ status: 'in_progress' }),
      db.users.count({ isBanned: true }),
    ]);
    const activeRoomList = await db.rooms.findPublicWaiting(50);
    const activeRooms = activeRoomList.length;
    const cacheStats = cache.getStats();

    let message = `📊 **Дашборд администратора**\n\n`;
    message += `**Пользователи:**\n`;
    message += `• Всего: ${totalUsers}\n`;
    message += `• Забанено: ${bannedUsers}\n\n`;
    message += `**Игры:**\n`;
    message += `• Всего игр: ${totalGames}\n`;
    message += `• Активных игр: ${activeGamesCount}\n`;
    message += `• Активных комнат: ${activeRooms}\n\n`;
    message += `**Кэш:**\n`;
    message += `• Тип: ${cacheStats.useRedis ? 'Redis' : 'In-Memory'}\n`;
    message += `• Хитов: ${cacheStats.hits}\n`;
    message += `• Промахов: ${cacheStats.misses}\n`;
    message += `• Hit Rate: ${cacheStats.hitRate}%\n\n`;
    message += `**Сервер:**\n`;
    message += `• Режим: ${config.nodeEnv}\n`;
    message += `• LLM: ${config.llmProvider}\n`;

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: adminMenu().reply_markup,
    });

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    logger.error(`Ошибка дашборда: ${error.message}`);
    await bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
  }
};

/**
 * Показывает список активных комнат для админа
 * @param {object} bot - Экземпляр бота
 * @param {object} query - CallbackQuery
 */
const handleAdminRooms = async (bot, query) => {
  const chatId = query.message.chat.id;

  try {
    const roomList = await db.rooms.findPublicWaiting(20);
    // Также получаем комнаты со статусом 'playing' из активного кэша
    const { activeRooms } = require('../game/room');
    const allRooms = [...roomList];
    for (const [code, r] of activeRooms) {
      if (r.status === 'playing' && !allRooms.find(rr => rr.code === code)) {
        allRooms.push(r);
      }
    }

    let message = `🚪 **Активные комнаты (${allRooms.length}):**\n\n`;

    for (const room of allRooms.slice(0, 20)) {
      message += `[\`${room.code}\`] **${room.name}**\n`;
      message += `• Статус: ${room.status === 'waiting' ? 'Ожидание' : 'Игра'}\n`;
      message += `• Игроки: ${room.players.length}/${room.maxPlayers}\n`;
      message += `• Создатель: ${room.players[0]?.firstName || '?'}\n\n`;
    }

    if (rooms.length === 0) {
      message += 'Нет активных комнат.';
    }

    message += '\nЧтобы удалить комнату: /delroom КОД';

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: adminMenu().reply_markup,
    });

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    logger.error(`Ошибка списка комнат: ${error.message}`);
    await bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
  }
};

/**
 * Обрабатывает команду /ban <id> <причина>
 * @param {object} bot - Экземпляр бота
 * @param {object} msg - Сообщение Telegram
 * @param {string} args - Аргументы (ID и причина)
 */
const handleBan = async (bot, msg, args) => {
  const chatId = msg.chat.id;
  const from = msg.from;

  if (!(await isAdmin(from.id))) {
    await bot.sendMessage(chatId, '⛔ Нет прав.');
    return;
  }

  const parts = args.split(' ').filter(s => s.length > 0);
  if (parts.length < 2) {
    await bot.sendMessage(chatId, '📝 Использование: `/ban TELEGRAM_ID ПРИЧИНА`');
    return;
  }

  const targetId = parseInt(parts[0]);
  const reason = parts.slice(1).join(' ');

  if (isNaN(targetId)) {
    await bot.sendMessage(chatId, '❌ Неверный ID.');
    return;
  }

  try {
    const user = await db.users.findByTelegramId(targetId);
    if (!user) {
      await bot.sendMessage(chatId, '❌ Пользователь не найден.');
      return;
    }

    await db.users.update(targetId, { isBanned: true, banReason: reason });
    await cache.del(`user:${targetId}`);

    await bot.sendMessage(chatId,
      `✅ Пользователь ${user.displayName} (${targetId}) забанен.\nПричина: ${reason}`
    );

    logger.info(`Админ ${from.first_name} забанил ${targetId}: ${reason}`);
  } catch (error) {
    logger.error(`Ошибка бана: ${error.message}`);
    await bot.sendMessage(chatId, '❌ Ошибка.');
  }
};

/**
 * Обрабатывает команду /unban <id>
 * @param {object} bot - Экземпляр бота
 * @param {object} msg - Сообщение Telegram
 * @param {string} targetIdStr - ID пользователя
 */
const handleUnban = async (bot, msg, targetIdStr) => {
  const chatId = msg.chat.id;
  const from = msg.from;

  if (!(await isAdmin(from.id))) {
    await bot.sendMessage(chatId, '⛔ Нет прав.');
    return;
  }

  const targetId = parseInt(targetIdStr);
  if (isNaN(targetId)) {
    await bot.sendMessage(chatId, '❌ Неверный ID.');
    return;
  }

  try {
    const user = await db.users.findByTelegramId(targetId);
    if (!user) {
      await bot.sendMessage(chatId, '❌ Пользователь не найден.');
      return;
    }

    await db.users.update(targetId, { isBanned: false, banReason: '' });
    await cache.del(`user:${targetId}`);

    await bot.sendMessage(chatId, `✅ Пользователь ${user.displayName} разбанен.`);
    logger.info(`Админ ${from.first_name} разбанил ${targetId}`);
  } catch (error) {
    logger.error(`Ошибка разбана: ${error.message}`);
    await bot.sendMessage(chatId, '❌ Ошибка.');
  }
};

/**
 * Отображает аналитику админу
 * @param {object} bot - Экземпляр бота
 * @param {object} query - CallbackQuery
 */
const handleAdminAnalytics = async (bot, query) => {
  const chatId = query.message.chat.id;

  try {
    const [totalGames, finishedGames, mafiaWins, peacefulWins, maniacWins] = await Promise.all([
      db.games.count(),
      db.games.count({ status: 'finished' }),
      db.games.count({ status: 'finished', winner: 'mafia' }),
      db.games.count({ status: 'finished', winner: 'peaceful' }),
      db.games.count({ status: 'finished', winner: 'maniac' }),
    ]);

    // Активные пользователи за последний час
    const lastHour = new Date(Date.now() - 3600000);
    const activeUsers = await db.users.count({ lastActiveAfter: lastHour });

    let message = `📈 **Аналитика**\n\n`;
    message += `**Игры:**\n`;
    message += `• Всего игр: ${totalGames}\n`;
    message += `• Завершено: ${finishedGames}\n\n`;
    message += `**Победы:**\n`;
    message += `• Мафия: ${mafiaWins} (${finishedGames > 0 ? Math.round(mafiaWins/finishedGames*100) : 0}%)\n`;
    message += `• Мирные: ${peacefulWins} (${finishedGames > 0 ? Math.round(peacefulWins/finishedGames*100) : 0}%)\n`;
    message += `• Маньяк: ${maniacWins}\n\n`;
    message += `**Онлайн:**\n`;
    message += `• Активных за час: ${activeUsers}\n`;

    // Топ-5 игроков по рейтингу
    const topPlayers = await db.users.getTopByRating(5);

    if (topPlayers.length > 0) {
      message += `\n**Топ-5 игроков:**\n`;
      topPlayers.forEach((p, i) => {
        message += `${i + 1}. ${p.displayName} — ${p.rating}\n`;
      });
    }

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: adminMenu().reply_markup,
    });

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    logger.error(`Ошибка аналитики: ${error.message}`);
    await bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
  }
};

/**
 * Отображает логи
 * @param {object} bot - Экземпляр бота
 * @param {object} query - CallbackQuery
 */
const handleAdminLogs = async (bot, query) => {
  const chatId = query.message.chat.id;

  try {
    const logs = await db.gameLogs.find({}, 10);

    let message = `📝 **Последние логи (10):**\n\n`;

    for (const log of logs) {
      const time = new Date(log.createdAt).toLocaleString('ru-RU');
      message += `[${time}] [${log.eventType}] ${log.message.substring(0, 100)}\n`;
    }

    if (logs.length === 0) {
      message += 'Логов нет.';
    }

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: adminMenu().reply_markup,
    });

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    logger.error(`Ошибка логов: ${error.message}`);
    await bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
  }
};

/**
 * Обрабатывает команду удаления комнаты
 * @param {object} bot - Экземпляр бота
 * @param {object} msg - Сообщение Telegram
 * @param {string} roomCode - Код комнаты
 */
const handleDeleteRoom = async (bot, msg, roomCode) => {
  const chatId = msg.chat.id;
  const from = msg.from;

  if (!(await isAdmin(from.id))) {
    await bot.sendMessage(chatId, '⛔ Нет прав.');
    return;
  }

  try {
    const { deleteRoom } = require('../game/room');
    await deleteRoom(roomCode.toUpperCase());
    await bot.sendMessage(chatId, `✅ Комната ${roomCode.toUpperCase()} удалена.`);
  } catch (error) {
    logger.error(`Ошибка удаления комнаты: ${error.message}`);
    await bot.sendMessage(chatId, '❌ Ошибка удаления комнаты.');
  }
};

module.exports = {
  handleAdmin,
  handleAdminDashboard,
  handleAdminRooms,
  handleAdminAnalytics,
  handleAdminLogs,
  handleBan,
  handleUnban,
  handleDeleteRoom,
  isAdmin,
};
