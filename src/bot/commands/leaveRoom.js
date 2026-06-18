/**
 * Команда выхода из комнаты
 */

const { removePlayerFromRoom, activeRooms } = require('../game/room');
const { mainMenu } = require('../keyboards');
const logger = require('../../utils/logger').withContext('CmdLeaveRoom');

/**
 * Обрабатывает выход из комнаты
 * @param {object} bot - Экземпляр бота
 * @param {object} msg - Сообщение Telegram
 */
const handleLeaveRoom = async (bot, msg) => {
  const chatId = msg.chat.id;
  const from = msg.from;

  try {
    // Ищем комнату в activeRooms кэше
    let room = null;
    for (const [code, r] of activeRooms) {
      if (r.players.some(p => p.telegramId === from.id) && r.status === 'waiting') {
        room = r;
        break;
      }
    }

    if (!room) {
      await bot.sendMessage(chatId, '❌ Вы не находитесь ни в одной комнате.');
      return;
    }

    const result = await removePlayerFromRoom(room, from.id);

    if (result.roomDeleted) {
      await bot.sendMessage(chatId,
        '🚪 **Комната удалена**\n\n' +
        'Так как вы были создателем, комната была удалена.',
        { parse_mode: 'Markdown', ...mainMenu(false) }
      );
    } else if (result.success) {
      await bot.sendMessage(chatId,
        '✅ **Вы вышли из комнаты**',
        { parse_mode: 'Markdown', ...mainMenu(false) }
      );
    } else {
      await bot.sendMessage(chatId, `❌ ${result.reason}`);
    }

    logger.info(`Игрок ${from.first_name} покинул комнату ${room.code}`);
  } catch (error) {
    logger.error(`Ошибка выхода из комнаты: ${error.message}`);
    await bot.sendMessage(chatId, '❌ Не удалось выйти из комнаты.');
  }
};

module.exports = { handleLeaveRoom };
