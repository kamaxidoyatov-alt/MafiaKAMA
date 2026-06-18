/**
 * Точка входа для системы AI-агентов
 * Экспортирует все компоненты для удобного импорта
 */

const AgentMemory = require('./memory');
const agentManager = require('./agentManager');
const personalities = require('./personalities');

module.exports = {
  AgentMemory,
  agentManager,
  personalities,
};
