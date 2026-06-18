/**
 * Роль: Маньяк
 * Маньяк — одиночка, который убивает каждую ночь.
 * Цель маньяка — остаться последним выжившим.
 * Маньяк не знает мафию, мафия не знает маньяка.
 */

const BaseRole = require('./baseRole');

class Maniac extends BaseRole {
  constructor() {
    super();
    this.id = 'maniac';
    this.name = 'Maniac';
    this.nameRu = 'Маньяк';
    this.team = 'solo';
    this.description = 'Вы — маньяк-одиночка. Каждую ночь вы убиваете одного игрока. Ваша цель — остаться последним выжившим. Вы ни с кем не связаны: мафия не знает вас, вы не знаете мафию.';
    this.canActAtNight = true;
    this.canActAtDay = true;
    this.priority = 8;
    this.icon = '🪓';
  }

  async performNightAction(game, actorId, targetId, nightState) {
    const target = game.players.find(p => p.telegramId === targetId);
    if (!target) {
      return { success: false, message: 'Игрок не найден', targetId: null };
    }

    // Маньяк выбирает жертву
    nightState.maniacTarget = targetId;

    return {
      success: true,
      message: `🩸 Вы выбрали жертву: ${target.firstName}`,
      targetId,
    };
  }

  checkWinCondition(game, playerId) {
    // Маньяк побеждает, если остался один в живых
    const alivePlayers = game.players.filter(p => p.isAlive);
    return alivePlayers.length === 1 && alivePlayers[0].telegramId === playerId;
  }

  getHint() {
    return `${this.icon} ${this.nameRu}\n${this.description}\n\nСтратегия: убивайте и мафию, и мирных. Ваша цель — остаться одному.`;
  }

  getNightActionDescription(game, actorId) {
    const alivePlayers = game.players.filter(p => p.isAlive && p.telegramId !== actorId);
    return {
      type: 'select_target',
      message: `🌙 Ночь. Кого вы хотите убить? (Никто не узнает...)`,
      targets: alivePlayers,
    };
  }
}

module.exports = Maniac;
