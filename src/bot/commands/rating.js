/**
 * Команда рейтинга игроков
 * Показывает топ игроков по рейтингу
 */

const db = require('../../database/supabase-queries');
const logger = require('../../utils/logger').withContext('CmdRating');

/**
 * Обрабатывает команду просмотра рейтинга
 * @param {object} bot - Экземпляр бота
 * @param {object} msg - Сообщение Telegram
 */
const handleRating = async (bot, msg) => {
  const chatId = msg.chat.id;

  try {
    // Топ-20 игроков по рейтингу
    const topPlayers = await db.users.getTopByRating(20);

    if (topPlayers.length === 0) {
      await bot.sendMessage(chatId, '🏆 **Рейтинг пока пуст.**\n\nСыграйте свою первую игру, чтобы появиться в рейтинге!', {
        parse_mode: 'Markdown',
      });
      return;
    }

    let message = '🏆 **Топ игроков**\n\n';

    const medals = ['🥇', '🥈', '🥉'];
    for (let i = 0; i < topPlayers.length; i++) {
      const player = topPlayers[i];
      const rank = i < 3 ? medals[i] : `${i + 1}.`;
      const winRate = player.winRate;

      message += `${rank} **${player.displayName}** — ${player.rating} (${winRate}% побед)\n`;
    }

    message += '\nРейтинг обновляется после каждой игры.';

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error(`Ошибка загрузки рейтинга: ${error.message}`);
    await bot.sendMessage(chatId, '❌ Не удалось загрузить рейтинг.');
  }
};

module.exports = { handleRating };
