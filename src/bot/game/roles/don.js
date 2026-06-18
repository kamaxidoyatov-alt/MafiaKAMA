/**
 * Роль: Дон (крестный отец мафии)
 * Дон — лидер мафии. Ночью просыпается вместе с мафией и выбирает жертву.
 * Если комиссар проверяет Дона — результат будет «мирный».
 */

const BaseRole = require('./baseRole');

class Don extends BaseRole {
  constructor() {
    super();
    this.id = 'don';
    this.name = 'Don';
    this.nameRu = 'Дон';
    this.team = 'mafia';
    this.description = 'Вы — лидер мафии. Ваш голос решающий при выборе жертвы. Комиссар не может вас проверить — вы показываетесь как мирный житель. Руководите своими подчинёнными и ведите мафию к победе.';
    this.canActAtNight = true;
    this.canActAtDay = true;
    this.priority = 7;
    this.icon = '👑';
  }

  async performNightAction(game, actorId, targetId, nightState) {
    if (!nightState.mafiaVotes) {
      nightState.mafiaVotes = {};
    }

    // Голос Дона имеет больший вес
    nightState.mafiaVotes[actorId] = targetId;

    const mafiaPlayers = game.players.filter(
      p => ['mafia', 'don'].includes(p.role) && p.isAlive
    );

    const votes = nightState.mafiaVotes;
    const voters = Object.keys(votes).length;
    
    // Дон может принять решение единолично
    nightState.donDecision = targetId;
    nightState.mafiaTarget = targetId;

    return {
      success: true,
      message: `☝️ Дон принял решение. Цель: игрок ${targetId}.`,
      targetId: targetId,
    };
  }

  checkWinCondition(game, playerId) {
    const alivePlayers = game.players.filter(p => p.isAlive);
    const mafiaAlive = alivePlayers.filter(p => ['mafia', 'don'].includes(p.role)).length;
    const peacefulAlive = alivePlayers.filter(p => 
      !['mafia', 'don'].includes(p.role)
    ).length;

    return mafiaAlive >= peacefulAlive;
  }

  getHint() {
    return `${this.icon} ${this.nameRu} (Лидер мафии)\n${this.description}\n\nПомните: комиссар не может вас проверить! Вы — неуязвимы для расследования.`;
  }

  getNightActionDescription(game, actorId) {
    const alivePlayers = game.players.filter(p => p.isAlive && p.telegramId !== actorId);
    const mafiaMembers = game.players.filter(
      p => ['mafia', 'don'].includes(p.role) && p.isAlive && p.telegramId !== actorId
    );

    return {
      type: 'select_target',
      message: `🌙 Ночь. Вы — Дон. Выберите жертву для мафии.\nВаша мафия: ${mafiaMembers.map(m => m.firstName).join(', ')}`,
      targets: alivePlayers,
    };
  }
}

module.exports = Don;
