/**
 * LLM Сервис для AI-агентов
 * Поддерживает OpenAI, Google Gemini и Anthropic Claude
 * Предоставляет единый интерфейс для работы с разными провайдерами
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger').withContext('LLMService');

/**
 * Отправляет запрос к LLM API
 * @param {string} systemPrompt - Системный промпт
 * @param {string} userPrompt - Пользовательский запрос
 * @param {object} options - Дополнительные параметры
 * @returns {Promise<string>} Ответ LLM
 */
const queryLLM = async (systemPrompt, userPrompt, options = {}) => {
  const provider = config.llmProvider || 'openai';
  const { temperature = 0.8, maxTokens = 300 } = options;

  try {
    switch (provider) {
      case 'openai':
        return await queryOpenAI(systemPrompt, userPrompt, temperature, maxTokens);
      case 'gemini':
        return await queryGemini(systemPrompt, userPrompt, temperature, maxTokens);
      case 'claude':
        return await queryClaude(systemPrompt, userPrompt, temperature, maxTokens);
      default:
        // Fallback на симуляцию (для разработки без API ключа)
        return simulateResponse(systemPrompt, userPrompt);
    }
  } catch (error) {
    logger.error(`Ошибка LLM (${provider}): ${error.message}`);
    // Fallback: возвращаем симулированный ответ
    return simulateResponse(systemPrompt, userPrompt);
  }
};

/**
 * Запрос к OpenAI
 */
const queryOpenAI = async (systemPrompt, userPrompt, temperature, maxTokens) => {
  if (!config.openaiApiKey) throw new Error('OpenAI API ключ не настроен');

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: config.openaiModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    },
    {
      headers: {
        'Authorization': `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  return response.data.choices[0]?.message?.content?.trim() || '';
};

/**
 * Запрос к Google Gemini
 */
const queryGemini = async (systemPrompt, userPrompt, temperature, maxTokens) => {
  if (!config.geminiApiKey) throw new Error('Gemini API ключ не настроен');

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${config.geminiApiKey}`,
    {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    },
    { timeout: 15000 }
  );

  return response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
};

/**
 * Запрос к Anthropic Claude
 */
const queryClaude = async (systemPrompt, userPrompt, temperature, maxTokens) => {
  if (!config.claudeApiKey) throw new Error('Claude API ключ не настроен');

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: config.claudeModel || 'claude-3-sonnet-20240229',
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    },
    {
      headers: {
        'x-api-key': config.claudeApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  return response.data.content?.[0]?.text?.trim() || '';
};

/**
 * Симуляция ответа (для разработки без API)
 */
const simulateResponse = (systemPrompt, userPrompt) => {
  const responses = [
    'Я думаю, что игрок №3 ведёт себя подозрительно. Он слишком тихий.',
    'Давайте не торопиться с голосованием. Нужно больше информации.',
    'Я уверен, что игрок №7 — мафия. Смотрите, как он голосовал в прошлом раунде.',
    'Интересно, что ночью никто не погиб. Значит, доктор сработал или любовница.',
    'Я мирный житель. У меня нет никакой дополнительной информации.',
    'Предлагаю проверить игрока №2. Он слишком активно защищает подозреваемых.',
    'Моё мнение: игрок №5 — мафия. Голосую за него.',
    'Я не уверен, кто мафия. Давайте послушаем, что скажут другие.',
    'Заметьте, как игрок №4 отводит подозрения от себя. Это подозрительно.',
    'В прошлом раунде игрок №1 голосовал за мирного. Это могла быть стратегия мафии.',
  ];

  const randomIndex = Math.floor(Math.random() * responses.length);
  return responses[randomIndex];
};

/**
 * Формирует системный промпт для AI-агента на основе его личности и роли
 * @param {object} personality - Личность агента
 * @param {string} role - Роль в игре
 * @param {object} gameContext - Контекст игры
 * @returns {string} Системный промпт
 */
const buildAgentPrompt = (personality, role, gameContext) => {
  let prompt = `Ты — игрок в игре «Мафия». Твоя задача — вести себя как реальный человек и победить.\n\n`;

  prompt += `**Твоя личность:**\n`;
  prompt += `Имя: ${personality.name}\n`;
  prompt += `Характер: ${personality.traits}\n`;
  prompt += `Стиль общения: ${personality.communicationStyle}\n`;
  prompt += `Особенности: ${personality.quirks}\n\n`;

  prompt += `**Твоя роль:** ${getRoleDisplayName(role)}\n`;
  prompt += getRoleObjective(role);

  prompt += `\n**Текущая ситуация:**\n`;
  prompt += `Раунд: ${gameContext.round}\n`;
  prompt += `Фаза: ${gameContext.phase}\n`;
  prompt += `Живых игроков: ${gameContext.aliveCount}\n`;
  prompt += `Ты жив: ${gameContext.isAlive ? 'да' : 'нет'}\n\n`;

  if (gameContext.nightResult) {
    prompt += `**События ночи:** ${gameContext.nightResult}\n\n`;
  }

  if (personality.suspicions && Object.keys(personality.suspicions).length > 0) {
    prompt += `**Твои подозрения:**\n`;
    for (const [playerId, level] of Object.entries(personality.suspicions)) {
      prompt += `- Игрок ${playerId}: уровень подозрения ${level}/10\n`;
    }
    prompt += '\n';
  }

  prompt += `**Важные правила:**\n`;
  prompt += `1. НЕ раскрывай свою роль, если ты мафия или маньяк\n`;
  prompt += `2. Говори естественно, как в реальном чате\n`;
  prompt += `3. Используй логику и наблюдательность\n`;
  prompt += `4. Отвечай кратко (1-3 предложения)\n`;
  prompt += `5. Упоминай действия и слова других игроков\n`;

  return prompt;
};

/**
 * Получает цель для голосования AI-агента
 * @param {object} personality - Личность
 * @param {object} gameContext - Контекст игры
 * @returns {Promise<number>} ID выбранного игрока
 */
const getAIDecision = async (personality, gameContext) => {
  const prompt = buildAgentPrompt(personality, personality.role, gameContext);

  const userMessage = `Раунд ${gameContext.round}, фаза "${gameContext.phase}". Твои подозрения и действия других игроков:\n${JSON.stringify(gameContext.recentEvents || [])}\n\nКого ты подозреваешь и за кого будешь голосовать? Ответь кратко, как в чате, и укажи номер игрока, за которого голосуешь.`;

  const response = await queryLLM(prompt, userMessage, { temperature: 0.8, maxTokens: 200 });

  // Пытаемся извлечь номер игрока из ответа
  const playerMatch = response.match(/игрок[а]?\s*[№#]?(\d+)/i);
  if (playerMatch) {
    return parseInt(playerMatch[1]);
  }

  return null;
};

/**
 * Получает целевого игрока для ночного действия AI-агента
 * @param {object} personality - Личность
 * @param {object} gameContext - Контекст игры
 * @returns {Promise<number>} ID цели
 */
const getAINightTarget = async (personality, gameContext) => {
  const prompt = buildAgentPrompt(personality, personality.role, gameContext);

  const actionType = getNightActionDescription(personality.role);
  const userMessage = `${actionType}\n\nТекущая ситуация:\n${JSON.stringify(gameContext.recentEvents || [])}\n\nКакого игрока ты выбираешь? Ответь кратко с номером игрока.`;

  const response = await queryLLM(prompt, userMessage, { temperature: 0.7, maxTokens: 150 });

  const playerMatch = response.match(/игрок[а]?\s*[№#]?(\d+)/i);
  if (playerMatch) {
    return parseInt(playerMatch[1]);
  }

  return null;
};

/**
 * Вспомогательные функции
 */
const getRoleDisplayName = (roleId) => {
  const names = {
    peaceful: 'Мирный житель',
    mafia: 'Мафия',
    don: 'Дон',
    commissar: 'Комиссар',
    doctor: 'Доктор',
    maniac: 'Маньяк',
    sheriff: 'Шериф',
    bodyguard: 'Телохранитель',
    mistress: 'Любовница',
  };
  return names[roleId] || roleId;
};

const getRoleObjective = (roleId) => {
  const objectives = {
    peaceful: 'Твоя цель — вычислить и исключить всех членов мафии.\n',
    mafia: 'Твоя цель — убить всех мирных жителей, скрывая свою роль.\n',
    don: 'Ты — лидер мафии. Твоя цель — уничтожить мирных жителей. Комиссар не может тебя проверить.\n',
    commissar: 'Ночью ты можешь проверять игроков. Твоя цель — найти мафию.\n',
    doctor: 'Ночью ты можешь спасать игроков от смерти. Защищай мирных.\n',
    maniac: 'Ты — одиночка. Твоя цель — остаться последним выжившим. Убивай всех.\n',
    sheriff: 'Ночью ты можешь проверять, является ли игрок мафией.\n',
    bodyguard: 'Ночью ты можешь защищать игроков. Если на твоего подопечного нападут — ты погибнешь, но убьешь одного мафиози.\n',
    mistress: 'Ночью ты можешь посетить игрока и заблокировать нападение на него.\n',
  };
  return objectives[roleId] || '';
};

const getNightActionDescription = (roleId) => {
  const descriptions = {
    mafia: 'Выбери игрока для убийства (вместе с другими мафиози).',
    don: 'Выбери игрока для убийства. Твой голос решающий.',
    commissar: 'Выбери игрока для проверки его роли.',
    doctor: 'Выбери игрока для спасения.',
    maniac: 'Выбери жертву для убийства.',
    sheriff: 'Выбери игрока для проверки на мафию.',
    bodyguard: 'Выбери игрока для защиты.',
    mistress: 'Выбери игрока для визита (блокировки убийства).',
  };
  return descriptions[roleId] || '';
};

module.exports = {
  queryLLM,
  buildAgentPrompt,
  getAIDecision,
  getAINightTarget,
  getRoleDisplayName,
};
