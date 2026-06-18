/**
 * Express сервер с WebSocket
 * Предоставляет API для внешних сервисов и WebSocket для real-time обновлений
 * Также содержит встроенную админ-панель
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const logger = require('../utils/logger').withContext('APIServer');
const apiRoutes = require('./routes');

/**
 * Инициализирует Express сервер и WebSocket
 * @param {object} bot - Экземпляр Telegram бота
 * @returns {Promise<{server: http.Server, io: Server}>}
 */
const initServer = async (bot) => {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // === Middleware ===
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  // Логирование запросов
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));

  // Сессии
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: !config.isDev, maxAge: 24 * 60 * 60 * 1000 },
  }));

  // Rate Limiting для API
  const apiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: { error: 'Слишком много запросов.' },
  });
  app.use('/api/', apiLimiter);

  // === Шаблонизатор для админ-панели ===
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'admin', 'views'));

  // === Статические файлы ===
  app.use('/static', express.static(path.join(__dirname, 'admin', 'public')));

  // === API Routes ===
  app.use('/api', apiRoutes);

  // === Админ-панель ===
  const adminRouter = require('./admin');
  app.use('/admin', adminRouter);

  // === Health Check ===
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  });

  // === WebSocket ===
  io.on('connection', (socket) => {
    logger.debug(`WebSocket клиент подключён: ${socket.id}`);

    socket.on('joinGame', (gameId) => {
      socket.join(`game:${gameId}`);
      logger.debug(`Клиент ${socket.id} присоединился к игре ${gameId}`);
    });

    socket.on('joinRoom', (roomCode) => {
      socket.join(`room:${roomCode}`);
      logger.debug(`Клиент ${socket.id} присоединился к комнате ${roomCode}`);
    });

    socket.on('leaveGame', (gameId) => {
      socket.leave(`game:${gameId}`);
    });

    socket.on('leaveRoom', (roomCode) => {
      socket.leave(`room:${roomCode}`);
    });

    socket.on('disconnect', () => {
      logger.debug(`WebSocket клиент отключён: ${socket.id}`);
    });
  });

  // === Запуск сервера ===
  return new Promise((resolve) => {
    server.listen(config.port, () => {
      logger.info(`🌐 Сервер запущен на порту ${config.port}`);
      resolve({ server, io });
    });
  });
};

module.exports = { initServer };
