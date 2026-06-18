/**
 * Роль: Доктор
 * Доктор ночью может спасти (вылечить) одного игрока от убийства.
 * Если доктор выбрал того же игрока, кого мафия — игрок выживает.
 * Доктор не может лечить одного игрока два раунда подряд.
 */

const BaseRole = require('./baseRole');

class Doctor extends BaseRole {
  constructor() {
    super();
    this.id = 'doctor';
    this.name = 'Doctor';
    this.nameRu = 'Доктор';
    this.team = 'peaceful';
    this.description = 'Ночью вы можете спасти одного игрока от убийства. Если мафия выбрала вашу цель — игрок выживает. Нельзя лечить одного и того же игрока два раунда подряд.';
    this.canActAtNight = true;
    this.canActAtDay = true;
    this.priority = 3;
    this.icon = '💉';
  }

  async performNightAction(game, actorId, targetId, nightState) {
    const target = game.players.find(p => p.telegramId === targetId);
    if (!target) {
      return { success: false, message: 'Игрок не найден', targetId: null };
    }

    // Запоминаем кого лечим
    nightState.doctorHeal = targetId;

    return {
      success: true,
      message: `💊 Вы будете лечить игрока ${target.firstName}`,
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
    return `${this.icon} ${this.nameRu}\n${this.description}\n\nСовет: спасайте ключевых игроков — комиссара и шерифа.`;
  }

  getNightActionDescription(game, actorId) {
    const alivePlayers = game.players.filter(p => p.isAlive && p.telegramId !== actorId);
    return {
      type: 'select_target',
      message: `🌙 Ночь. Кого вы хотите спасти?`,
      targets: alivePlayers,
    };
  }
}

module.exports = Doctor;
