/**
 * Команды для присоединения к комнате
 * Поиск и вход в комнату по коду
 */

const { findRoomByCode, addPlayerToRoom, getPublicRooms, refreshRoom } = require('../game/room');
const { roomLobbyMenu, roomsListMenu } = require('../keyboards');
const logger = require('../../utils/logger').withContext('CmdJoinRoom');
const { escapeHtml } = require('../../utils/helpers');

/**
 * Обрабатывает команду поиска комнаты
 * @param {object} bot - Экземпляр бота
 * @param {object} msg - Сообщение Telegram
 */
const handleFindRoom = async (bot, msg) => {
  const chatId = msg.chat.id;

  try {
    const rooms = await getPublicRooms();

    if (rooms.length === 0) {
      await bot.sendMessage(chatId,
        '🔍 <b>Нет доступных комнат</b>\n\n' +
        'Создайте свою комнату или введите код приватной комнаты.\n\n' +
        'Чтобы присоединиться по коду, отправьте:\n' +
        '<code>/join КОД_КОМНАТЫ</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    let message = `🔍 <b>Доступные комнаты (${rooms.length}):</b>\n\n`;
    for (const room of rooms) {
      message += `🚪 <b>${escapeHtml(room.name)}</b> [<code>${room.code}</code>]\n`;
      message += `👥 ${room.players.length}/${room.maxPlayers} | `;
      message += `👑 ${escapeHtml(room.players[0]?.firstName || '?')}\n\n`;
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      ...roomsListMenu(rooms),
    });

  } catch (error) {
    logger.error(`Ошибка поиска комнат: ${error.message}`);
    await bot.sendMessage(chatId, '❌ Не удалось получить список комнат.');
  }
};

/**
 * Обрабатывает команду /join <code>
 * @param {object} bot - Экземпляр бота
 * @param {object} msg - Сообщение Telegram
 * @param {string} roomCode - Код комнаты
 */
const handleJoinByCode = async (bot, msg, roomCode) => {
  const chatId = msg.chat.id;
  const from = msg.from;

  if (!roomCode) {
    await bot.sendMessage(chatId, '📝 Использование: <code>/join КОД_КОМНАТЫ</code>\nНапример: <code>/join ABCD</code>', {
      parse_mode: 'HTML',
    });
    return;
  }

  try {
    const code = roomCode.toUpperCase().trim();
    const room = await findRoomByCode(code);

    if (!room) {
      await bot.sendMessage(chatId, `❌ Комната с кодом <code>${code}</code> не найдена.`, {
        parse_mode: 'HTML',
      });
      return;
    }

    if (room.status !== 'waiting') {
      await bot.sendMessage(chatId, '❌ В этой комнате уже идёт игра.');
      return;
    }

    const player = {
      telegramId: from.id,
      username: from.username || '',
      firstName: from.first_name || 'Игрок',
      lastName: from.last_name || '',
      chatId: chatId, // сохраняем chatId для оповещений
    };

    const result = await addPlayerToRoom(room, player);

    if (!result.success) {
      await bot.sendMessage(chatId, `❌ ${result.reason}`);
      return;
    }

    // Обновляем комнату из БД
    const updatedRoom = await refreshRoom(room.code);

    const playerList = updatedRoom.players.map((p, idx) =>
      `${idx + 1}. <b>${escapeHtml(p.firstName)}</b>${p.telegramId === updatedRoom.creatorId ? ' 👑' : ''}`
    ).join('\n');

    let message = `✅ <b>Вы присоединились к комнате!</b>\n\n`;
    message += `📌 <b>Код:</b> <code>${updatedRoom.code}</code>\n`;
    message += `👥 <b>Игроки:</b> ${updatedRoom.players.length}/${updatedRoom.maxPlayers}\n\n`;
    message += `<b>В лобби:</b>\n${playerList}\n\n`;
    message += `Ожидаем остальных игроков...`;

    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      ...roomLobbyMenu(updatedRoom, from.id),
    });

    // Оповещаем всех остальных игроков в комнате
    for (const other of updatedRoom.players) {
      if (other.telegramId !== from.id && other.chatId) {
        try {
          await bot.sendMessage(other.chatId,
            `👋 <b>${escapeHtml(from.first_name)}</b> присоединился к комнате <code>${updatedRoom.code}</code>!\n👥 <b>${updatedRoom.players.length}/${updatedRoom.maxPlayers}</b>`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {
          // ignore send errors
        }
      }
    }

    logger.info(`Игрок ${from.first_name} присоединился к комнате ${updatedRoom.code}`);

  } catch (error) {
    logger.error(`Ошибка присоединения к комнате: ${error.message}`);
    await bot.sendMessage(chatId, '❌ Не удалось присоединиться к комнате.');
  }
};

/**
 * Обрабатывает просмотр комнаты
 * @param {object} bot - Экземпляр бота
 * @param {object} query - CallbackQuery
 * @param {string} roomCode - Код комнаты
 */
const handleViewRoom = async (bot, query, roomCode) => {
  const chatId = query.message.chat.id;
  const from = query.from;

  try {
    const room = await findRoomByCode(roomCode);
    if (!room) {
      await bot.editMessageText('❌ Комната не найдена.', {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      return;
    }

    const playerList = room.players.map((p, idx) =>
      `${idx + 1}. <b>${escapeHtml(p.firstName)}</b>${p.telegramId === room.creatorId ? ' 👑' : ''}${p.isReady ? ' ✅' : ' ⏳'}`
    ).join('\n');

    let message = `🚪 <b>${escapeHtml(room.name)}</b> [<code>${room.code}</code>]\n\n`;
    message += `👥 <b>${room.players.length}/${room.maxPlayers} игроков</b>\n`;
    message += `🔒 ${room.type === 'public' ? '🌐 Публичная' : '🔒 Приватная'}\n\n`;
    message += `<b>Игроки:</b>\n${playerList}`;

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      ...roomLobbyMenu(room, from.id),
    });

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    logger.error(`Ошибка просмотра комнаты: ${error.message}`);
    await bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
  }
};

module.exports = { handleFindRoom, handleJoinByCode, handleViewRoom };
