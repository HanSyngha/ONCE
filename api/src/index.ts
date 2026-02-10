/**
 * ONCE - API Server
 *
 * LLM 기반 자동 노트 정리 서비스 백엔드
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';

// Routes
import { authRoutes } from './routes/auth.routes.js';
import { oauthRoutes } from './routes/oauth.routes.js';
import { spacesRoutes } from './routes/spaces.routes.js';
import { filesRoutes } from './routes/files.routes.js';
import { requestsRoutes, quickAddRoutes } from './routes/requests.routes.js';
import { commentsRoutes } from './routes/comments.routes.js';
import { trashRoutes } from './routes/trash.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { todosRoutes } from './routes/todos.routes.js';

// WebSocket
import { setupWebSocket } from './websocket/server.js';

// Queue
import { initializeQueue } from './services/queue/bull.service.js';

// Jobs
import { runHistoryCleanupJob } from './jobs/historyCleanup.js';

// Swagger
import { setupSwagger } from './swagger.js';

// Load environment variables
dotenv.config();

// Import and re-export prisma
import { prisma } from './db.js';
export { prisma };

// Initialize Redis
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log('[Redis] Connected');
});

redis.on('error', (err) => {
  console.error('[Redis] Error:', err.message);
});

// Create Express app
const app = express();
const httpServer = createServer(app);

// Parse CORS origins from comma-separated env var
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5090'];

// Initialize Socket.IO
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  path: '/ws',
});

// Middleware
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, _res, next) => {
  const timestamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;

    // Check Redis
    await redis.ping();

    res.json({
      status: 'ok',
      timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }),
      services: {
        database: 'ok',
        redis: 'ok',
      },
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// API Routes (nginx strips /api/ prefix)
app.use('/auth', authRoutes);
app.use('/auth', oauthRoutes);
app.use('/spaces', spacesRoutes);
app.use('/files', filesRoutes);
app.use('/requests', requestsRoutes);
app.use('/quick-add', quickAddRoutes);
app.use('/comments', commentsRoutes);
app.use('/trash', trashRoutes);
app.use('/admin', adminRoutes);
app.use('/settings', settingsRoutes);
app.use('/todos', todosRoutes);

// Setup Swagger API docs
setupSwagger(app);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Setup WebSocket
setupWebSocket(io);

// Initialize Queue
initializeQueue();

// Schedule history cleanup job (runs daily at 3 AM)
function scheduleHistoryCleanup(): void {
  const runAt3AM = () => {
    const now = new Date();
    const next3AM = new Date(now);
    next3AM.setDate(next3AM.getDate() + (now.getHours() >= 3 ? 1 : 0));
    next3AM.setHours(3, 0, 0, 0);

    const delay = next3AM.getTime() - now.getTime();

    setTimeout(() => {
      runHistoryCleanupJob()
        .catch(err => console.error('[HistoryCleanup] Job failed:', err))
        .finally(() => scheduleHistoryCleanup()); // Reschedule for next day
    }, delay);

    console.log(`[HistoryCleanup] Scheduled for ${next3AM.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })}`);
  };

  runAt3AM();
}

if (process.env.NODE_ENV === 'production') {
  scheduleHistoryCleanup();
}

// Start server
const PORT = parseInt(process.env.PORT || '3000', 10);

httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                      ONCE API Server                         ║
╠══════════════════════════════════════════════════════════════╣
║  Port:      ${PORT.toString().padEnd(47)}║
║  Env:       ${(process.env.NODE_ENV || 'development').padEnd(47)}║
║  Database:  PostgreSQL                                       ║
║  Cache:     Redis                                            ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
});
