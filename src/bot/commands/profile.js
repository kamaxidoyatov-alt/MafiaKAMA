/**
 * Команда профиля и статистики игрока
 * Показывает статистику игрока, рейтинг и достижения
 */

const db = require('../../database/supabase-queries');
const { playerProfileMenu } = require('../keyboards');
const logger = require('../../utils/logger').withContext('CmdProfile');

/**
 * Обрабатывает команду просмотра статистики
 * @param {object} bot - Экземпляр бота
 * @param {object} msg - Сообщение Telegram
 */
const handleProfile = async (bot, msg) => {
  const chatId = msg.chat.id;
  const from = msg.from;

  try {
    let user = await db.users.findByTelegramId(from.id);

    if (!user) {
      await bot.sendMessage(chatId, '❌ Профиль не найден. Используйте /start для регистрации.');
      return;
    }

    const winRate = user.winRate;
    const totalGames = user.stats.totalGames;
    const ratingChange = user.ratingHistory.length > 0
      ? user.ratingHistory[user.ratingHistory.length - 1].change
      : 0;
    const ratingChangeStr = ratingChange >= 0 ? `+${ratingChange}` : `${ratingChange}`;

    let message = `👤 **Профиль игрока**\n\n`;
    message += `**${user.displayName}**\n\n`;
    message += `📊 **Статистика:**\n`;
    message += `• Игр сыграно: ${totalGames}\n`;
    message += `• Побед: ${user.stats.wins}\n`;
    message += `• Поражений: ${user.stats.losses}\n`;
    message += `• Процент побед: ${winRate}%\n`;
    message += `• Выживаний: ${user.stats.survived}\n\n`;

    message += `🏆 **Рейтинг:** ${user.rating} (${ratingChangeStr})\n\n`;

    message += `🎭 **По ролям:**\n`;
    message += `• Мафия: ${user.stats.winsAsMafia} побед\n`;
    message += `• Мирный: ${user.stats.winsAsPeaceful} побед\n`;
    message += `• Комиссар: ${user.stats.winsAsCommissar} побед\n`;
    message += `• Доктор: ${user.stats.winsAsDoctor} побед\n`;
    message += `• Дон: ${user.stats.winsAsDon} побед\n`;

    if (totalGames === 0) {
      message += '\n🎮 Сыграйте свою первую игру, чтобы статистика появилась!';
    }

    const currentRoom = user.currentRoomId ? `\n🎮 В игре: комната ${user.currentRoomId}` : '';

    await bot.sendMessage(chatId, message + currentRoom, {
      parse_mode: 'Markdown',
      ...playerProfileMenu(from.id),
    });

  } catch (error) {
    logger.error(`Ошибка профиля: ${error.message}`);
    await bot.sendMessage(chatId, '❌ Не удалось загрузить профиль.');
  }
};

/**
 * Обрабатывает команду просмотра профиля другого игрока
 * @param {object} bot - Экземпляр бота
 * @param {number} chatId - ID чата
 * @param {number} targetTelegramId - ID целевого игрока
 */
const handlePlayerProfile = async (bot, chatId, targetTelegramId) => {
  try {
    const user = await db.users.findByTelegramId(targetTelegramId);
    if (!user) {
      await bot.sendMessage(chatId, '❌ Игрок не найден.');
      return;
    }

    const winRate = user.winRate;

    let message = `👤 **${user.displayName}**\n\n`;
    message += `📊 **Статистика:**\n`;
    message += `• Игр: ${user.stats.totalGames}\n`;
    message += `• Побед: ${user.stats.wins}\n`;
    message += `• Побед: ${winRate}%\n`;
    message += `• Рейтинг: ${user.rating}\n`;

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error(`Ошибка профиля игрока: ${error.message}`);
  }
};

module.exports = { handleProfile, handlePlayerProfile };
