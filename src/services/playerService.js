/**
 * Сервис управления игроками
 * Регистрация, бан, профили — через Supabase
 */

const db = require('../database/supabase-queries');
const cache = require('../database/cache');
const logger = require('../utils/logger').withContext('PlayerService');

/**
 * Получает или создаёт пользователя
 * @param {object} telegramUser - Данные из Telegram
 * @returns {Promise<object>} Пользователь
 */
const getOrCreateUser = async (telegramUser) => {
  const cacheKey = `user:${telegramUser.id}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  let user = await db.users.findByTelegramId(telegramUser.id);

  if (!user) {
    user = await db.users.create({
      telegramId: telegramUser.id,
      username: telegramUser.username || '',
      firstName: telegramUser.first_name || '',
      lastName: telegramUser.last_name || '',
      lastActiveAt: new Date(),
    });
    logger.info(`Новый игрок: ${user.displayName}`);
  } else {
    user = await db.users.update(telegramUser.id, {
      username: telegramUser.username || user.username,
      firstName: telegramUser.first_name || user.firstName,
      lastName: telegramUser.last_name || user.lastName,
      lastActiveAt: new Date(),
    });
  }

  await cache.set(cacheKey, user, 60);
  return user;
};

/**
 * Проверяет, забанен ли игрок
 * @param {number} telegramId - ID
 * @returns {Promise<boolean>}
 */
const isPlayerBanned = async (telegramId) => {
  const user = await db.users.findByTelegramId(telegramId);
  return user?.isBanned === true;
};

/**
 * Банит игрока
 * @param {number} telegramId - ID
 * @param {string} reason - Причина
 * @param {number} adminId - ID админа
 * @returns {Promise<object>} Результат
 */
const banPlayer = async (telegramId, reason, adminId) => {
  const user = await db.users.findByTelegramId(telegramId);
  if (!user) return { success: false, message: '❌ Игрок не найден.' };

  await db.users.update(telegramId, {
    isBanned: true,
    banReason: reason,
  });

  await cache.del(`user:${telegramId}`);
  logger.info(`Игрок ${user.displayName} забанен администратором ${adminId}: ${reason}`);

  return { success: true, message: `✅ Игрок ${user.displayName} забанен.` };
};

/**
 * Разбанивает игрока
 * @param {number} telegramId - ID
 * @returns {Promise<object>} Результат
 */
const unbanPlayer = async (telegramId) => {
  const user = await db.users.findByTelegramId(telegramId);
  if (!user) return { success: false, message: '❌ Игрок не найден.' };

  await db.users.update(telegramId, {
    isBanned: false,
    banReason: '',
  });

  await cache.del(`user:${telegramId}`);
  logger.info(`Игрок ${user.displayName} разбанен.`);

  return { success: true, message: `✅ Игрок ${user.displayName} разбанен.` };
};

/**
 * Получает топ игроков по рейтингу
 * @param {number} limit - Лимит
 * @returns {Promise<Array>} Топ игроков
 */
const getTopPlayers = async (limit = 20) => {
  const cacheKey = `top:${limit}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const topPlayers = await db.users.getTopByRating(limit);

  const result = topPlayers.map((p, index) => ({
    rank: index + 1,
    telegramId: p.telegramId,
    displayName: p.displayName,
    rating: p.rating,
    winRate: p.winRate,
    totalGames: p.stats.totalGames,
    wins: p.stats.wins,
  }));

  await cache.set(cacheKey, result, 120);
  return result;
};

/**
 * Получает статистику игрока
 * @param {number} telegramId - ID игрока
 * @returns {Promise<object|null>} Статистика
 */
const getPlayerStats = async (telegramId) => {
  const user = await db.users.findByTelegramId(telegramId);
  if (!user) return null;

  return {
    telegramId: user.telegramId,
    displayName: user.displayName,
    rating: user.rating,
    totalGames: user.stats.totalGames,
    wins: user.stats.wins,
    losses: user.stats.losses,
    winRate: user.winRate,
    kills: user.stats.kills,
    deaths: user.stats.deaths,
    saves: user.stats.saves,
    survived: user.stats.survived,
    roles: {
      mafiaWins: user.stats.winsAsMafia,
      peacefulWins: user.stats.winsAsPeaceful,
      commissarWins: user.stats.winsAsCommissar,
      doctorWins: user.stats.winsAsDoctor,
      donWins: user.stats.winsAsDon,
      maniacWins: user.stats.winsAsManiac,
    },
    ratingHistory: user.ratingHistory?.slice(-20) || [],
    isBanned: user.isBanned,
    isAdmin: user.isAdmin,
  };
};

/**
 * Обновляет рейтинг игрока
 * @param {number} telegramId - ID
 * @param {number} change - Изменение
 */
const updateRating = async (telegramId, change) => {
  const user = await db.users.findByTelegramId(telegramId);
  if (user) {
    const newRating = Math.max(100, user.rating + change);
    const history = user.ratingHistory || [];
    history.push({
      date: new Date().toISOString(),
      rating: newRating,
      change,
    });

    await db.users.update(telegramId, {
      rating: newRating,
      ratingHistory: history,
    });
    await cache.del(`user:${telegramId}`);
  }
};

module.exports = {
  getOrCreateUser,
  isPlayerBanned,
  banPlayer,
  unbanPlayer,
  getTopPlayers,
  getPlayerStats,
  updateRating,
};
