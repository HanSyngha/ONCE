/**
 * WebSocket Server
 *
 * Socket.IO 기반 실시간 통신
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';

interface AuthenticatedSocket extends Socket {
  user?: {
    loginid: string;
    userId?: string;
  };
}

export function setupWebSocket(io: SocketIOServer): void {
  // 인증 미들웨어
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { loginid: string };
      socket.user = { loginid: decoded.loginid };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`[WS] Client connected: ${socket.user?.loginid}`);

    // 사용자별 룸 조인
    if (socket.user?.loginid) {
      socket.join(`user:${socket.user.loginid}`);
    }

    // 큐 상태 구독
    socket.on('subscribe:queue', (data: { spaceId: string }) => {
      if (data.spaceId) {
        socket.join(`queue:${data.spaceId}`);
        console.log(`[WS] ${socket.user?.loginid} subscribed to queue:${data.spaceId}`);
      }
    });

    // 큐 상태 구독 해제
    socket.on('unsubscribe:queue', (data: { spaceId: string }) => {
      if (data.spaceId) {
        socket.leave(`queue:${data.spaceId}`);
        console.log(`[WS] ${socket.user?.loginid} unsubscribed from queue:${data.spaceId}`);
      }
    });

    // 요청 상태 구독
    socket.on('subscribe:request', (data: { requestId: string }) => {
      if (data.requestId) {
        socket.join(`request:${data.requestId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Client disconnected: ${socket.user?.loginid}`);
    });
  });

  console.log('[WS] WebSocket server initialized');
}

/**
 * 큐 상태 업데이트 브로드캐스트
 */
export function emitQueueUpdate(
  io: SocketIOServer,
  spaceId: string,
  data: {
    requestId: string;
    position: number;
    totalInQueue: number;
    status: 'waiting' | 'processing' | 'completed' | 'failed';
    progress?: number;
    message?: string;
  }
): void {
  io.to(`queue:${spaceId}`).emit('queue:update', data);
}

/**
 * 요청 진행 상태 업데이트
 */
export function emitRequestProgress(
  io: SocketIOServer,
  requestId: string,
  data: {
    iteration: number;
    tool?: string;
    progress: number;
    message?: string;
  }
): void {
  io.to(`request:${requestId}`).emit('request:progress', {
    requestId,
    ...data,
  });
}

/**
 * 요청 완료 알림
 */
export function emitRequestComplete(
  io: SocketIOServer,
  requestId: string,
  loginid: string,
  data: {
    success: boolean;
    result?: Record<string, unknown>;
    error?: string;
  }
): void {
  io.to(`request:${requestId}`).emit('request:complete', {
    requestId,
    ...data,
  });

  io.to(`user:${loginid}`).emit('request:complete', {
    requestId,
    ...data,
  });
}

/**
 * 사용자 질문 전송 (ask_to_user)
 */
export function emitAskUser(
  io: SocketIOServer,
  requestId: string,
  loginid: string,
  data: {
    question: string;
    options: string[];
    timeoutMs: number;
  }
): void {
  io.to(`request:${requestId}`).emit('request:ask_user', {
    requestId,
    ...data,
  });

  io.to(`user:${loginid}`).emit('request:ask_user', {
    requestId,
    ...data,
  });
}

/**
 * 요청 실패 알림
 */
export function emitRequestFailed(
  io: SocketIOServer,
  requestId: string,
  loginid: string,
  error: string
): void {
  io.to(`request:${requestId}`).emit('request:failed', {
    requestId,
    error,
  });

  io.to(`user:${loginid}`).emit('request:failed', {
    requestId,
    error,
  });
}
