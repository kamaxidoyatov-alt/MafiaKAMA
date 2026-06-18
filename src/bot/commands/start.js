/**
 * Команда /start 
 * Приветствие и регистрация нового пользователя
 */

const db = require('../../database/supabase-queries');
const { mainMenu } = require('../keyboards');
const logger = require('../../utils/logger').withContext('CmdStart');
const config = require('../../config');

/**
 * Обрабатывает команду /start
 * @param {object} bot - Экземпляр бота
 * @param {object} msg - Сообщение Telegram
 */
const handleStart = async (bot, msg) => {
  const chatId = msg.chat.id;
  const from = msg.from;

  try {
    // Регистрируем/обновляем пользователя
    let user = await db.users.findByTelegramId(from.id);

    if (!user) {
      // Первый зарегистрированный пользователь автоматически становится админом
      const userCount = await db.users.count();
      const isFirstUser = userCount === 0;
      const isSuperAdmin = config.superAdminIds.includes(from.id);
      const isAdmin = isFirstUser || isSuperAdmin;

      user = await db.users.create({
        telegramId: from.id,
        username: from.username || '',
        firstName: from.first_name || '',
        lastName: from.last_name || '',
        isAdmin: isAdmin,
        lastActiveAt: new Date(),
      });
      
      if (isFirstUser) {
        logger.info(`👑 Первый пользователь назначен админом: ${from.first_name} (@${from.username})`);
      } else if (isSuperAdmin) {
        logger.info(`👑 Супер-админ назначен: ${from.first_name} (@${from.username})`);
      }
      logger.info(`Новый пользователь: ${from.first_name} (@${from.username})`);
    } else {
      // Для существующих пользователей — проверяем, не супер-админ ли
      const isSuperAdmin = config.superAdminIds.includes(from.id);
      const updates = { lastActiveAt: new Date() };
      if (from.username) updates.username = from.username;
      if (from.first_name) updates.firstName = from.first_name;
      if (from.last_name) updates.lastName = from.last_name;

      if (isSuperAdmin && !user.isAdmin) {
        updates.isAdmin = true;
        logger.info(`👑 Супер-админ восстановлен: ${from.first_name} (@${from.username})`);
      }
      
      user = await db.users.update(from.id, updates);
    }

    // Приветственное сообщение
    let welcomeMessage = `🎮 **Добро пожаловать в Мафию!**\n\n`;
    welcomeMessage += `Привет, ${from.first_name}! 🎭\n\n`;
    welcomeMessage += `Это онлайн-версия культовой игры «Мафия».\n`;
    welcomeMessage += `Здесь вы можете играть с реальными людьми и AI-агентами.\n\n`;
    welcomeMessage += `**Что можно делать:**\n`;
    welcomeMessage += `🎯 Создавать или присоединяться к игровым комнатам\n`;
    welcomeMessage += `🎭 Получать роли и выполнять ночные действия\n`;
    welcomeMessage += `🗣️ Обсуждать и голосовать днём\n`;
    welcomeMessage += `🏆 Соревноваться за место в рейтинге\n\n`;

    if (user.isAdmin) {
      welcomeMessage += `⚙️ У вас есть права администратора.\n\n`;
    }

    welcomeMessage += `Выберите действие в меню ниже:`;

    await bot.sendMessage(chatId, welcomeMessage, {
      parse_mode: 'Markdown',
      ...mainMenu(user.isAdmin),
    });

  } catch (error) {
    logger.error(`Ошибка в /start: ${error.message}`);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
};

module.exports = { handleStart };
