# =============================================
# Dockerfile для MafiaBOT — Railway deploy
# Многоступенчатая сборка для production
# =============================================

# ---- Stage 1: Install dependencies ----
FROM node:20-alpine AS deps

WORKDIR /app

# Установка системных зависимостей (нужны для некоторых native-пакетов)
RUN apk add --no-cache python3 make g++ curl

# Копируем package.json и lockfile
COPY package.json package-lock.json ./

# Устанавливаем только production-зависимости
RUN npm ci --only=production

# ---- Stage 2: Production image ----
FROM node:20-alpine AS production

WORKDIR /app

# Устанавливаем curl для healthcheck
RUN apk add --no-cache curl

# Копируем node_modules
COPY --from=deps /app/node_modules ./node_modules

# Копируем исходный код (исключая ненужные файлы через .dockerignore)
COPY . .

# Создаём директорию для логов
RUN mkdir -p logs

# Пользователь node для безопасности
USER node

# Порт из переменной окружения Railway
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:$PORT/health || exit 1

# Запуск
CMD ["node", "src/index.js"]
