import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || '';

let socket: Socket | null = null;

export interface QueueUpdate {
  requestId: string;
  position: number;
  totalInQueue?: number;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  progress?: number;
  message?: string;
}

export interface RequestProgress {
  requestId: string;
  iteration: number;
  tool?: string;
  progress: number;
  message?: string;
}

export interface RequestComplete {
  requestId: string;
  success: boolean;
  result?: {
    filesCreated?: string[];
    filesModified?: string[];
    foldersCreated?: string[];
    results?: Array<{
      fileId: string;
      path: string;
      title: string;
      snippet: string;
      relevanceScore: number;
    }>;
    summary?: string;
  };
  error?: string;
}

export interface RequestAskUser {
  requestId: string;
  question: string;
  options: string[];
  timeoutMs: number;
}

type EventHandlers = {
  'queue:update': (data: QueueUpdate) => void;
  'request:progress': (data: RequestProgress) => void;
  'request:complete': (data: RequestComplete) => void;
  'request:failed': (data: { requestId: string; error: string }) => void;
  'request:ask_user': (data: RequestAskUser) => void;
};

/**
 * WebSocket 연결 초기화
 */
export function initializeWebSocket(): Socket {
  if (socket) {
    return socket;
  }

  const token = localStorage.getItem('once_token');

  socket = io(WS_URL, {
    path: '/ws',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[WS] Connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('[WS] Disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[WS] Connection error:', error.message);
  });

  return socket;
}

/**
 * WebSocket 연결 해제
 */
export function disconnectWebSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * 큐 상태 구독
 */
export function subscribeToQueue(spaceId: string): void {
  if (!socket) {
    initializeWebSocket();
  }
  socket?.emit('subscribe:queue', { spaceId });
}

/**
 * 큐 상태 구독 해제
 */
export function unsubscribeFromQueue(spaceId: string): void {
  socket?.emit('unsubscribe:queue', { spaceId });
}

/**
 * 요청 상태 구독
 */
export function subscribeToRequest(requestId: string): void {
  if (!socket) {
    initializeWebSocket();
  }
  socket?.emit('subscribe:request', { requestId });
}

/**
 * 이벤트 핸들러 등록
 */
export function on<K extends keyof EventHandlers>(
  event: K,
  handler: EventHandlers[K]
): void {
  if (!socket) {
    initializeWebSocket();
  }
  socket?.on(event, handler as any);
}

/**
 * 이벤트 핸들러 해제
 */
export function off<K extends keyof EventHandlers>(
  event: K,
  handler?: EventHandlers[K]
): void {
  if (handler) {
    socket?.off(event, handler as any);
  } else {
    socket?.off(event);
  }
}

/**
 * 연결 상태 확인
 */
export function isConnected(): boolean {
  return socket?.connected || false;
}

/**
 * Socket 인스턴스 가져오기
 */
export function getSocket(): Socket | null {
  return socket;
}
