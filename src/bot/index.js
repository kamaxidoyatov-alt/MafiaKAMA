/**
 * Главный файл Telegram бота
 * Инициализация, обработка команд и callback-запросов
 */

const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const logger = require('../utils/logger').withContext('Bot');
const { applyRateLimiter } = require('./middleware/rateLimiter');
const { mainMenu, adminMenu } = require('./keyboards');

// Команды
const { handleStart } = require('./commands/start');
const { handleCreateRoom, handleRoomTypeChoice } = require('./commands/createRoom');
const { handleFindRoom, handleJoinByCode, handleViewRoom } = require('./commands/joinRoom');
const { handleLeaveRoom } = require('./commands/leaveRoom');
const { toggleReady } = require('./game/room');
const { escapeHtml } = require('../utils/helpers');
const { handleProfile } = require('./commands/profile');
const { handleRating } = require('./commands/rating');
const { handleHelp, handleRules } = require('./commands/help');
const {
  handleAdmin,
  handleAdminDashboard,
  handleAdminRooms,
  handleAdminAnalytics,
  handleAdminLogs,
  handleBan,
  handleUnban,
  handleDeleteRoom,
} = require('./commands/admin');

// Сервисы
const gameService = require('../services/gameService');
const db = require('../database/supabase-queries');

let bot = null;

/**
 * Инициализирует и запускает Telegram бота
 * @returns {Promise<object>} Экземпляр бота
 */
const initBot = async () => {
  if (!config.botToken) {
    logger.error('BOT_TOKEN не настроен в .env');
    throw new Error('BOT_TOKEN is required');
  }

  bot = new TelegramBot(config.botToken, { polling: true });

  // Применяем rate limiter
  applyRateLimiter(bot);

  // Регистрируем команды
  setupCommands();
  setupCallbacks();

  // Устанавливаем команды меню
  await bot.setMyCommands([
    { command: 'start', description: '🚀 Запустить бота и зарегистрироваться' },
    { command: 'create', description: '🎮 Создать игровую комнату' },
    { command: 'join', description: '🔍 Присоединиться к комнате по коду' },
    { command: 'rooms', description: '🏠 Список публичных комнат' },
    { command: 'profile', description: '👤 Моя статистика и профиль' },
    { command: 'rating', description: '🏆 Топ игроков по рейтингу' },
    { command: 'rules', description: '📖 Правила игры' },
    { command: 'help', description: '❓ Помощь' },
    { command: 'admin', description: '⚙️ Админ-панель' },
  ]);

  // Обработка ошибок
  bot.on('polling_error', (error) => {
    logger.error(`Polling error: ${error.message}`);
  });

  bot.on('webhook_error', (error) => {
    logger.error(`Webhook error: ${error.message}`);
  });

  logger.info('Telegram бот запущен');
  return bot;
};

/**
 * Настраивает текстовые команды
 */
const setupCommands = () => {
  // /start
  bot.onText(/^\/start$/, (msg) => handleStart(bot, msg));

  // /create
  bot.onText(/^\/create$/, (msg) => handleCreateRoom(bot, msg));

  // /join <code>
  bot.onText(/^\/join(?:\s+(\w+))?$/, (msg, match) => {
    handleJoinByCode(bot, msg, match ? match[1] : null);
  });

  // /rooms
  bot.onText(/^\/rooms$/, (msg) => handleFindRoom(bot, msg));

  // /profile
  bot.onText(/^\/profile$/, (msg) => handleProfile(bot, msg));

  // /rating
  bot.onText(/^\/rating$/, (msg) => handleRating(bot, msg));

  // /rules
  bot.onText(/^\/rules$/, (msg) => handleRules(bot, msg));

  // /help
  bot.onText(/^\/help$/, (msg) => handleHelp(bot, msg));

  // /admin
  bot.onText(/^\/admin$/, (msg) => handleAdmin(bot, msg));

  // /ban <id> <reason>
  bot.onText(/^\/ban\s+(\d+)\s+(.+)$/, (msg, match) => {
    handleBan(bot, msg, `${match[1]} ${match[2]}`);
  });

  // /unban <id>
  bot.onText(/^\/unban\s+(\d+)$/, (msg, match) => {
    handleUnban(bot, msg, match[1]);
  });

  // /delroom <code>
  bot.onText(/^\/delroom\s+(\w+)$/, (msg, match) => {
    handleDeleteRoom(bot, msg, match[1]);
  });

  // Обработка обычных сообщений (чат в лобби)
  bot.on('message', (msg) => {
    // Игнорируем команды (они обработаны выше)
    if (msg.text && msg.text.startsWith('/')) return;
    // TODO: обработка чата в комнате
  });
};

/**
 * Настраивает обработку callback-запросов (inline keyboard)
 */
const setupCallbacks = () => {
  bot.on('callback_query', async (query) => {
    const data = query.data;
    const msg = query.message;
    const from = query.from;

    try {
      switch (true) {
        // Главное меню
        case data === 'main_menu': {
          const user = await db.users.findByTelegramId(from.id);
          await bot.editMessageText(
            '🎮 **Главное меню**\n\nВыберите действие:',
            {
              chat_id: msg.chat.id,
              message_id: msg.message_id,
              parse_mode: 'Markdown',
              ...mainMenu(user?.isAdmin || false),
            }
          );
          break;
        }

        // Создание комнаты
        case data === 'create_room':
          await bot.editMessageText(
            '🎮 **Создание комнаты**\n\nВыберите тип комнаты:',
            {
              chat_id: msg.chat.id,
              message_id: msg.message_id,
              parse_mode: 'Markdown',
              ...require('./keyboards').createRoomMenu(),
            }
          );
          break;

        case data.startsWith('room_type_'):
          await handleRoomTypeChoice(bot, query);
          break;

        // Поиск комнат
        case data === 'find_room':
          await handleFindRoom(bot, msg);
          break;

        // Просмотр комнаты
        case data.startsWith('view_room_'):
          await handleViewRoom(bot, query, data.replace('view_room_', ''));
          break;

        // Тоггл готовности
        case data === 'toggle_ready': {
          // Находим комнату через activeRooms кэш
          const { activeRooms } = require('./game/room');
          let roomDoc = null;
          for (const [code, r] of activeRooms) {
            if (r.players.some(p => p.telegramId === from.id) && r.status === 'waiting') {
              roomDoc = r;
              break;
            }
          }
          // Комнаты всегда в activeRooms, если игрок в них
          if (!roomDoc) {
            await bot.answerCallbackQuery(query.id, { text: '❌ Вы не в комнате', show_alert: true });
            break;
          }
          
          const player = roomDoc.players.find(p => p.telegramId === from.id);
          if (!player) {
            await bot.answerCallbackQuery(query.id, { text: '❌ Вы не в комнате', show_alert: true });
            break;
          }
          
          const newReady = !player.isReady;
          const result = await toggleReady(roomDoc, from.id, newReady);
          
          if (!result.success) {
            await bot.answerCallbackQuery(query.id, { text: '❌ Ошибка', show_alert: true });
            break;
          }
          
          const playerList = result.room.players.map((p, idx) =>
            `${idx + 1}. <b>${escapeHtml(p.firstName)}</b>${p.telegramId === result.room.creatorId ? ' 👑' : ''}${p.isReady ? ' ✅' : ' ⏳'}`
          ).join('\n');

          let message = `🚪 <b>${escapeHtml(result.room.name)}</b> [<code>${result.room.code}</code>]\n\n`;
          message += `👥 <b>${result.room.players.length}/${result.room.maxPlayers} игроков</b>\n`;
          message += `🔒 ${result.room.type === 'public' ? '🌐 Публичная' : '🔒 Приватная'}\n\n`;
          message += `<b>Игроки:</b>\n${playerList}`;

          await bot.editMessageText(message, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            parse_mode: 'HTML',
            ...require('./keyboards').roomLobbyMenu(result.room, from.id),
          });

          // Оповещаем других игроков в комнате
          for (const other of result.room.players) {
            if (other.telegramId !== from.id && other.chatId) {
              try {
                const statusText = newReady ? '✅ <b>Готов</b>' : '⏳ <b>Не готов</b>';
                await bot.sendMessage(other.chatId,
                  `${escapeHtml(from.first_name || 'Игрок')} — ${statusText}`,
                  { parse_mode: 'HTML' }
                );
              } catch (e) { /* ignore */ }
            }
          }

          await bot.answerCallbackQuery(query.id, {
            text: newReady ? '✅ Готов!' : '⏳ Не готов',
            show_alert: false,
          });
          break;
        }

        // Вход в комнату (из просмотра комнаты)
        case data.startsWith('join_room_'): {
          const joinCode = data.replace('join_room_', '');
          // Создаём фейковый msg с правильным from (query.from, не msg.from)
          const fakeMsg = {
            chat: { id: msg.chat.id },
            from: query.from,
            text: `/join ${joinCode}`,
          };
          await handleJoinByCode(bot, fakeMsg, joinCode);
          await bot.answerCallbackQuery(query.id);
          break;
        }

        // Выход из комнаты
        case data === 'leave_room': {
          const fakeMsg = { chat: { id: msg.chat.id }, from: query.from, text: '/leave' };
          await handleLeaveRoom(bot, fakeMsg);
          await bot.answerCallbackQuery(query.id);
          break;
        }

        // Старт игры
        case data === 'start_game': {
          const { activeRooms } = require('./game/room');
          let room = null;
          for (const [code, r] of activeRooms) {
            if (r.players.some(p => p.telegramId === from.id) && r.status === 'waiting') {
              room = r;
              break;
            }
          }
          
          if (!room) {
            await bot.answerCallbackQuery(query.id, { text: '❌ Комната не найдена', show_alert: true });
            break;
          }
          
          if (room.creatorId !== from.id) {
            await bot.answerCallbackQuery(query.id, { text: '⛔ Только создатель может начать игру', show_alert: true });
            break;
          }
          
          // Проверяем, все ли готовы
          const notReadyPlayers = room.players.filter(p => !p.isReady);
          if (notReadyPlayers.length > 0) {
            const names = notReadyPlayers.map(p => escapeHtml(p.firstName)).join(', ');
            await bot.answerCallbackQuery(query.id, {
              text: `⏳ Ожидаем: ${names}`,
              show_alert: true,
            });
            break;
          }
          
          if (room.players.length < 4) {
            await bot.answerCallbackQuery(query.id, {
              text: `❌ Нужно минимум 4 игрока. Сейчас: ${room.players.length}`,
              show_alert: true,
            });
            break;
          }
          
          const result = await gameService.handleStartGame(room.code, from.id);
          
          // Оповещаем всех игроков о старте игры
          if (result.success) {
            for (const p of room.players) {
              if (p.chatId) {
                try {
                  await bot.sendMessage(p.chatId,
                    `🚀 <b>Игра начинается!</b>\n\nПроверьте свои роли в лобби!`,
                    { parse_mode: 'HTML' }
                  );
                } catch (e) { /* ignore */ }
              }
            }
          }
          
          await bot.answerCallbackQuery(query.id, {
            text: result.message || '✅ Игра начинается!',
            show_alert: true,
          });
          break;
        }

        // Статистика
        case data === 'my_stats':
          await handleProfile(bot, msg);
          break;

        // Рейтинг
        case data === 'rating':
          await handleRating(bot, msg);
          break;

        // Правила
        case data === 'rules':
          await handleRules(bot, msg);
          break;

        // Помощь
        case data === 'help':
          await handleHelp(bot, msg);
          break;

        // Админ-панель
        case data === 'admin_panel':
          await handleAdmin(bot, msg);
          break;

        case data === 'admin_dashboard':
          await handleAdminDashboard(bot, query);
          break;

        case data === 'admin_rooms':
          await handleAdminRooms(bot, query);
          break;

        case data === 'admin_analytics':
          await handleAdminAnalytics(bot, query);
          break;

        case data === 'admin_logs':
          await handleAdminLogs(bot, query);
          break;

        // Голосование
        case data.startsWith('vote_'):
          if (data === 'vote_abstain') {
            // Воздержался
            await bot.answerCallbackQuery(query.id, { text: '⏭️ Вы воздержались' });
          } else {
            const voteTargetId = parseInt(data.replace('vote_', ''));
            // TODO: найти текущую игру и обработать голос
            await bot.answerCallbackQuery(query.id, { text: '✅ Голос принят!' });
          }
          break;

        // Обновление комнаты
        case data.startsWith('refresh_room_'):
          await handleViewRoom(bot, query, data.replace('refresh_room_', ''));
          break;

        // Default
        default:
          await bot.answerCallbackQuery(query.id, {
            text: '❓ Неизвестная команда',
            show_alert: false,
          });
      }
    } catch (error) {
      logger.error(`Ошибка callback: ${error.message}`);
      await bot.answerCallbackQuery(query.id, {
        text: '❌ Произошла ошибка',
        show_alert: true,
      }).catch(() => {});
    }
  });
};

/**
 * Останавливает бота
 */
const stopBot = () => {
  if (bot) {
    bot.stopPolling();
    logger.info('Бот остановлен');
  }
};

module.exports = {
  initBot,
  stopBot,
  getBot: () => bot,
};
