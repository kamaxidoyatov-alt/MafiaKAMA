/**
 * Роль: Мирный житель
 * Мирный житель не имеет специальных способностей.
 * Его цель — вычислить мафию днём и проголосовать за исключение.
 */

const BaseRole = require('./baseRole');

class Peaceful extends BaseRole {
  constructor() {
    super();
    this.id = 'peaceful';
    this.name = 'Peaceful';
    this.nameRu = 'Мирный житель';
    this.team = 'peaceful';
    this.description = 'У вас нет специальных способностей. Используйте логику и интуицию, чтобы вычислить мафию днём и голосовать за её исключение.';
    this.canActAtNight = false;
    this.canActAtDay = true;
    this.priority = 99;
    this.icon = '👨‍🌾';
  }

  checkWinCondition(game, playerId) {
    // Мирные побеждают, когда вся мафия и маньяк устранены
    const alivePlayers = game.players.filter(p => p.isAlive);
    const mafiaAlive = alivePlayers.filter(p => 
      ['mafia', 'don'].includes(p.role)
    );
    const maniacAlive = alivePlayers.filter(p => p.role === 'maniac');
    
    return mafiaAlive.length === 0 && maniacAlive.length === 0;
  }
}

module.exports = Peaceful;
