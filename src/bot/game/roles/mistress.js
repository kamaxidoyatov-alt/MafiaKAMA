/**
 * Роль: Любовница
 * Любовница ночью посещает одного игрока.
 * Если на посещённого игрока нападает мафия — ничего не происходит
 * (посещённый просыпается, и мафия не может его убить).
 * Любовница не может посещать одного игрока два раунда подряд.
 */

const BaseRole = require('./baseRole');

class Mistress extends BaseRole {
  constructor() {
    super();
    this.id = 'mistress';
    this.name = 'Mistress';
    this.nameRu = 'Любовница';
    this.team = 'peaceful';
    this.description = 'Ночью вы можете посетить одного игрока. Если мафия попытается убить вашу цель — ничего не выйдет. Вы не можете посещать одного игрока два раунда подряд.';
    this.canActAtNight = true;
    this.canActAtDay = true;
    this.priority = 1;
    this.icon = '💋';
  }

  async performNightAction(game, actorId, targetId, nightState) {
    const target = game.players.find(p => p.telegramId === targetId);
    if (!target) {
      return { success: false, message: 'Игрок не найден', targetId: null };
    }

    // Любовница "блокирует" цель — мафия не может её убить
    nightState.mistressVisit = targetId;

    return {
      success: true,
      message: `💋 Вы навестили игрока ${target.firstName}`,
      targetId,
    };
  }

  checkWinCondition(game, playerId) {
    const alivePlayers = game.players.filter(p => p.isAlive);
    const mafiaAlive = alivePlayers.filter(p => 
      ['mafia', 'don'].includes(p.role)
    ).length;
    const maniacAlive = alivePlayers.filter(p => p.role === 'maniac').length;
    
    return mafiaAlive === 0 && maniacAlive === 0;
  }

  getHint() {
    return `${this.icon} ${this.nameRu}\n${this.description}\n\nСовет: защищайте ключевых игроков, блокируя их визитом. Мафия не сможет их убить!`;
  }

  getNightActionDescription(game, actorId) {
    const alivePlayers = game.players.filter(p => p.isAlive && p.telegramId !== actorId);
    return {
      type: 'select_target',
      message: `🌙 Ночь. Кого вы хотите посетить?`,
      targets: alivePlayers,
    };
  }
}

module.exports = Mistress;
