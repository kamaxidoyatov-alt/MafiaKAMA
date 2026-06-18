/**
 * Роль: Телохранитель
 * Телохранитель ночью выбирает игрока для защиты.
 * Если на защищаемого игрока нападает мафия — мафиози нейтрализуется (погибает).
 * Телохранитель погибает вместе с нападающим мафиози.
 */

const BaseRole = require('./baseRole');

class Bodyguard extends BaseRole {
  constructor() {
    super();
    this.id = 'bodyguard';
    this.name = 'Bodyguard';
    this.nameRu = 'Телохранитель';
    this.team = 'peaceful';
    this.description = 'Ночью вы можете защитить одного игрока. Если мафия попытается убить вашего подопечного — один из мафиози погибнет. Вы также погибаете, выполняя свой долг.';
    this.canActAtNight = true;
    this.canActAtDay = true;
    this.priority = 2;
    this.icon = '🛡️';
  }

  async performNightAction(game, actorId, targetId, nightState) {
    const target = game.players.find(p => p.telegramId === targetId);
    if (!target) {
      return { success: false, message: 'Игрок не найден', targetId: null };
    }

    // Телохранитель защищает цель
    nightState.bodyguardProtect = targetId;
    nightState.bodyguardId = actorId;

    return {
      success: true,
      message: `🛡️ Вы защищаете игрока ${target.firstName}`,
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
    return `${this.icon} ${this.nameRu}\n${this.description}\n\nСовет: защищайте комиссара или шерифа — они ключевые фигуры для победы мирных.`;
  }

  getNightActionDescription(game, actorId) {
    const alivePlayers = game.players.filter(p => p.isAlive && p.telegramId !== actorId);
    return {
      type: 'select_target',
      message: `🌙 Ночь. Кого вы будете защищать?`,
      targets: alivePlayers,
    };
  }
}

module.exports = Bodyguard;
