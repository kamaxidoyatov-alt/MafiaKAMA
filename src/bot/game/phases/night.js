/**
 * Менеджер ночной фазы
 * Управляет действиями всех ролей в ночное время
 * Очередность: Любовница -> Телохранитель -> Доктор -> Комиссар -> Шериф -> Мафия/Дон -> Маньяк
 */

const logger = require('../../../utils/logger').withContext('NightPhase');
const { getRole, getNightActionOrder } = require('../roles');

/**
 * Запускает ночную фазу
 * @param {object} game - Состояние игры
 * @returns {Promise<object>} Результаты ночных действий
 */
const runNightPhase = async (game) => {
  const nightState = {
    mafiaVotes: {},
    mafiaTarget: null,
    donDecision: null,
    maniacTarget: null,
    doctorHeal: null,
    commissarCheck: null,
    sheriffCheck: null,
    bodyguardProtect: null,
    bodyguardId: null,
    mistressVisit: null,
  };

  const actionOrder = getNightActionOrder();
  const executedActions = [];

  // Выполняем действия по порядку приоритета
  for (const { role: roleId, action, priority } of actionOrder) {
    const playersWithRole = game.players.filter(
      p => p.role === roleId && p.isAlive
    );

    for (const player of playersWithRole) {
      const Role = getRole(roleId);
      if (!Role) continue;

      const roleInstance = new Role();
      
      // Для мафии — целевой игрок уже выбран голосованием
      if (roleId === 'mafia' || roleId === 'don') {
        if (nightState.mafiaTarget) {
          // Действие уже выполнено через голосование
        }
        continue;
      }

      // Если у игрока есть сохранённое действие (от AI или из очереди)
      const savedAction = player.nightActions && player.nightActions.length > 0
        ? player.nightActions[player.nightActions.length - 1]
        : null;

      if (savedAction && savedAction.round >= game.round) {
        const result = await roleInstance.performNightAction(
          game,
          player.telegramId,
          savedAction.targetId,
          nightState
        );
        executedActions.push(result);
      }
    }
  }

  // Применяем результаты ночи
  const nightResults = applyNightResults(game, nightState);
  
  return {
    nightState,
    nightResults,
    actions: executedActions,
  };
};

/**
 * Применяет результаты ночных действий
 * @param {object} game - Состояние игры
 * @param {object} nightState - Состояние ночи
 * @returns {object} Результаты ночи
 */
const applyNightResults = (game, nightState) => {
  const result = {
    diedDuringNight: [],
    savedByDoctor: false,
    protectedByBodyguard: false,
    bodyguardDied: false,
    visitedByMistress: false,
    mafiaKilled: false,
    messages: [],
  };

  // Кого мафия хочет убить
  let mafiaTarget = nightState.mafiaTarget;
  let maniacTarget = nightState.maniacTarget;

  // Проверяем: посетила ли любовница цель мафии?
  if (nightState.mistressVisit === mafiaTarget && mafiaTarget !== null) {
    result.visitedByMistress = true;
    result.messages.push('💋 Любовница посетила цель мафии — убийство не удалось');
    mafiaTarget = null; // Отменяем убийство
  }

  // Проверяем: защищает ли телохранитель цель?
  let bodyguardDied = false;
  let oneMafiaKilled = false;
  if (nightState.bodyguardProtect === mafiaTarget && mafiaTarget !== null) {
    result.protectedByBodyguard = true;
    result.bodyguardDied = true;
    bodyguardDied = true;
    // Один мафиози погибает (рандомный)
    oneMafiaKilled = true;
    result.messages.push('🛡️ Телохранитель защитил цель и погиб');
    mafiaTarget = null; // Цель выжила
  }

  // Проверяем: лечит ли доктор цель?
  if (nightState.doctorHeal === mafiaTarget && mafiaTarget !== null) {
    result.savedByDoctor = true;
    result.messages.push('💉 Доктор спас пациента');
    mafiaTarget = null; // Отменяем убийство
  }

  // Применяем убийство мафии
  if (mafiaTarget !== null) {
    const mafiaVictim = game.players.find(p => p.telegramId === mafiaTarget);
    if (mafiaVictim) {
      mafiaVictim.isAlive = false;
      mafiaVictim.killedByMafia = true;
      mafiaVictim.roundDied = game.round;
      result.diedDuringNight.push({
        telegramId: mafiaVictim.telegramId,
        firstName: mafiaVictim.firstName,
        killedBy: 'mafia',
      });
      result.messages.push(`🔪 Мафия убила игрока ${mafiaVictim.firstName}`);
    }
  }

  // Применяем убийство маньяка
  if (maniacTarget !== null) {
    const maniacVictim = game.players.find(p => p.telegramId === maniacTarget);
    if (maniacVictim && maniacVictim.isAlive) {
      // Маньяк не может убить, если цель посетила любовница
      if (nightState.mistressVisit === maniacTarget) {
        result.messages.push('💋 Любовница помешала маньяку');
      } else {
        maniacVictim.isAlive = false;
        maniacVictim.killedByManiac = true;
        maniacVictim.roundDied = game.round;
        result.diedDuringNight.push({
          telegramId: maniacVictim.telegramId,
          firstName: maniacVictim.firstName,
          killedBy: 'maniac',
        });
        result.messages.push(`🪓 Маньяк убил игрока ${maniacVictim.firstName}`);
      }
    }
  }

  // Один мафиози погибает от телохранителя
  if (oneMafiaKilled) {
    const aliveMafia = game.players.filter(
      p => ['mafia', 'don'].includes(p.role) && p.isAlive
    );
    if (aliveMafia.length > 0) {
      const randomMafia = aliveMafia[Math.floor(Math.random() * aliveMafia.length)];
      randomMafia.isAlive = false;
      randomMafia.roundDied = game.round;
      result.diedDuringNight.push({
        telegramId: randomMafia.telegramId,
        firstName: randomMafia.firstName,
        killedBy: 'bodyguard',
      });
      result.mafiaKilled = true;
      result.messages.push(`🛡️ Телохранитель убил мафиози ${randomMafia.firstName}`);
    }
  }

  // Телохранитель тоже погибает
  if (bodyguardDied && nightState.bodyguardId) {
    const bodyguard = game.players.find(p => p.telegramId === nightState.bodyguardId);
    if (bodyguard) {
      bodyguard.isAlive = false;
      bodyguard.roundDied = game.round;
      result.diedDuringNight.push({
        telegramId: bodyguard.telegramId,
        firstName: bodyguard.firstName,
        killedBy: 'mafia',
      });
    }
  }

  return result;
};

/**
 * Создаёт сообщение о результатах ночи для всех игроков
 * @param {object} nightResults - Результаты ночи
 * @returns {string} Текст сообщения
 */
const getNightResultsMessage = (nightResults) => {
  if (nightResults.diedDuringNight.length === 0) {
    return '🌅 Наступило утро. Ночь прошла спокойно — никто не погиб.';
  }

  let message = '🌅 Наступило утро.\n\n';
  message += '💀 Сегодня ночью погибли:\n';

  for (const victim of nightResults.diedDuringNight) {
    message += `• ${victim.firstName}\n`;
  }

  return message;
};

module.exports = {
  runNightPhase,
  applyNightResults,
  getNightResultsMessage,
};
