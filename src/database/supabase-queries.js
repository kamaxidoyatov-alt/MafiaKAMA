/**
 * Слой доступа к данным Supabase
 * Заменяет Mongoose модели прямыми SQL-запросами через Supabase клиент
 *
 * Каждая функция в этом файле соответствует операциям,
 * которые ранее выполнялись через Mongoose модели.
 */

const { getClient } = require('./supabase');
const logger = require('../utils/logger').withContext('SupabaseQueries');
const memoryStore = require('./memory-store');

/**
 * Fallback: пытается выполнить операцию через Supabase,
 * при ошибке 'table not found' (42P01) переключается на in-memory
 */
let useMemoryFallback = false;

function withFallback(supabaseFn, memoryFn, context) {
  return async (...args) => {
    if (useMemoryFallback) {
      return memoryFn(...args);
    }
    try {
      return await supabaseFn(...args);
    } catch (error) {
      // 42P01 = relation does not exist (таблица не создана)
      // PGRST116 = not found
      if (error?.code === '42P01' || (error?.message && (
        error.message.includes('relation') && error.message.includes('does not exist') ||
        error.message.includes('Could not find the table')
      ))) {
        useMemoryFallback = true;
        logger.warn(`⚠️ Таблица Supabase не найдена. Переключаюсь на in-memory хранилище.`);
        return memoryFn(...args);
      }
      throw error;
    }
  };
}

// =============================================
// USERS
// =============================================

const users = {
  /**
   * Найти пользователя по telegram_id
   * @param {number} telegramId
   * @returns {Promise<object|null>}
   */
  async findByTelegramId(telegramId) {
    const { data, error } = await getClient()
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();
    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      logger.error(`Error finding user by telegram_id ${telegramId}: ${error.message}`);
    }
    return data || null;
  },

  /**
   * Создать нового пользователя
   * @param {object} userData
   * @returns {Promise<object>}
   */
  async create(userData) {
    const { data, error } = await getClient()
      .from('users')
      .insert([{
        telegram_id: userData.telegramId,
        username: userData.username || '',
        first_name: userData.firstName || '',
        last_name: userData.lastName || '',
        is_admin: userData.isAdmin || false,
        is_banned: userData.isBanned || false,
        ban_reason: userData.banReason || '',
        language: userData.language || 'ru',
        last_active_at: new Date().toISOString(),
      }])
      .select()
      .single();
    if (error) {
      logger.error(`Error creating user: ${error.message}`);
      throw error;
    }
    return transformUserFromDB(data);
  },

  /**
   * Обновить пользователя
   * @param {number} telegramId
   * @param {object} updates
   * @returns {Promise<object>}
   */
  async update(telegramId, updates) {
    const dbUpdates = transformUserToDB(updates);
    const { data, error } = await getClient()
      .from('users')
      .update(dbUpdates)
      .eq('telegram_id', telegramId)
      .select()
      .single();
    if (error) {
      logger.error(`Error updating user ${telegramId}: ${error.message}`);
      throw error;
    }
    return transformUserFromDB(data);
  },

  /**
   * Найти всех пользователей с фильтрами и сортировкой
   * @param {object} options
   * @returns {Promise<Array>}
   */
  async findAll(options = {}) {
    let query = getClient().from('users').select('*');

    if (options.isAdmin !== undefined) {
      query = query.eq('is_admin', options.isAdmin);
    }
    if (options.isBanned !== undefined) {
      query = query.eq('is_banned', options.isBanned);
    }
    if (options.minGames !== undefined) {
      query = query.gte('stats->>totalGames', options.minGames);
    }

    // Сортировка
    if (options.sortBy) {
      const direction = options.sortDir === 'asc' ? true : false;
      query = query.order(options.sortBy, { ascending: direction });
    } else {
      query = query.order('rating', { ascending: false });
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
      logger.error(`Error finding users: ${error.message}`);
      return [];
    }
    return (data || []).map(transformUserFromDB);
  },

  /**
   * Получить количество пользователей
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async count(filters = {}) {
    let query = getClient().from('users').select('*', { count: 'exact', head: true });

    if (filters.isBanned !== undefined) {
      query = query.eq('is_banned', filters.isBanned);
    }
    if (filters.lastActiveAfter) {
      query = query.gt('last_active_at', filters.lastActiveAfter.toISOString());
    }

    const { count, error } = await query;
    if (error) {
      logger.error(`Error counting users: ${error.message}`);
      return 0;
    }
    return count || 0;
  },

  /**
   * Топ игроков по рейтингу
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getTopByRating(limit = 20) {
    const { data, error } = await getClient()
      .from('users')
      .select('*')
      .not('stats', 'eq', '{}')
      .order('rating', { ascending: false })
      .limit(limit);
    if (error) {
      logger.error(`Error getting top players: ${error.message}`);
      return [];
    }
    return (data || []).map(transformUserFromDB);
  },

  /**
   * Топ игроков по победам
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getTopByWins(limit = 10) {
    const { data, error } = await getClient()
      .from('users')
      .select('*')
      .order('stats->>wins', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      logger.error(`Error getting top by wins: ${error.message}`);
      return [];
    }
    return (data || []).map(transformUserFromDB);
  },

  /**
   * Топ игроков по количеству игр
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getTopByGames(limit = 10) {
    const { data, error } = await getClient()
      .from('users')
      .select('*')
      .order('stats->>totalGames', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      logger.error(`Error getting top by games: ${error.message}`);
      return [];
    }
    return (data || []).map(transformUserFromDB);
  },
};

// =============================================
// ROOMS
// =============================================

const rooms = {
  /**
   * Найти комнату по коду
   * @param {string} code
   * @returns {Promise<object|null>}
   */
  async findByCode(code) {
    const { data, error } = await getClient()
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();
    if (error && error.code !== 'PGRST116') {
      logger.error(`Error finding room by code ${code}: ${error.message}`);
    }
    return data ? transformRoomFromDB(data) : null;
  },

  /**
   * Создать комнату
   * @param {object} roomData
   * @returns {Promise<object>}
   */
  async create(roomData) {
    const { data, error } = await getClient()
      .from('rooms')
      .insert([{
        code: roomData.code,
        name: roomData.name || 'Комната Мафии',
        type: roomData.type || 'public',
        status: roomData.status || 'waiting',
        creator_id: roomData.creatorId,
        max_players: roomData.maxPlayers || 10,
        players: roomData.players || [],
        settings: roomData.settings || {},
        current_game_id: roomData.currentGameId || null,
      }])
      .select()
      .single();
    if (error) {
      logger.error(`Error creating room: ${error.message}`);
      throw error;
    }
    return transformRoomFromDB(data);
  },

  /**
   * Обновить комнату
   * @param {string} code
   * @param {object} updates
   * @returns {Promise<object>}
   */
  async update(code, updates) {
    const dbUpdates = transformRoomToDB(updates);
    dbUpdates.last_activity = new Date().toISOString();
    const { data, error } = await getClient()
      .from('rooms')
      .update(dbUpdates)
      .eq('code', code)
      .select()
      .single();
    if (error) {
      logger.error(`Error updating room ${code}: ${error.message}`);
      throw error;
    }
    return transformRoomFromDB(data);
  },

  /**
   * Удалить комнату
   * @param {string} code
   */
  async delete(code) {
    const { error } = await getClient()
      .from('rooms')
      .delete()
      .eq('code', code);
    if (error) {
      logger.error(`Error deleting room ${code}: ${error.message}`);
      throw error;
    }
  },

  /**
   * Найти публичные комнаты в ожидании
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async findPublicWaiting(limit = 20) {
    const { data, error } = await getClient()
      .from('rooms')
      .select('*')
      .eq('type', 'public')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      logger.error(`Error finding public rooms: ${error.message}`);
      return [];
    }
    return (data || []).map(transformRoomFromDB);
  },

  /**
   * Найти неактивные комнаты (для очистки)
   * @param {number} olderThanMinutes
   * @returns {Promise<Array>}
   */
  async findInactive(olderThanMinutes = 60) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
    const { data, error } = await getClient()
      .from('rooms')
      .select('*')
      .eq('status', 'waiting')
      .lt('last_activity', cutoff);
    if (error) {
      logger.error(`Error finding inactive rooms: ${error.message}`);
      return [];
    }
    return (data || []).map(transformRoomFromDB);
  },

  /**
   * Проверить уникальность кода комнаты
   * @param {string} code
   * @returns {Promise<boolean>}
   */
  async isCodeUnique(code) {
    const existing = await rooms.findByCode(code);
    return !existing;
  },
};

// =============================================
// GAMES
// =============================================

const games = {
  /**
   * Найти игру по gameId
   * @param {string} gameId
   * @returns {Promise<object|null>}
   */
  async findByGameId(gameId) {
    const { data, error } = await getClient()
      .from('games')
      .select('*')
      .eq('game_id', gameId)
      .single();
    if (error && error.code !== 'PGRST116') {
      logger.error(`Error finding game ${gameId}: ${error.message}`);
    }
    return data ? transformGameFromDB(data) : null;
  },

  /**
   * Создать игру
   * @param {object} gameData
   * @returns {Promise<object>}
   */
  async create(gameData) {
    const { data, error } = await getClient()
      .from('games')
      .insert([{
        game_id: gameData.gameId,
        room_code: gameData.roomCode,
        status: gameData.status || 'in_progress',
        phase: gameData.phase || 'lobby',
        round: gameData.round || 1,
        players: gameData.players || [],
        night_action_queue: gameData.nightActionQueue || [],
        current_night_actor: gameData.currentNightActor || null,
        last_vote_result: gameData.lastVoteResult || null,
        night_results: gameData.nightResults || [],
        actions: gameData.actions || [],
        winner: gameData.winner || null,
        max_players: gameData.maxPlayers || 10,
        phase_timestamps: gameData.phaseTimestamps || {},
        phase_durations: gameData.phaseDurations || { day: 60, night: 45, vote: 40 },
        is_ranked: gameData.isRanked !== false,
        game_log: gameData.gameLog || [],
      }])
      .select()
      .single();
    if (error) {
      logger.error(`Error creating game: ${error.message}`);
      throw error;
    }
    return transformGameFromDB(data);
  },

  /**
   * Обновить игру
   * @param {string} gameId
   * @param {object} updates
   * @returns {Promise<object>}
   */
  async update(gameId, updates) {
    const dbUpdates = transformGameToDB(updates);
    const { data, error } = await getClient()
      .from('games')
      .update(dbUpdates)
      .eq('game_id', gameId)
      .select()
      .single();
    if (error) {
      logger.error(`Error updating game ${gameId}: ${error.message}`);
      throw error;
    }
    return transformGameFromDB(data);
  },

  /**
   * Найти игры по фильтру
   * @param {object} filters
   * @param {object} options
   * @returns {Promise<Array>}
   */
  async find(filters = {}, options = {}) {
    let query = getClient().from('games').select('*');

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.roomCode) {
      query = query.eq('room_code', filters.roomCode);
    }
    if (filters.playerTelegramId) {
      // Поиск по JSONB массиву players
      query = query.contains('players', JSON.stringify([{ telegramId: filters.playerTelegramId }]));
    }
    if (filters.createdAfter) {
      query = query.gte('created_at', filters.createdAfter.toISOString());
    }

    const sortField = options.sortBy || 'created_at';
    const sortAsc = options.sortDir === 'asc';
    query = query.order(sortField, { ascending: sortAsc });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
      logger.error(`Error finding games: ${error.message}`);
      return [];
    }
    return (data || []).map(transformGameFromDB);
  },

  /**
   * Подсчитать игры по фильтру
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async count(filters = {}) {
    let query = getClient().from('games').select('*', { count: 'exact', head: true });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.winner) query = query.eq('winner', filters.winner);
    if (filters.createdAfter) query = query.gte('created_at', filters.createdAfter.toISOString());

    const { count, error } = await query;
    if (error) {
      logger.error(`Error counting games: ${error.message}`);
      return 0;
    }
    return count || 0;
  },
};

// =============================================
// GAME LOGS
// =============================================

const gameLogs = {
  /**
   * Создать запись лога
   * @param {object} logData
   * @returns {Promise<object>}
   */
  async create(logData) {
    const { data, error } = await getClient()
      .from('game_logs')
      .insert([{
        game_id: logData.gameId,
        room_code: logData.roomCode,
        round: logData.round || 1,
        phase: logData.phase,
        event_type: logData.eventType,
        actor_id: logData.actorId || null,
        actor_name: logData.actorName || '',
        target_id: logData.targetId || null,
        target_name: logData.targetName || '',
        message: logData.message,
        is_public: logData.isPublic !== false,
        metadata: logData.metadata || {},
      }])
      .select()
      .single();
    if (error) {
      logger.error(`Error creating game log: ${error.message}`);
      throw error;
    }
    return data;
  },

  /**
   * Найти логи по фильтру
   * @param {object} filters
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async find(filters = {}, limit = 50) {
    let query = getClient().from('game_logs').select('*');

    if (filters.gameId) query = query.eq('game_id', filters.gameId);
    if (filters.eventType) query = query.eq('event_type', filters.eventType);

    query = query.order('created_at', { ascending: false }).limit(limit);

    const { data, error } = await query;
    if (error) {
      logger.error(`Error finding game logs: ${error.message}`);
      return [];
    }
    return data || [];
  },

  /**
   * Подсчитать логи
   * @returns {Promise<number>}
   */
  async count() {
    const { count, error } = await getClient()
      .from('game_logs')
      .select('*', { count: 'exact', head: true });
    if (error) return 0;
    return count || 0;
  },
};

// =============================================
// PLAYER STATS
// =============================================

const playerStatsCollection = {
  /**
   * Найти статистику по telegram_id
   * @param {number} telegramId
   * @returns {Promise<object|null>}
   */
  async findByTelegramId(telegramId) {
    const { data, error } = await getClient()
      .from('player_stats')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();
    if (error && error.code !== 'PGRST116') {
      logger.error(`Error finding player stats ${telegramId}: ${error.message}`);
    }
    return data ? transformPlayerStatsFromDB(data) : null;
  },

  /**
   * Создать статистику игрока
   * @param {number} telegramId
   * @returns {Promise<object>}
   */
  async create(telegramId) {
    const { data, error } = await getClient()
      .from('player_stats')
      .insert([{ telegram_id: telegramId }])
      .select()
      .single();
    if (error) {
      logger.error(`Error creating player stats: ${error.message}`);
      throw error;
    }
    return transformPlayerStatsFromDB(data);
  },

  /**
   * Обновить статистику игрока
   * @param {number} telegramId
   * @param {object} updates
   * @returns {Promise<object>}
   */
  async update(telegramId, updates) {
    const dbUpdates = transformPlayerStatsToDB(updates);
    dbUpdates.last_updated = new Date().toISOString();
    const { data, error } = await getClient()
      .from('player_stats')
      .update(dbUpdates)
      .eq('telegram_id', telegramId)
      .select()
      .single();
    if (error) {
      logger.error(`Error updating player stats ${telegramId}: ${error.message}`);
      throw error;
    }
    return transformPlayerStatsFromDB(data);
  },
};

// =============================================
// Transform helpers (snake_case <-> camelCase)
// =============================================

/**
 * Преобразует запись пользователя из БД в camelCase формат
 */
function transformUserFromDB(dbUser) {
  if (!dbUser) return null;
  return {
    id: dbUser.id,
    telegramId: dbUser.telegram_id,
    username: dbUser.username || '',
    firstName: dbUser.first_name || '',
    lastName: dbUser.last_name || '',
    isAdmin: dbUser.is_admin || false,
    isBanned: dbUser.is_banned || false,
    banReason: dbUser.ban_reason || '',
    stats: dbUser.stats || {
      totalGames: 0, wins: 0, losses: 0,
      winsAsMafia: 0, winsAsPeaceful: 0, winsAsDon: 0,
      winsAsCommissar: 0, winsAsDoctor: 0, winsAsManiac: 0,
      winsAsSheriff: 0, winsAsBodyguard: 0, winsAsMistress: 0,
      kills: 0, deaths: 0, saves: 0, checks: 0, votesCast: 0, survived: 0,
    },
    rating: dbUser.rating || 1000,
    ratingHistory: dbUser.rating_history || [],
    lastActiveAt: dbUser.last_active_at,
    currentRoomId: dbUser.current_room_id,
    language: dbUser.language || 'ru',
    warnings: dbUser.warnings || 0,
    createdAt: dbUser.created_at,
    updatedAt: dbUser.updated_at,
    // Виртуальное поле
    get displayName() {
      if (this.username) return `@${this.username}`;
      return `${this.firstName} ${this.lastName || ''}`.trim() || 'Игрок';
    },
    get winRate() {
      if (this.stats.totalGames === 0) return 0;
      return Math.round((this.stats.wins / this.stats.totalGames) * 100);
    },
  };
}

/**
 * Преобразует camelCase объект пользователя в snake_case для БД
 */
function transformUserToDB(updates) {
  const db = {};
  if (updates.telegramId !== undefined) db.telegram_id = updates.telegramId;
  if (updates.username !== undefined) db.username = updates.username;
  if (updates.firstName !== undefined) db.first_name = updates.firstName;
  if (updates.lastName !== undefined) db.last_name = updates.lastName;
  if (updates.isAdmin !== undefined) db.is_admin = updates.isAdmin;
  if (updates.isBanned !== undefined) db.is_banned = updates.isBanned;
  if (updates.banReason !== undefined) db.ban_reason = updates.banReason;
  if (updates.stats !== undefined) db.stats = updates.stats;
  if (updates.rating !== undefined) db.rating = updates.rating;
  if (updates.ratingHistory !== undefined) db.rating_history = updates.ratingHistory;
  if (updates.lastActiveAt !== undefined) db.last_active_at = updates.lastActiveAt;
  if (updates.currentRoomId !== undefined) db.current_room_id = updates.currentRoomId;
  if (updates.language !== undefined) db.language = updates.language;
  if (updates.warnings !== undefined) db.warnings = updates.warnings;
  return db;
}

/**
 * Преобразует запись комнаты из БД в camelCase
 */
function transformRoomFromDB(dbRoom) {
  if (!dbRoom) return null;
  return {
    id: dbRoom.id,
    code: dbRoom.code,
    name: dbRoom.name || 'Комната Мафии',
    type: dbRoom.type || 'public',
    status: dbRoom.status || 'waiting',
    creatorId: dbRoom.creator_id,
    maxPlayers: dbRoom.max_players || 10,
    players: dbRoom.players || [],
    settings: dbRoom.settings || {},
    currentGameId: dbRoom.current_game_id,
    createdAt: dbRoom.created_at,
    lastActivity: dbRoom.last_activity,
  };
}

function transformRoomToDB(updates) {
  const db = {};
  if (updates.code !== undefined) db.code = updates.code;
  if (updates.name !== undefined) db.name = updates.name;
  if (updates.type !== undefined) db.type = updates.type;
  if (updates.status !== undefined) db.status = updates.status;
  if (updates.creatorId !== undefined) db.creator_id = updates.creatorId;
  if (updates.maxPlayers !== undefined) db.max_players = updates.maxPlayers;
  if (updates.players !== undefined) db.players = updates.players;
  if (updates.settings !== undefined) db.settings = updates.settings;
  if (updates.currentGameId !== undefined) db.current_game_id = updates.currentGameId;
  if (updates.lastActivity !== undefined) db.last_activity = updates.lastActivity;
  return db;
}

/**
 * Преобразует запись игры из БД в camelCase
 */
function transformGameFromDB(dbGame) {
  if (!dbGame) return null;
  return {
    id: dbGame.id,
    gameId: dbGame.game_id,
    roomCode: dbGame.room_code,
    status: dbGame.status || 'in_progress',
    phase: dbGame.phase || 'lobby',
    round: dbGame.round || 1,
    players: dbGame.players || [],
    nightActionQueue: dbGame.night_action_queue || [],
    currentNightActor: dbGame.current_night_actor,
    lastVoteResult: dbGame.last_vote_result,
    nightResults: dbGame.night_results || [],
    actions: dbGame.actions || [],
    winner: dbGame.winner,
    maxPlayers: dbGame.max_players || 10,
    phaseTimestamps: dbGame.phase_timestamps || {},
    phaseDurations: dbGame.phase_durations || { day: 60, night: 45, vote: 40 },
    isRanked: dbGame.is_ranked !== false,
    gameLog: dbGame.game_log || [],
    createdAt: dbGame.created_at,
    updatedAt: dbGame.updated_at,
  };
}

function transformGameToDB(updates) {
  const db = {};
  if (updates.gameId !== undefined) db.game_id = updates.gameId;
  if (updates.roomCode !== undefined) db.room_code = updates.roomCode;
  if (updates.status !== undefined) db.status = updates.status;
  if (updates.phase !== undefined) db.phase = updates.phase;
  if (updates.round !== undefined) db.round = updates.round;
  if (updates.players !== undefined) db.players = updates.players;
  if (updates.nightActionQueue !== undefined) db.night_action_queue = updates.nightActionQueue;
  if (updates.currentNightActor !== undefined) db.current_night_actor = updates.currentNightActor;
  if (updates.lastVoteResult !== undefined) db.last_vote_result = updates.lastVoteResult;
  if (updates.nightResults !== undefined) db.night_results = updates.nightResults;
  if (updates.actions !== undefined) db.actions = updates.actions;
  if (updates.winner !== undefined) db.winner = updates.winner;
  if (updates.maxPlayers !== undefined) db.max_players = updates.maxPlayers;
  if (updates.phaseTimestamps !== undefined) db.phase_timestamps = updates.phaseTimestamps;
  if (updates.phaseDurations !== undefined) db.phase_durations = updates.phaseDurations;
  if (updates.isRanked !== undefined) db.is_ranked = updates.isRanked;
  if (updates.gameLog !== undefined) db.game_log = updates.gameLog;
  return db;
}

/**
 * Преобразует запись статистики игрока из БД в camelCase
 */
function transformPlayerStatsFromDB(dbStats) {
  if (!dbStats) return null;
  return {
    id: dbStats.id,
    telegramId: dbStats.telegram_id,
    total: dbStats.total || { games: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, saves: 0, survived: 0 },
    byRole: dbStats.by_role || {},
    dailyStats: dbStats.daily_stats || [],
    achievements: dbStats.achievements || [],
    streaks: dbStats.streaks || { currentWinStreak: 0, maxWinStreak: 0, currentLoseStreak: 0, maxLoseStreak: 0 },
    lastUpdated: dbStats.last_updated,
    createdAt: dbStats.created_at,
    updatedAt: dbStats.updated_at,
    get winRate() {
      if (this.total.games === 0) return 0;
      return Math.round((this.total.wins / this.total.games) * 100);
    },
  };
}

function transformPlayerStatsToDB(updates) {
  const db = {};
  if (updates.telegramId !== undefined) db.telegram_id = updates.telegramId;
  if (updates.total !== undefined) db.total = updates.total;
  if (updates.byRole !== undefined) db.by_role = updates.byRole;
  if (updates.dailyStats !== undefined) db.daily_stats = updates.dailyStats;
  if (updates.achievements !== undefined) db.achievements = updates.achievements;
  if (updates.streaks !== undefined) db.streaks = updates.streaks;
  return db;
}

// =============================================
// Экспорт с Fallback-обёрткой
// Каждая функция сначала пробует Supabase,
// при ошибке "таблица не найдена" переключается на in-memory
// =============================================

module.exports = {
  users: {
    findByTelegramId: withFallback(
      users.findByTelegramId.bind(users),
      (id) => memoryStore.users.findByTelegramId(id)
    ),
    create: withFallback(
      users.create.bind(users),
      (data) => memoryStore.users.create(data)
    ),
    update: withFallback(
      users.update.bind(users),
      (id, data) => memoryStore.users.update(id, data)
    ),
    findAll: withFallback(
      users.findAll.bind(users),
      (opts) => memoryStore.users.findAll(opts)
    ),
    count: withFallback(
      users.count.bind(users),
      (filters) => memoryStore.users.count(filters)
    ),
    getTopByRating: withFallback(
      users.getTopByRating.bind(users),
      (limit) => memoryStore.users.getTopByRating(limit)
    ),
    getTopByWins: withFallback(
      users.getTopByWins.bind(users),
      (limit) => memoryStore.users.getTopByWins(limit)
    ),
    getTopByGames: withFallback(
      users.getTopByGames.bind(users),
      (limit) => memoryStore.users.getTopByGames(limit)
    ),
  },
  rooms: {
    findByCode: withFallback(
      (code) => rooms.findByCode(code),
      (code) => memoryStore.rooms.findByCode(code)
    ),
    create: withFallback(
      rooms.create.bind(rooms),
      (data) => memoryStore.rooms.create(data)
    ),
    update: withFallback(
      rooms.update.bind(rooms),
      (code, data) => memoryStore.rooms.update(code, data)
    ),
    delete: withFallback(
      rooms.delete.bind(rooms),
      (code) => memoryStore.rooms.delete(code)
    ),
    findPublicWaiting: withFallback(
      rooms.findPublicWaiting.bind(rooms),
      (limit) => memoryStore.rooms.findPublicWaiting(limit)
    ),
    findInactive: withFallback(
      rooms.findInactive.bind(rooms),
      (mins) => memoryStore.rooms.findInactive(mins)
    ),
    isCodeUnique: withFallback(
      rooms.isCodeUnique.bind(rooms),
      (code) => memoryStore.rooms.isCodeUnique(code)
    ),
    // Алиасы для совместимости
    findOne: withFallback(
      async (filter) => {
        if (filter.code) return rooms.findByCode(filter.code);
        return null;
      },
      async (filter) => {
        if (filter.code) return memoryStore.rooms.findByCode(filter.code);
        return null;
      }
    ),
    deleteOne: withFallback(
      async (filter) => {
        if (filter.code) await rooms.delete(filter.code);
      },
      async (filter) => {
        if (filter.code) await memoryStore.rooms.delete(filter.code);
      }
    ),
    find: withFallback(
      async (filter = {}) => {
        if (filter.type === 'public' && filter.status === 'waiting') {
          return rooms.findPublicWaiting();
        }
        if (filter.status && filter.status.$ne === 'finished') {
          return rooms.findInactive(60);
        }
        return [];
      },
      async (filter = {}) => {
        if (filter.type === 'public' && filter.status === 'waiting') {
          return memoryStore.rooms.findPublicWaiting();
        }
        if (filter.status && filter.status.$ne === 'finished') {
          return memoryStore.rooms.findInactive(60);
        }
        return [];
      }
    ),
  },
  games: {
    findByGameId: withFallback(
      games.findByGameId.bind(games),
      (id) => memoryStore.games.findByGameId(id)
    ),
    create: withFallback(
      games.create.bind(games),
      (data) => memoryStore.games.create(data)
    ),
    update: withFallback(
      games.update.bind(games),
      (id, data) => memoryStore.games.update(id, data)
    ),
    count: withFallback(
      games.count.bind(games),
      (filters) => memoryStore.games.count(filters)
    ),
    // Алиасы для совместимости
    findOne: withFallback(
      async (filter) => {
        if (filter.gameId) return games.findByGameId(filter.gameId);
        if (filter.roomCode) {
          const results = await games.find({ roomCode: filter.roomCode, status: filter.status }, { limit: 1 });
          return results[0] || null;
        }
        return null;
      },
      async (filter) => {
        if (filter.gameId) return memoryStore.games.findByGameId(filter.gameId);
        if (filter.roomCode) {
          const results = await memoryStore.games.find({ roomCode: filter.roomCode, status: filter.status }, { limit: 1 });
          return results[0] || null;
        }
        return null;
      }
    ),
    find: withFallback(
      async (filter = {}, options = { sort: { createdAt: -1 }, limit: 20 }) => {
        return games.find(filter, { sortBy: 'created_at', sortDir: 'desc', limit: options.limit || 20 });
      },
      async (filter = {}, options = { sort: { createdAt: -1 }, limit: 20 }) => {
        return memoryStore.games.find(filter, { limit: options.limit || 20 });
      }
    ),
  },
  gameLogs: {
    create: withFallback(
      gameLogs.create.bind(gameLogs),
      (data) => memoryStore.gameLogs.create(data)
    ),
    find: withFallback(
      gameLogs.find.bind(gameLogs),
      (filters, limit) => memoryStore.gameLogs.find(filters, limit)
    ),
    count: withFallback(
      gameLogs.count.bind(gameLogs),
      () => memoryStore.gameLogs.count()
    ),
  },
  playerStatsCollection: {
    findByTelegramId: withFallback(
      playerStatsCollection.findByTelegramId.bind(playerStatsCollection),
      (id) => memoryStore.playerStatsCollection.findByTelegramId(id)
    ),
    create: withFallback(
      playerStatsCollection.create.bind(playerStatsCollection),
      (id) => memoryStore.playerStatsCollection.create(id)
    ),
    update: withFallback(
      playerStatsCollection.update.bind(playerStatsCollection),
      (id, data) => memoryStore.playerStatsCollection.update(id, data)
    ),
  },
};

// Экспортируем memoryStore для прямого доступа (например, для сброса в тестах)
module.exports.memoryStore = memoryStore;
