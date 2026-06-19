/**
 * In-memory хранилище данных (fallback для Supabase)
 * Используется, когда таблицы в Supabase ещё не созданы
 */

const logger = require('../utils/logger').withContext('MemoryStore');

// =============================================
// In-memory хранилища
// =============================================
const stores = {
  users: new Map(),       // telegram_id -> user
  rooms: new Map(),       // code -> room
  games: new Map(),       // game_id -> game
  gameLogs: [],           // array of logs
  playerStats: new Map(), // telegram_id -> stats
  counters: {
    users: 0,
    rooms: 0,
    games: 0,
    gameLogs: 0,
    playerStats: 0,
  },
};

// =============================================
// USERS
// =============================================

const users = {
  async findByTelegramId(telegramId) {
    const user = stores.users.get(Number(telegramId));
    return user ? { ...user } : null;
  },

  async create(userData) {
    stores.counters.users++;
    const now = new Date().toISOString();
    const user = {
      id: stores.counters.users,
      telegram_id: Number(userData.telegramId),
      username: userData.username || '',
      first_name: userData.firstName || '',
      last_name: userData.lastName || '',
      is_admin: userData.isAdmin || false,
      is_banned: userData.isBanned || false,
      ban_reason: userData.banReason || '',
      stats: {
        totalGames: 0, wins: 0, losses: 0,
        winsAsMafia: 0, winsAsPeaceful: 0, winsAsDon: 0,
        winsAsCommissar: 0, winsAsDoctor: 0, winsAsManiac: 0,
        winsAsSheriff: 0, winsAsBodyguard: 0, winsAsMistress: 0,
        kills: 0, deaths: 0, saves: 0, checks: 0, votesCast: 0, survived: 0,
      },
      rating: 1000,
      rating_history: [],
      last_active_at: now,
      current_room_id: null,
      language: userData.language || 'ru',
      warnings: 0,
      created_at: now,
      updated_at: now,
    };
    stores.users.set(Number(userData.telegramId), user);
    logger.debug(`[Memory] User created: ${userData.telegramId}`);
    return transformUserFromDB(user);
  },

  async update(telegramId, updates) {
    const existing = stores.users.get(Number(telegramId));
    if (!existing) {
      throw new Error(`User ${telegramId} not found`);
    }
    if (updates.telegramId !== undefined) existing.telegram_id = updates.telegramId;
    if (updates.username !== undefined) existing.username = updates.username;
    if (updates.firstName !== undefined) existing.first_name = updates.firstName;
    if (updates.lastName !== undefined) existing.last_name = updates.lastName;
    if (updates.isAdmin !== undefined) existing.is_admin = updates.isAdmin;
    if (updates.isBanned !== undefined) existing.is_banned = updates.isBanned;
    if (updates.banReason !== undefined) existing.ban_reason = updates.banReason;
    if (updates.stats !== undefined) existing.stats = updates.stats;
    if (updates.rating !== undefined) existing.rating = updates.rating;
    if (updates.ratingHistory !== undefined) existing.rating_history = updates.ratingHistory;
    if (updates.lastActiveAt !== undefined) existing.last_active_at = updates.lastActiveAt;
    if (updates.currentRoomId !== undefined) existing.current_room_id = updates.currentRoomId;
    if (updates.language !== undefined) existing.language = updates.language;
    if (updates.warnings !== undefined) existing.warnings = updates.warnings;
    existing.updated_at = new Date().toISOString();
    stores.users.set(Number(telegramId), existing);
    return transformUserFromDB(existing);
  },

  async findAll(options = {}) {
    let usersList = Array.from(stores.users.values());
    if (options.isAdmin !== undefined) {
      usersList = usersList.filter(u => u.is_admin === options.isAdmin);
    }
    if (options.isBanned !== undefined) {
      usersList = usersList.filter(u => u.is_banned === options.isBanned);
    }
    // Сортировка по рейтингу по умолчанию
    usersList.sort((a, b) => (b.rating || 1000) - (a.rating || 1000));
    if (options.limit) {
      usersList = usersList.slice(0, options.limit);
    }
    return usersList.map(transformUserFromDB);
  },

  async count(filters = {}) {
    let usersList = Array.from(stores.users.values());
    if (filters.isBanned !== undefined) {
      usersList = usersList.filter(u => u.is_banned === filters.isBanned);
    }
    if (filters.lastActiveAfter) {
      const cutoff = filters.lastActiveAfter.toISOString();
      usersList = usersList.filter(u => u.last_active_at > cutoff);
    }
    return usersList.length;
  },

  async getTopByRating(limit = 20) {
    const usersList = Array.from(stores.users.values())
      .sort((a, b) => (b.rating || 1000) - (a.rating || 1000))
      .slice(0, limit);
    return usersList.map(transformUserFromDB);
  },

  async getTopByWins(limit = 10) {
    const usersList = Array.from(stores.users.values())
      .sort((a, b) => (b.stats?.wins || 0) - (a.stats?.wins || 0))
      .slice(0, limit);
    return usersList.map(transformUserFromDB);
  },

  async getTopByGames(limit = 10) {
    const usersList = Array.from(stores.users.values())
      .sort((a, b) => (b.stats?.totalGames || 0) - (a.stats?.totalGames || 0))
      .slice(0, limit);
    return usersList.map(transformUserFromDB);
  },
};

// =============================================
// ROOMS
// =============================================

const rooms = {
  async findByCode(code) {
    const room = stores.rooms.get(code);
    return room ? { ...room } : null;
  },

  async create(roomData) {
    stores.counters.rooms++;
    const now = new Date().toISOString();
    const room = {
      id: stores.counters.rooms,
      code: roomData.code,
      name: roomData.name || 'Комната Мафии',
      type: roomData.type || 'public',
      status: roomData.status || 'waiting',
      creator_id: roomData.creatorId,
      max_players: roomData.maxPlayers || 10,
      players: roomData.players || [],
      settings: roomData.settings || { dayDuration: 60, nightDuration: 45, voteDuration: 40, roles: [], autoStart: true, isRanked: true },
      current_game_id: roomData.currentGameId || null,
      created_at: now,
      last_activity: now,
    };
    stores.rooms.set(roomData.code, room);
    return transformRoomFromDB(room);
  },

  async update(code, updates) {
    const existing = stores.rooms.get(code);
    if (!existing) {
      throw new Error(`Room ${code} not found`);
    }
    if (updates.code !== undefined) existing.code = updates.code;
    if (updates.name !== undefined) existing.name = updates.name;
    if (updates.type !== undefined) existing.type = updates.type;
    if (updates.status !== undefined) existing.status = updates.status;
    if (updates.creatorId !== undefined) existing.creator_id = updates.creatorId;
    if (updates.maxPlayers !== undefined) existing.max_players = updates.maxPlayers;
    if (updates.players !== undefined) existing.players = updates.players;
    if (updates.settings !== undefined) existing.settings = updates.settings;
    if (updates.currentGameId !== undefined) existing.current_game_id = updates.currentGameId;
    existing.last_activity = new Date().toISOString();
    stores.rooms.set(code, existing);
    return transformRoomFromDB(existing);
  },

  async delete(code) {
    stores.rooms.delete(code);
  },

  async findPublicWaiting(limit = 20) {
    const roomsList = Array.from(stores.rooms.values())
      .filter(r => r.type === 'public' && r.status === 'waiting')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
    return roomsList.map(transformRoomFromDB);
  },

  async findInactive(olderThanMinutes = 60) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
    const roomsList = Array.from(stores.rooms.values())
      .filter(r => r.status === 'waiting' && r.last_activity < cutoff);
    return roomsList.map(transformRoomFromDB);
  },

  async findAllWaiting() {
    const roomsList = Array.from(stores.rooms.values())
      .filter(r => r.status === 'waiting');
    return roomsList.map(transformRoomFromDB);
  },

  async isCodeUnique(code) {
    return !stores.rooms.has(code);
  },
};

// =============================================
// GAMES
// =============================================

const games = {
  async findByGameId(gameId) {
    const game = stores.games.get(gameId);
    return game ? { ...game } : null;
  },

  async create(gameData) {
    stores.counters.games++;
    const now = new Date().toISOString();
    const game = {
      id: stores.counters.games,
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
      created_at: now,
      updated_at: now,
    };
    stores.games.set(gameData.gameId, game);
    return transformGameFromDB(game);
  },

  async update(gameId, updates) {
    const existing = stores.games.get(gameId);
    if (!existing) {
      throw new Error(`Game ${gameId} not found`);
    }
    if (updates.gameId !== undefined) existing.game_id = updates.gameId;
    if (updates.roomCode !== undefined) existing.room_code = updates.roomCode;
    if (updates.status !== undefined) existing.status = updates.status;
    if (updates.phase !== undefined) existing.phase = updates.phase;
    if (updates.round !== undefined) existing.round = updates.round;
    if (updates.players !== undefined) existing.players = updates.players;
    if (updates.nightActionQueue !== undefined) existing.night_action_queue = updates.nightActionQueue;
    if (updates.currentNightActor !== undefined) existing.current_night_actor = updates.currentNightActor;
    if (updates.lastVoteResult !== undefined) existing.last_vote_result = updates.lastVoteResult;
    if (updates.nightResults !== undefined) existing.night_results = updates.nightResults;
    if (updates.actions !== undefined) existing.actions = updates.actions;
    if (updates.winner !== undefined) existing.winner = updates.winner;
    if (updates.maxPlayers !== undefined) existing.max_players = updates.maxPlayers;
    if (updates.phaseTimestamps !== undefined) existing.phase_timestamps = updates.phaseTimestamps;
    if (updates.phaseDurations !== undefined) existing.phase_durations = updates.phaseDurations;
    if (updates.isRanked !== undefined) existing.is_ranked = updates.isRanked;
    if (updates.gameLog !== undefined) existing.game_log = updates.gameLog;
    existing.updated_at = new Date().toISOString();
    stores.games.set(gameId, existing);
    return transformGameFromDB(existing);
  },

  async find(filters = {}, options = {}) {
    let gamesList = Array.from(stores.games.values());
    if (filters.status) {
      gamesList = gamesList.filter(g => g.status === filters.status);
    }
    if (filters.roomCode) {
      gamesList = gamesList.filter(g => g.room_code === filters.roomCode);
    }
    if (filters.playerTelegramId) {
      gamesList = gamesList.filter(g =>
        g.players.some(p => p.telegramId === filters.playerTelegramId)
      );
    }
    if (filters.createdAfter) {
      const cutoff = filters.createdAfter.toISOString();
      gamesList = gamesList.filter(g => g.created_at >= cutoff);
    }
    gamesList.sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (options.limit) {
      gamesList = gamesList.slice(0, options.limit);
    }
    return gamesList.map(transformGameFromDB);
  },

  async count(filters = {}) {
    let gamesList = Array.from(stores.games.values());
    if (filters.status) gamesList = gamesList.filter(g => g.status === filters.status);
    if (filters.winner) gamesList = gamesList.filter(g => g.winner === filters.winner);
    if (filters.createdAfter) {
      const cutoff = filters.createdAfter.toISOString();
      gamesList = gamesList.filter(g => g.created_at >= cutoff);
    }
    return gamesList.length;
  },
};

// =============================================
// GAME LOGS
// =============================================

const gameLogs = {
  async create(logData) {
    stores.counters.gameLogs++;
    const now = new Date().toISOString();
    const log = {
      id: stores.counters.gameLogs,
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
      created_at: now,
      updated_at: now,
    };
    stores.gameLogs.push(log);
    return log;
  },

  async find(filters = {}, limit = 50) {
    let logs = [...stores.gameLogs];
    if (filters.gameId) logs = logs.filter(l => l.game_id === filters.gameId);
    if (filters.eventType) logs = logs.filter(l => l.event_type === filters.eventType);
    logs.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return logs.slice(0, limit);
  },

  async count() {
    return stores.gameLogs.length;
  },
};

// =============================================
// PLAYER STATS
// =============================================

const playerStatsCollection = {
  async findByTelegramId(telegramId) {
    const stats = stores.playerStats.get(Number(telegramId));
    return stats ? transformPlayerStatsFromDB(stats) : null;
  },

  async create(telegramId) {
    stores.counters.playerStats++;
    const now = new Date().toISOString();
    const stats = {
      id: stores.counters.playerStats,
      telegram_id: Number(telegramId),
      total: { games: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, saves: 0, survived: 0 },
      by_role: {
        peaceful: { games: 0, wins: 0, survived: 0 },
        mafia: { games: 0, wins: 0, kills: 0, survived: 0 },
        don: { games: 0, wins: 0, kills: 0, survived: 0 },
        commissar: { games: 0, wins: 0, checks: 0, correctChecks: 0, survived: 0 },
        doctor: { games: 0, wins: 0, saves: 0, survived: 0 },
        maniac: { games: 0, wins: 0, kills: 0, survived: 0 },
        sheriff: { games: 0, wins: 0, checks: 0, correctChecks: 0, survived: 0 },
        bodyguard: { games: 0, wins: 0, protects: 0, survived: 0 },
        mistress: { games: 0, wins: 0, blocks: 0, survived: 0 },
      },
      daily_stats: [],
      achievements: [],
      streaks: { currentWinStreak: 0, maxWinStreak: 0, currentLoseStreak: 0, maxLoseStreak: 0 },
      last_updated: now,
      created_at: now,
      updated_at: now,
    };
    stores.playerStats.set(Number(telegramId), stats);
    return transformPlayerStatsFromDB(stats);
  },

  async update(telegramId, updates) {
    const existing = stores.playerStats.get(Number(telegramId));
    if (!existing) {
      return playerStatsCollection.create(telegramId);
    }
    if (updates.telegramId !== undefined) existing.telegram_id = updates.telegramId;
    if (updates.total !== undefined) existing.total = updates.total;
    if (updates.byRole !== undefined) existing.by_role = updates.byRole;
    if (updates.dailyStats !== undefined) existing.daily_stats = updates.dailyStats;
    if (updates.achievements !== undefined) existing.achievements = updates.achievements;
    if (updates.streaks !== undefined) existing.streaks = updates.streaks;
    existing.last_updated = new Date().toISOString();
    existing.updated_at = new Date().toISOString();
    stores.playerStats.set(Number(telegramId), existing);
    return transformPlayerStatsFromDB(existing);
  },
};

// =============================================
// Transform helpers (snake_case <-> camelCase)
// =============================================

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

module.exports = {
  users,
  rooms: {
    ...rooms,
    findOne: async (filter) => {
      if (filter.code) return rooms.findByCode(filter.code);
      return null;
    },
    deleteOne: async (filter) => {
      if (filter.code) await rooms.delete(filter.code);
    },
    find: async (filter = {}) => {
      if (filter.type === 'public' && filter.status === 'waiting') {
        return rooms.findPublicWaiting();
      }
      if (filter.status && filter.status.$ne === 'finished') {
        return rooms.findInactive(60);
      }
      return [];
    },
  },
  games: {
    ...games,
    findOne: async (filter) => {
      if (filter.gameId) return games.findByGameId(filter.gameId);
      if (filter.roomCode) {
        const results = await games.find({ roomCode: filter.roomCode, status: filter.status }, { limit: 1 });
        return results[0] || null;
      }
      return null;
    },
    find: async (filter = {}, options = { sort: { createdAt: -1 }, limit: 20 }) => {
      return games.find(filter, { limit: options.limit || 20 });
    },
  },
  gameLogs,
  playerStatsCollection,
  /** Сбросить все хранилища (для тестов) */
  _reset() {
    stores.users.clear();
    stores.rooms.clear();
    stores.games.clear();
    stores.gameLogs = [];
    stores.playerStats.clear();
    stores.counters = { users: 0, rooms: 0, games: 0, gameLogs: 0, playerStats: 0 };
  },
};
