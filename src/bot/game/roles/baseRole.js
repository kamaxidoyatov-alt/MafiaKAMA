/**
 * Базовый класс для всех ролей игры «Мафия»
 * Все роли должны наследовать этот класс и переопределять методы
 */

class BaseRole {
  constructor() {
    this.id = 'base';
    this.name = 'Базовая роль';
    this.nameRu = 'Базовая роль';
    this.team = 'peaceful';
    this.description = 'Описание роли';
    this.canActAtNight = false;
    this.canActAtDay = false;
    this.priority = 0; // Приоритет ночного действия (меньше = раньше)
    this.icon = '👤';
  }

  /**
   * Получить метаданные роли
   * @returns {object} Метаданные
   */
  getMetadata() {
    return {
      id: this.id,
      name: this.name,
      nameRu: this.nameRu,
      team: this.team,
      description: this.description,
      canActAtNight: this.canActAtNight,
      canActAtDay: this.canActAtDay,
      priority: this.priority,
      icon: this.icon,
    };
  }

  /**
   * Обработка ночного действия
   * @param {object} game - Состояние игры
   * @param {number} actorId - ID игрока, совершающего действие
   * @param {number} targetId - ID цели
   * @param {object} nightState - Состояние ночи
   * @returns {object} Результат действия
   */
  async performNightAction(game, actorId, targetId, nightState) {
    return {
      success: false,
      message: `${this.nameRu} не может действовать ночью`,
      targetId: null,
    };
  }

  /**
   * Обработка дневного действия
   * @param {object} game - Состояние игры
   * @param {number} actorId - ID игрока
   * @param {string} action - Действие
   * @param {*} value - Значение
   * @returns {object} Результат
   */
  async performDayAction(game, actorId, action, value) {
    return {
      success: true,
      message: `Игрок ${actorId} говорит: ${value}`,
    };
  }

  /**
   * Проверка на победу (вызывается после каждого раунда)
   * @param {object} game - Состояние игры
   * @param {number} playerId - ID игрока
   * @returns {boolean} true если этот игрок (команда) победил
   */
  checkWinCondition(game, playerId) {
    return false;
  }

  /**
   * Получить подсказку для игрока о его роли
   * @returns {string} Текст подсказки
   */
  getHint() {
    return `Ваша роль: ${this.icon} ${this.nameRu}\n${this.description}`;
  }

  /**
   * Получить описание ночного действия (для интерфейса)
   * @param {object} game - Состояние игры
   * @param {number} actorId - ID игрока
   * @returns {object|null} Описание действия или null если нет действий
   */
  getNightActionDescription(game, actorId) {
    if (!this.canActAtNight) return null;
    return {
      type: 'select_target',
      message: `Выберите цель для ночного действия:`,
    };
  }
}

module.exports = BaseRole;
