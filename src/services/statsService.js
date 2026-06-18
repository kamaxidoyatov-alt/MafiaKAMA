/**
 * Сервис статистики и аналитики
 * Агрегирует данные для админ-панели и API — через Supabase
 */

const db = require('../database/supabase-queries');
const cache = require('../database/cache');
const logger = require('../utils/logger').withContext('StatsService');

/**
 * Получает общую статистику системы
 * @returns {Promise<object>} Статистика
 */
const getSystemStats = async () => {
  const cacheKey = 'stats:system';
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  try {
    const [usersCount, totalGamesCount, activeGamesCount, finishedGamesCount,
      bannedCount, logCount] = await Promise.all([
      db.users.count(),
      db.games.count(),
      db.games.count({ status: 'in_progress' }),
      db.games.count({ status: 'finished' }),
      db.users.count({ isBanned: true }),
      db.gameLogs.count(),
    ]);

    const stats = {
      users: usersCount,
      totalGames: totalGamesCount,
      activeGames: activeGamesCount,
      finishedGames: finishedGamesCount,
      bannedPlayers: bannedCount,
      totalLogs: logCount,
    };

    // Статистика побед — через count
    const [mafiaWins, peacefulWins, maniacWins] = await Promise.all([
      db.games.count({ status: 'finished', winner: 'mafia' }),
      db.games.count({ status: 'finished', winner: 'peaceful' }),
      db.games.count({ status: 'finished', winner: 'maniac' }),
    ]);

    stats.mafiaWins = mafiaWins;
    stats.peacefulWins = peacefulWins;
    stats.maniacWins = maniacWins;
    stats.draws = finishedGamesCount - mafiaWins - peacefulWins - maniacWins;

    // Активные пользователи — через count
    const lastHour = new Date(Date.now() - 3600000);
    const lastDay = new Date(Date.now() - 86400000);
    const [activeUsersLastHour, activeUsersLastDay] = await Promise.all([
      db.users.count({ lastActiveAfter: lastHour }),
      db.users.count({ lastActiveAfter: lastDay }),
    ]);
    stats.activeUsersLastHour = activeUsersLastHour;
    stats.activeUsersLastDay = activeUsersLastDay;

    await cache.set(cacheKey, stats, 60);
    return stats;
  } catch (error) {
    logger.error(`Ошибка получения системной статистики: ${error.message}`);
    return null;
  }
};

/**
 * Получает топ игроков по различным категориям
 * @returns {Promise<object>} Топы
 */
const getLeaderboards = async () => {
  try {
    const byRating = await db.users.getTopByRating(10);
    const byWins = await db.users.getTopByWins(10);
    const byGames = await db.users.getTopByGames(10);

    return {
      byRating: byRating.map((u, i) => ({
        rank: i + 1,
        telegramId: u.telegramId,
        name: u.displayName,
        rating: u.rating,
        winRate: u.winRate,
      })),
      byWins: byWins.map((u, i) => ({
        rank: i + 1,
        telegramId: u.telegramId,
        name: u.displayName,
        wins: u.stats.wins,
        rating: u.rating,
      })),
      byGames: byGames.map((u, i) => ({
        rank: i + 1,
        telegramId: u.telegramId,
        name: u.displayName,
        games: u.stats.totalGames,
        wins: u.stats.wins,
      })),
    };
  } catch (error) {
    logger.error(`Ошибка получения топов: ${error.message}`);
    return null;
  }
};

/**
 * Получает статистику игр по дням
 * @param {number} days - Количество дней
 * @returns {Promise<Array>} Статистика по дням
 */
const getDailyStats = async (days = 30) => {
  try {
    const startDate = new Date(Date.now() - days * 86400000);
    const games = await db.games.find(
      { createdAfter: startDate, status: 'finished' },
      { sortBy: 'created_at', sortDir: 'asc', limit: 10000 }
    );

    // Группируем по дням
    const dailyMap = {};
    for (const game of games) {
      const dateStr = new Date(game.createdAt).toISOString().split('T')[0];
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { date: dateStr, total: 0, mafiaWins: 0, peacefulWins: 0, maniacWins: 0 };
      }
      dailyMap[dateStr].total++;
      if (game.winner === 'mafia') dailyMap[dateStr].mafiaWins++;
      else if (game.winner === 'peaceful') dailyMap[dateStr].peacefulWins++;
      else if (game.winner === 'maniac') dailyMap[dateStr].maniacWins++;
    }

    // Заполняем все дни
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000);
      const dateStr = date.toISOString().split('T')[0];
      result.push(dailyMap[dateStr] || { date: dateStr, total: 0, mafiaWins: 0, peacefulWins: 0, maniacWins: 0 });
    }

    return result;
  } catch (error) {
    logger.error(`Ошибка дневной статистики: ${error.message}`);
    return [];
  }
};

/**
 * Получает статистику ролей (какая роль сколько раз выиграла)
 * @returns {Promise<object>} Статистика по ролям
 */
const getRoleStats = async () => {
  try {
    const games = await db.games.find({ status: 'finished' }, { limit: 500 });

    const roleStats = {};

    for (const game of games) {
      for (const player of game.players) {
        if (!player.role) continue;
        if (!roleStats[player.role]) {
          roleStats[player.role] = { games: 0, wins: 0, deaths: 0, survived: 0 };
        }
        roleStats[player.role].games++;

        const isMafiaWin = game.winner === 'mafia' && ['mafia', 'don'].includes(player.role);
        const isPeacefulWin = game.winner === 'peaceful' && !['mafia', 'don', 'maniac'].includes(player.role);
        const isManiacWin = game.winner === 'maniac' && player.role === 'maniac';

        if (isMafiaWin || isPeacefulWin || isManiacWin) {
          roleStats[player.role].wins++;
        }

        if (!player.isAlive) {
          roleStats[player.role].deaths++;
        } else {
          roleStats[player.role].survived++;
        }
      }
    }

    return roleStats;
  } catch (error) {
    logger.error(`Ошибка статистики ролей: ${error.message}`);
    return {};
  }
};

/**
 * Получает последние логи событий
 * @param {number} limit - Лимит
 * @returns {Promise<Array>} Логи
 */
const getRecentLogs = async (limit = 50) => {
  try {
    return await db.gameLogs.find({}, limit);
  } catch (error) {
    logger.error(`Ошибка получения логов: ${error.message}`);
    return [];
  }
};

module.exports = {
  getSystemStats,
  getLeaderboards,
  getDailyStats,
  getRoleStats,
  getRecentLogs,
};
