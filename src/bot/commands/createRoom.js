/**
 * Команда создания комнаты
 * Позволяет пользователю создать новую игровую комнату
 */

const { createRoom } = require('../game/room');
const { roomLobbyMenu } = require('../keyboards');
const logger = require('../../utils/logger').withContext('CmdCreateRoom');
const { escapeHtml } = require('../../utils/helpers');


/**
 * Обрабатывает создание комнаты
 * @param {object} bot - Экземпляр бота
 * @param {object} msg - Сообщение Telegram
 * @param {object} options - Настройки комнаты
 */
const handleCreateRoom = async (bot, msg, options = {}) => {
  const chatId = msg.chat.id;
  const from = msg.from;

  try {
    const creator = {
      telegramId: from.id,
      username: from.username || '',
      firstName: from.first_name || 'Создатель',
      lastName: from.last_name || '',
      chatId: chatId,
    };

    const roomOptions = {
      name: options.name || `Комната ${from.first_name}`,
      type: options.type || 'public',
      maxPlayers: options.maxPlayers || 10,
      settings: {
        dayDuration: options.dayDuration || 60,
        nightDuration: options.nightDuration || 45,
        voteDuration: options.voteDuration || 40,
        isRanked: options.isRanked !== false,
      },
    };

    const room = await createRoom(creator, roomOptions);

    const playerList = room.players.map((p, idx) =>
      `${idx + 1}. <b>${escapeHtml(p.firstName)}</b>${p.telegramId === room.creatorId ? ' 👑' : ''}`
    ).join('\n');

    let message = `🎮 <b>Комната создана!</b>\n\n`;
    message += `📌 <b>Код комнаты:</b> <code>${room.code}</code>\n`;
    message += `🔒 <b>Тип:</b> ${room.type === 'public' ? '🌐 Публичная' : '🔒 Приватная'}\n`;
    message += `👥 <b>Игроки:</b> ${room.players.length}/${room.maxPlayers}\n\n`;
    message += `<b>Игроки в лобби:</b>\n${playerList}\n\n`;
    message += `Ожидаем игроков... Для старта нужно минимум 4 игрока.`;

    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      ...roomLobbyMenu(room, from.id),
    });

    logger.info(`Пользователь ${from.first_name} создал комнату ${room.code}`);
  } catch (error) {
    logger.error(`Ошибка создания комнаты: ${error.message}`);
    await bot.sendMessage(chatId, '❌ Не удалось создать комнату. Попробуйте позже.');
  }
};

/**
 * Обрабатывает выбор типа комнаты
 * @param {object} bot - Экземпляр бота
 * @param {object} query - CallbackQuery от Telegram
 */
const handleRoomTypeChoice = async (bot, query) => {
  const type = query.data === 'room_type_public' ? 'public' : 'private';

  // Создаём фейковый msg с правильным from (query.from, а не query.message.from)
  // query.message.from — это сам бот, query.from — реальный пользователь
  const fakeMsg = {
    chat: { id: query.message.chat.id },
    from: query.from,
    text: '/create',
  };

  await handleCreateRoom(bot, fakeMsg, { type });

  await bot.answerCallbackQuery(query.id);
};

module.exports = { handleCreateRoom, handleRoomTypeChoice };
