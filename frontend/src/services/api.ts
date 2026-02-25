import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('once_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('once_token');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// ==================== Auth API ====================
export const authApi = {
  login: (ssoToken: string) =>
    api.post('/auth/login', {}, { headers: { Authorization: `Bearer ${ssoToken}` } }),

  me: () => api.get('/auth/me'),

  check: () => api.get('/auth/check'),

  refresh: () => api.post('/auth/refresh'),

  logout: () => api.post('/auth/logout'),
};

// ==================== Spaces API ====================
export const spacesApi = {
  getPersonal: () => api.get('/spaces/personal'),

  getTeam: () => api.get('/spaces/team'),

  getTree: (spaceId: string, language: string = 'KO') =>
    api.get(`/spaces/${spaceId}/tree`, { params: { language } }),

  getSummary: (spaceId: string) => api.get(`/spaces/${spaceId}/summary`),
};

// ==================== Files API ====================
export const filesApi = {
  get: (fileId: string, language: string = 'KO') =>
    api.get(`/files/${fileId}`, { params: { language } }),

  getHistory: (fileId: string, language: string = 'KO') =>
    api.get(`/files/${fileId}/history`, { params: { language } }),

  export: (fileId: string, language: string = 'KO', includeComments: boolean = false) =>
    api.post(`/files/${fileId}/export`, { language, includeComments }, { responseType: 'blob' }),

  share: (fileId: string) => api.post(`/files/${fileId}/share`),

  retryTranslation: (fileId: string, lang: 'EN' | 'CN') =>
    api.post(`/files/${fileId}/retry-translation/${lang}`),

  moveToTrash: (fileId: string) =>
    api.post(`/files/${fileId}/trash`),
};

// ==================== Folders API ====================
export const foldersApi = {
  delete: (folderId: string) => api.delete(`/files/folders/${folderId}`),
};

// ==================== Requests API ====================
export const requestsApi = {
  input: (spaceId: string, input: string) =>
    api.post('/requests/input', { spaceId, input }),

  search: (spaceId: string, query: string) =>
    api.post('/requests/search', { spaceId, query }),

  refactor: (spaceId: string, instructions?: string) =>
    api.post('/requests/refactor', { spaceId, instructions }),

  get: (requestId: string) => api.get(`/requests/${requestId}`),

  cancel: (requestId: string) => api.delete(`/requests/${requestId}`),

  getQueueStatus: (spaceId: string) =>
    api.get('/requests/queue-status', { params: { spaceId } }),

  answerQuestion: (requestId: string, answer: string) =>
    api.post(`/requests/${requestId}/answer`, { answer }),
};

// ==================== Comments API ====================
export const commentsApi = {
  getForFile: (fileId: string) => api.get(`/comments/files/${fileId}/comments`),

  create: (fileId: string, blockId: string, content: string, parentId?: string) =>
    api.post(`/comments/files/${fileId}/comments`, { blockId, content, parentId }),

  update: (commentId: string, content: string) =>
    api.put(`/comments/${commentId}`, { content }),

  delete: (commentId: string) => api.delete(`/comments/${commentId}`),
};

// ==================== Trash API ====================
export const trashApi = {
  list: (spaceId: string) => api.get('/trash', { params: { spaceId } }),

  restore: (fileId: string) => api.post(`/trash/${fileId}/restore`),

  permanentDelete: (fileId: string) => api.delete(`/trash/${fileId}`),

  empty: (spaceId: string) => api.delete('/trash', { params: { spaceId } }),
};

// ==================== Admin API ====================
export const adminApi = {
  getTeams: () => api.get('/admin/teams'),

  getTeamMembers: (teamId: string, params?: { page?: number; limit?: number; search?: string }) =>
    api.get(`/admin/teams/${teamId}/members`, { params }),

  addTeamAdmin: (teamId: string, loginid: string) =>
    api.post(`/admin/teams/${teamId}/admins`, { loginid }),

  removeTeamAdmin: (teamId: string, userId: string) =>
    api.delete(`/admin/teams/${teamId}/admins/${userId}`),

  getStats: (days?: number) => api.get('/admin/stats', { params: { days } }),

  getAuditLogs: (params?: {
    page?: number;
    limit?: number;
    action?: string;
    spaceId?: string;
    userId?: string;
  }) => api.get('/admin/audit-logs', { params }),

  getUsers: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get('/admin/users', { params }),

  // Model management
  getModels: () => api.get('/admin/models'),

  getModelConfig: () => api.get('/admin/model-config'),

  updateModelConfig: (config: { defaultModel: string; fallbackModels: string[] }) =>
    api.put('/admin/model-config', config),
};

// ==================== Rating API (Dashboard) ====================
const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL || 'http://a2g.samsungds.net:4090';

export const ratingApi = {
  submit: (modelName: string, rating: number) => {
    const user = useAuthStore.getState().user;

    return axios.post(
      `${DASHBOARD_URL}/api/rating`,
      {
        modelName,
        rating,
        serviceId: 'once',
      },
      {
        headers: {
          'X-Service-Id': 'once',
          ...(user && {
            'X-User-Id': user.loginid,
            'X-User-Name': encodeURIComponent(user.username),
            'X-User-Dept': encodeURIComponent(user.deptname),
          }),
        },
      }
    );
  },
};

// ==================== Settings API ====================
export const settingsApi = {
  get: () => api.get('/settings'),

  update: (settings: { language?: string; theme?: string }) =>
    api.put('/settings', settings),
};
