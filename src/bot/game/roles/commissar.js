/**
 * Роль: Комиссар
 * Комиссар ночью проверяет одного игрока и узнаёт его истинную роль.
 * Не может проверить Дона (получает результат «мирный»).
 */

const BaseRole = require('./baseRole');

class Commissar extends BaseRole {
  constructor() {
    super();
    this.id = 'commissar';
    this.name = 'Commissar';
    this.nameRu = 'Комиссар';
    this.team = 'peaceful';
    this.description = 'Ночью вы можете проверить одного игрока и узнать его истинную роль. Будьте осторожны: Дон покажется вам мирным жителем. Используйте информацию, чтобы помочь городу.';
    this.canActAtNight = true;
    this.canActAtDay = true;
    this.priority = 4;
    this.icon = '🔍';
  }

  async performNightAction(game, actorId, targetId, nightState) {
    const target = game.players.find(p => p.telegramId === targetId);
    if (!target) {
      return { success: false, message: 'Игрок не найден', targetId: null };
    }

    let revealedRole = target.role;

    // Дон показывается как мирный
    if (revealedRole === 'don') {
      revealedRole = 'peaceful';
    }

    // Определяем команду
    let team = 'мирные';
    if (['mafia', 'don'].includes(revealedRole)) team = 'мафия';
    if (revealedRole === 'maniac') team = 'одиночка';

    nightState.commissarCheck = {
      targetId,
      revealedRole,
      team,
    };

    return {
      success: true,
      message: `✅ Результат проверки: игрок ${target.firstName} — ${team}`,
      targetId,
      result: { role: revealedRole, team },
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
    return `${this.icon} ${this.nameRu}\n${this.description}\n\nСовет: проверяйте подозрительных игроков. Помните: Дон маскируется под мирного!`;
  }

  getNightActionDescription(game, actorId) {
    const alivePlayers = game.players.filter(p => p.isAlive && p.telegramId !== actorId);
    return {
      type: 'select_target',
      message: `🌙 Ночь. Кого вы хотите проверить?`,
      targets: alivePlayers,
    };
  }
}

module.exports = Commissar;
