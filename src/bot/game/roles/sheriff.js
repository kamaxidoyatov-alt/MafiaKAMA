/**
 * Роль: Шериф
 * Шериф ночью проверяет одного игрока и узнаёт, является ли он мафией.
 * В отличие от комиссара, шериф видит только факт: мафия/не мафия.
 */

const BaseRole = require('./baseRole');

class Sheriff extends BaseRole {
  constructor() {
    super();
    this.id = 'sheriff';
    this.name = 'Sheriff';
    this.nameRu = 'Шериф';
    this.team = 'peaceful';
    this.description = 'Ночью вы можете проверить одного игрока. Вам будет известно, является ли он мафией (включая Дона) или нет. В отличие от комиссара, вы можете раскрыть Дона.';
    this.canActAtNight = true;
    this.canActAtDay = true;
    this.priority = 5;
    this.icon = '⭐';
  }

  async performNightAction(game, actorId, targetId, nightState) {
    const target = game.players.find(p => p.telegramId === targetId);
    if (!target) {
      return { success: false, message: 'Игрок не найден', targetId: null };
    }

    const isMafia = ['mafia', 'don'].includes(target.role);

    nightState.sheriffCheck = {
      targetId,
      isMafia,
    };

    return {
      success: true,
      message: isMafia
        ? `🚨 Игрок ${target.firstName} — МАФИЯ!`
        : `✅ Игрок ${target.firstName} — не мафия`,
      targetId,
      result: { isMafia },
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
    return `${this.icon} ${this.nameRu}\n${this.description}\n\nСовет: вы можете найти Дона там, где комиссар бессилен!`;
  }

  getNightActionDescription(game, actorId) {
    const alivePlayers = game.players.filter(p => p.isAlive && p.telegramId !== actorId);
    return {
      type: 'select_target',
      message: `🌙 Ночь. Кого проверить на причастность к мафии?`,
      targets: alivePlayers,
    };
  }
}

module.exports = Sheriff;
