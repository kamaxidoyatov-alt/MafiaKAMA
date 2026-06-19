/**
 * Модуль клавиатур для Telegram бота
 * Все inline-клавиатуры и reply-клавиатуры
 */

/**
 * Главное меню
 * @param {boolean} isAdmin - Является ли пользователь админом
 * @returns {object} Inline клавиатура
 */
const mainMenu = (isAdmin = false, botUsername = null) => {
  const keyboard = [
    [
      { text: '🎮 Создать комнату', callback_data: 'create_room' },
      { text: '🔍 Найти комнату', callback_data: 'find_room' },
    ],
    [
      { text: '📊 Моя статистика', callback_data: 'my_stats' },
      { text: '🏆 Рейтинг', callback_data: 'rating' },
    ],
    [
      { text: '📖 Правила', callback_data: 'rules' },
      { text: '❓ Помощь', callback_data: 'help' },
    ],
  ];

  // Кнопка добавления в группу
  if (botUsername) {
    keyboard.push([
      {
        text: '👥 Добавить в группу',
        url: `https://t.me/${botUsername}?startgroup=true`,
      },
    ]);
  }

  if (isAdmin) {
    keyboard.push([
      { text: '⚙️ Админ-панель', callback_data: 'admin_panel' },
    ]);
  }

  return {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  };
};

/**
 * Меню создания комнаты
 * @returns {object} Inline клавиатура
 */
const createRoomMenu = () => {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🌐 Публичная', callback_data: 'room_type_public' },
          { text: '🔒 Приватная', callback_data: 'room_type_private' },
        ],
        [
          { text: '◀️ Назад', callback_data: 'main_menu' },
        ],
      ],
    },
  };
};

/**
 * Меню комнаты (лобби)
 * @param {object} room - Объект комнаты
 * @param {number} userTelegramId - ID пользователя телеграм
 * @returns {object} Inline клавиатура
 */
const roomLobbyMenu = (room, userTelegramId) => {
  const isCreator = room.creatorId === userTelegramId;
  const playerInRoom = room.players.some(p => p.telegramId === userTelegramId);

  const keyboard = [];

  if (playerInRoom) {
    const player = room.players.find(p => p.telegramId === userTelegramId);
    keyboard.push([
      {
        text: player.isReady ? '✅ Готов' : '⏳ Не готов',
        callback_data: `toggle_ready`,
      },
    ]);
    keyboard.push([
      { text: '🚪 Покинуть комнату', callback_data: 'leave_room' },
    ]);
  } else {
    keyboard.push([
      { text: '✅ Войти в комнату', callback_data: `join_room_${room.code}` },
    ]);
  }

  if (isCreator) {
    keyboard.push([
      { text: '🚀 Начать игру', callback_data: 'start_game' },
    ]);
    keyboard.push([
      { text: '⚙️ Настройки', callback_data: 'room_settings' },
    ]);
  }

  keyboard.push([
    { text: '🔄 Обновить', callback_data: `refresh_room_${room.code}` },
    { text: '◀️ Назад', callback_data: 'main_menu' },
  ]);

  return {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  };
};

/**
 * Выбор цели (для ночной фазы)
 * @param {Array} players - Массив живых игроков (кроме текущего)
 * @param {string} action - Тип действия
 * @returns {object} Inline клавиатура
 */
const selectTargetMenu = (players, action) => {
  const keyboard = [];

  // По 2 кнопки в ряд
  for (let i = 0; i < players.length; i += 2) {
    const row = [];
    row.push({
      text: `👤 ${players[i].firstName}`,
      callback_data: `night_action_${action}_${players[i].telegramId}`,
    });
    if (i + 1 < players.length) {
      row.push({
        text: `👤 ${players[i + 1].firstName}`,
        callback_data: `night_action_${action}_${players[i + 1].telegramId}`,
      });
    }
    keyboard.push(row);
  }

  return {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  };
};

/**
 * Клавиатура голосования (дневная фаза)
 * @param {Array} players - Массив живых игроков (кроме текущего)
 * @returns {object} Inline клавиатура
 */
const voteMenu = (players) => {
  const keyboard = [];

  // По 2 кнопки в ряд
  for (let i = 0; i < players.length; i += 2) {
    const row = [];
    row.push({
      text: `🗳️ ${players[i].firstName}`,
      callback_data: `vote_${players[i].telegramId}`,
    });
    if (i + 1 < players.length) {
      row.push({
        text: `🗳️ ${players[i + 1].firstName}`,
        callback_data: `vote_${players[i + 1].telegramId}`,
      });
    }
    keyboard.push(row);
  }

  keyboard.push([
    { text: '⏭️ Воздержаться', callback_data: 'vote_abstain' },
  ]);

  return {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  };
};

/**
 * Клавиатура списка комнат
 * @param {Array} rooms - Массив комнат
 * @returns {object} Inline клавиатура
 */
const roomsListMenu = (rooms) => {
  const keyboard = [];

  for (const room of rooms) {
    keyboard.push([
      {
        text: `🚪 ${room.name} (${room.players.length}/${room.maxPlayers}) [${room.code}]`,
        callback_data: `view_room_${room.code}`,
      },
    ]);
  }

  keyboard.push([
    { text: '🔄 Обновить', callback_data: 'find_room' },
    { text: '◀️ Назад', callback_data: 'main_menu' },
  ]);

  return {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  };
};

/**
 * Настройки комнаты (для создателя)
 * @param {object} room - Комната
 * @returns {object} Inline клавиатура
 */
const roomSettingsMenu = (room) => {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `👥 Макс: ${room.maxPlayers}`, callback_data: 'settings_maxplayers' },
        ],
        [
          { text: `☀️ День: ${room.settings.dayDuration}с`, callback_data: 'settings_day' },
          { text: `🌙 Ночь: ${room.settings.nightDuration}с`, callback_data: 'settings_night' },
        ],
        [
          { text: `🗳️ Голосование: ${room.settings.voteDuration}с`, callback_data: 'settings_vote' },
        ],
        [
          {
            text: room.settings.isRanked ? '🏆 Рейтинг: Вкл' : '🏆 Рейтинг: Выкл',
            callback_data: 'toggle_ranked',
          },
        ],
        [
          { text: '◀️ Назад', callback_data: `room_lobby_${room.code}` },
        ],
      ],
    },
  };
};

/**
 * Админ-панель
 * @returns {object} Inline клавиатура
 */
const adminMenu = () => {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📊 Дашборд', callback_data: 'admin_dashboard' },
          { text: '🚪 Комнаты', callback_data: 'admin_rooms' },
        ],
        [
          { text: '👥 Игроки', callback_data: 'admin_players' },
          { text: '📝 Логи', callback_data: 'admin_logs' },
        ],
        [
          { text: '📈 Аналитика', callback_data: 'admin_analytics' },
          { text: '🔧 Сервер', callback_data: 'admin_server' },
        ],
        [
          { text: '◀️ Назад', callback_data: 'main_menu' },
        ],
      ],
    },
  };
};

/**
 * Подтверждение действия
 * @param {string} action - Действие для подтверждения
 * @param {string} confirmText - Текст кнопки подтверждения
 * @returns {object} Inline клавиатура
 */
const confirmMenu = (action, confirmText = '✅ Подтвердить') => {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: confirmText, callback_data: `confirm_${action}` },
          { text: '❌ Отмена', callback_data: 'cancel' },
        ],
      ],
    },
  };
};

/**
 * Клавиатура для просмотра профиля другого игрока
 * @param {number} playerId - ID игрока
 * @returns {object} Inline клавиатура
 */
const playerProfileMenu = (playerId) => {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '◀️ Назад', callback_data: 'main_menu' },
        ],
      ],
    },
  };
};

module.exports = {
  mainMenu,
  createRoomMenu,
  roomLobbyMenu,
  selectTargetMenu,
  voteMenu,
  roomsListMenu,
  roomSettingsMenu,
  adminMenu,
  confirmMenu,
  playerProfileMenu,
};
