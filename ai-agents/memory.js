/**
 * Система памяти AI-агентов
 * Каждый агент имеет собственную память о ходе игры
 */

const logger = require('../src/utils/logger').withContext('AgentMemory');

/**
 * Класс памяти AI-агента
 */
class AgentMemory {
  constructor(agentId) {
    this.agentId = agentId;
    this.events = [];
    this.suspicions = {}; // { playerId: suspicionLevel (0-10) }
    this.alliances = {}; // { playerId: trustLevel (-5 to 5) }
    this.observations = [];
    this.roundHistory = {};
    this.maxEvents = 100;
    this.role = null;
    this.myRole = null;
    this.roleHint = '';
  }

  /**
   * Добавляет событие в память
   * @param {object} event - Событие
   */
  addEvent(event) {
    this.events.push({
      ...event,
      timestamp: Date.now(),
    });

    // Ограничиваем размер памяти
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  /**
   * Запоминает ночное действие
   * @param {string} phase - Фаза
   * @param {number} round - Раунд
   * @param {string} action - Действие
   * @param {number|null} targetId - ID цели
   */
  recordNightAction(phase, round, action, targetId) {
    this.addEvent({
      phase,
      round,
      action,
      targetId,
      type: 'night_action',
    });
  }

  /**
   * Запоминает голос
   * @param {number} round - Раунд
   * @param {number} targetId - ID целевого игрока
   */
  recordVote(round, targetId) {
    this.addEvent({
      round,
      vote: targetId,
      type: 'vote',
    });
  }

  /**
   * Запоминает, как голосовали другие
   * @param {number} round - Раунд
   * @param {number} voterId - ID голосующего
   * @param {number} targetId - ID цели
   */
  recordOthersVote(round, voterId, targetId) {
    this.addEvent({
      round,
      voterId,
      targetId,
      type: 'others_vote',
    });

    // Обновляем подозрения на основе голосов
    this.updateSuspicionsFromVote(round, voterId, targetId);
  }

  /**
   * Обновляет подозрения на основе голосов других игроков
   * @param {number} round - Раунд
   * @param {number} voterId - ID голосующего
   * @param {number} targetId - ID цели
   */
  updateSuspicionsFromVote(round, voterId, targetId) {
    // Если кто-то голосует против того, кто оказался мирным — это подозрительно
    const target = this.roundHistory[round]?.players?.find(p => p.telegramId === targetId);
    const voter = this.roundHistory[round]?.players?.find(p => p.telegramId === voterId);

    if (target && target.role === 'peaceful') {
      this.increaseSuspicion(voterId, 2);
    }

    // Если кто-то голосует против мафии — снижаем подозрения
    if (target && ['mafia', 'don'].includes(target.role)) {
      this.decreaseSuspicion(voterId, 1);
    }

    // Если кто-то не голосовал — подозрительно
    const alivePlayers = Object.values(this.roundHistory[round]?.players || {});
    const nonVoters = alivePlayers.filter(p => p.isAlive && !p.hasVoted && p.telegramId !== this.agentId);
    for (const nonVoter of nonVoters) {
      this.increaseSuspicion(nonVoter.telegramId, 1);
    }
  }

  /**
   * Запоминает смерть игрока
   * @param {number} playerId - ID игрока
   * @param {string} cause - Причина смерти
   * @param {number} round - Раунд
   */
  recordDeath(playerId, cause, round) {
    this.addEvent({
      playerId,
      cause,
      round,
      type: 'death',
    });

    // Если кого-то убили — это снижает наши подозрения к нему
    if (this.suspicions[playerId]) {
      delete this.suspicions[playerId];
    }
  }

  /**
   * Повышает уровень подозрения к игроку
   * @param {number} playerId - ID игрока
   * @param {number} amount - На сколько повысить
   */
  increaseSuspicion(playerId, amount = 1) {
    if (!this.suspicions[playerId]) {
      this.suspicions[playerId] = 0;
    }
    this.suspicions[playerId] = Math.min(10, this.suspicions[playerId] + amount);
  }

  /**
   * Понижает уровень подозрения к игроку
   * @param {number} playerId - ID игрока
   * @param {number} amount - На сколько понизить
   */
  decreaseSuspicion(playerId, amount = 1) {
    if (!this.suspicions[playerId]) {
      this.suspicions[playerId] = 0;
    }
    this.suspicions[playerId] = Math.max(0, this.suspicions[playerId] - amount);
  }

  /**
   * Получает самого подозрительного игрока
   * @returns {object|null} { playerId, suspicionLevel }
   */
  getMostSuspicious() {
    let maxSuspicion = 0;
    let mostSuspicious = null;

    for (const [playerId, level] of Object.entries(this.suspicions)) {
      if (level > maxSuspicion) {
        maxSuspicion = level;
        mostSuspicious = { playerId: parseInt(playerId), suspicionLevel: level };
      }
    }

    return mostSuspicious;
  }

  /**
   * Получает топ-N подозрительных игроков
   * @param {number} n - Количество
   * @returns {Array} Массив { playerId, suspicionLevel }
   */
  getTopSuspicious(n = 3) {
    return Object.entries(this.suspicions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([playerId, level]) => ({
        playerId: parseInt(playerId),
        suspicionLevel: level,
      }));
  }

  /**
   * Сохраняет информацию о раунде
   * @param {number} round - Номер раунда
   * @param {object} gameState - Состояние игры
   */
  saveRoundState(round, gameState) {
    this.roundHistory[round] = {
      players: gameState.players?.filter(p => p.isAlive).map(p => ({
        telegramId: p.telegramId,
        firstName: p.firstName,
        isAlive: p.isAlive,
        hasVoted: p.hasVoted || false,
        role: p.role,
      })) || [],
      phase: gameState.phase,
      suspects: { ...this.suspicions },
    };
  }

  /**
   * Создаёт текстовый отчёт о памяти для LLM
   * @returns {string} Отформатированная память
   */
  getMemoryReport() {
    let report = '';

    if (Object.keys(this.suspicions).length > 0) {
      report += '**Текущие подозрения:**\n';
      for (const [id, level] of Object.entries(this.suspicions)) {
        if (level > 0) {
          report += `- Игрок #${id}: уровень подозрения ${level}/10\n`;
        }
      }
    }

    if (this.events.length > 0) {
      const recentEvents = this.events.slice(-10);
      report += '\n**Последние события:**\n';
      for (const event of recentEvents) {
        report += `- Раунд ${event.round}: ${event.type} - ${event.action || event.cause || 'голос'}\n`;
      }
    }

    return report;
  }

  /**
   * Очищает память (для новой игры)
   */
  clear() {
    this.events = [];
    this.suspicions = {};
    this.alliances = {};
    this.observations = [];
    this.roundHistory = {};
  }

  /**
   * Сериализует память в JSON
   * @returns {object} JSON
   */
  toJSON() {
    return {
      agentId: this.agentId,
      suspicions: this.suspicions,
      alliances: this.alliances,
      events: this.events.slice(-20),
      roundHistory: this.roundHistory,
      role: this.role,
    };
  }
}

module.exports = AgentMemory;
