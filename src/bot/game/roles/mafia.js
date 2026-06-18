/**
 * Роль: Мафия
 * Мафия просыпается ночью и выбирает жертву для убийства.
 * Цель мафии — убить всех мирных жителей.
 */

const BaseRole = require('./baseRole');

class Mafia extends BaseRole {
  constructor() {
    super();
    this.id = 'mafia';
    this.name = 'Mafia';
    this.nameRu = 'Мафия';
    this.team = 'mafia';
    this.description = 'Ночью вы просыпаетесь и вместе с другими членами мафии выбираете жертву. Днём вы должны притворяться мирным жителем и отводить от себя подозрения.';
    this.canActAtNight = true;
    this.canActAtDay = true;
    this.priority = 6;
    this.icon = '🔪';
  }

  /**
   * Ночное действие мафии — убийство
   */
  async performNightAction(game, actorId, targetId, nightState) {
    // Мафия голосует за цель: если цель уже выбрана, считаем голоса
    if (!nightState.mafiaVotes) {
      nightState.mafiaVotes = {};
    }

    // Записываем голос мафиози
    nightState.mafiaVotes[actorId] = targetId;

    // Если все мафиози проголосовали или прошёл таймаут — выбираем цель
    const mafiaPlayers = game.players.filter(
      p => ['mafia', 'don'].includes(p.role) && p.isAlive
    );

    const votes = nightState.mafiaVotes;
    const voters = Object.keys(votes).length;
    const allVoted = voters >= mafiaPlayers.length;

    if (allVoted) {
      // Подсчитываем голоса
      const voteCount = {};
      for (const tid of Object.values(votes)) {
        voteCount[tid] = (voteCount[tid] || 0) + 1;
      }
      
      let maxVotes = 0;
      let selectedTarget = null;
      for (const [tid, count] of Object.entries(voteCount)) {
        if (count > maxVotes) {
          maxVotes = count;
          selectedTarget = parseInt(tid);
        }
      }

      nightState.mafiaTarget = selectedTarget;
      return {
        success: true,
        message: `Мафия выбрала цель для убийства`,
        targetId: selectedTarget,
      };
    }

    return {
      success: true,
      message: `Голос принят. Проголосовало ${voters}/${mafiaPlayers.length} членов мафии.`,
      targetId: targetId,
      waitingForOthers: true,
    };
  }

  checkWinCondition(game, playerId) {
    // Мафия побеждает, когда количество мафии >= количеству мирных
    const alivePlayers = game.players.filter(p => p.isAlive);
    const mafiaAlive = alivePlayers.filter(p => ['mafia', 'don'].includes(p.role)).length;
    const peacefulAlive = alivePlayers.filter(p => 
      !['mafia', 'don'].includes(p.role)
    ).length;

    return mafiaAlive >= peacefulAlive;
  }

  getHint() {
    return `${this.icon} ${this.nameRu}\n${this.description}\n\nНочью выберите жертву вместе с другими членами мафии. Днём скрывайте свою роль!`;
  }

  getNightActionDescription(game, actorId) {
    const alivePlayers = game.players.filter(p => p.isAlive && p.telegramId !== actorId);
    const mafiaMembers = game.players.filter(
      p => ['mafia', 'don'].includes(p.role) && p.isAlive && p.telegramId !== actorId
    );

    return {
      type: 'select_target',
      message: `🌙 Ночь. Выберите жертву для убийства.\nВаши союзники: ${mafiaMembers.map(m => m.firstName).join(', ')}`,
      targets: alivePlayers,
    };
  }
}

module.exports = Mafia;
