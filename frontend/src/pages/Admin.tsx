import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { adminApi } from '../services/api';
import { showToast } from '../components/common/Toast';
import Modal from '../components/common/Modal';
import {
  UserGroupIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CpuChipIcon,
  StarIcon,
  ArrowsUpDownIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';

const translations = {
  ko: {
    title: '관리자',
    teams: '팀 관리',
    stats: '통계',
    auditLogs: '감사 로그',
    users: '사용자',
    addAdmin: '관리자 추가',
    removeAdmin: '관리자 제거',
    loginId: '로그인 ID',
    cancel: '취소',
    add: '추가',
    remove: '제거',
    confirm: '확인',
    totalUsers: '전체 사용자',
    totalNotes: '전체 노트',
    totalTeams: '전체 팀',
    activeToday: '오늘 활성',
    noTeams: '팀이 없습니다',
    noLogs: '로그가 없습니다',
    noUsers: '사용자가 없습니다',
    search: '검색',
    action: '작업',
    user: '사용자',
    target: '대상',
    time: '시간',
    refactor: '구조 정리',
    refactorDesc: 'AI가 폴더 구조를 자동으로 정리합니다',
    refactorStart: '정리 시작',
    previous: '이전',
    next: '다음',
    adminAddSuccess: '관리자가 추가되었습니다',
    adminRemoveSuccess: '관리자가 제거되었습니다',
    teamName: '팀 이름',
    admins: '관리자',
    members: '멤버',
    models: '모델 관리',
    defaultModel: '기본 모델',
    fallbackModels: '대체 모델',
    availableModels: '사용 가능한 모델',
    setAsDefault: '기본으로 설정',
    addFallback: '대체에 추가',
    removeFallback: '대체에서 제거',
    saveModelConfig: '설정 저장',
    modelConfigSaved: '모델 설정이 저장되었습니다',
    noModels: '사용 가능한 모델이 없습니다',
    loadingModels: '모델 목록 불러오는 중...',
    modelConfigDesc: '기본 모델 실패 시 대체 모델 순서대로 재시도합니다',
    currentDefault: '현재 기본',
    fallbackOrder: '대체 순서',
    maxTokens: '최대 토큰',
    refreshModels: '새로고침',
    // New translations
    teamMembers: '팀 멤버',
    promote: '승격',
    demote: '해제',
    promoteSuccess: '팀 관리자로 승격되었습니다',
    demoteSuccess: '팀 관리자 권한이 해제되었습니다',
    superAdminBadge: '슈퍼관리자',
    teamAdminBadge: '팀관리자',
    memberBadge: '멤버',
    superAdminSection: '슈퍼 관리자 전용',
    department: '부서',
    lastActive: '최근 활동',
    role: '역할',
    actions: '액션',
    allUsers: '전체 사용자',
    expand: '펼치기',
    collapse: '접기',
  },
  en: {
    title: 'Admin',
    teams: 'Team Management',
    stats: 'Statistics',
    auditLogs: 'Audit Logs',
    users: 'Users',
    addAdmin: 'Add Admin',
    removeAdmin: 'Remove Admin',
    loginId: 'Login ID',
    cancel: 'Cancel',
    add: 'Add',
    remove: 'Remove',
    confirm: 'Confirm',
    totalUsers: 'Total Users',
    totalNotes: 'Total Notes',
    totalTeams: 'Total Teams',
    activeToday: 'Active Today',
    noTeams: 'No teams',
    noLogs: 'No logs',
    noUsers: 'No users',
    search: 'Search',
    action: 'Action',
    user: 'User',
    target: 'Target',
    time: 'Time',
    refactor: 'Refactor Structure',
    refactorDesc: 'AI will automatically organize folder structure',
    refactorStart: 'Start Refactoring',
    previous: 'Previous',
    next: 'Next',
    adminAddSuccess: 'Admin added successfully',
    adminRemoveSuccess: 'Admin removed successfully',
    teamName: 'Team Name',
    admins: 'Admins',
    members: 'Members',
    models: 'Model Management',
    defaultModel: 'Default Model',
    fallbackModels: 'Fallback Models',
    availableModels: 'Available Models',
    setAsDefault: 'Set as Default',
    addFallback: 'Add to Fallback',
    removeFallback: 'Remove from Fallback',
    saveModelConfig: 'Save Config',
    modelConfigSaved: 'Model configuration saved',
    noModels: 'No models available',
    loadingModels: 'Loading models...',
    modelConfigDesc: 'If default model fails, fallback models are tried in order',
    currentDefault: 'Current Default',
    fallbackOrder: 'Fallback Order',
    maxTokens: 'Max Tokens',
    refreshModels: 'Refresh',
    // New translations
    teamMembers: 'Team Members',
    promote: 'Promote',
    demote: 'Demote',
    promoteSuccess: 'Promoted to team admin',
    demoteSuccess: 'Team admin role revoked',
    superAdminBadge: 'Super Admin',
    teamAdminBadge: 'Team Admin',
    memberBadge: 'Member',
    superAdminSection: 'Super Admin Only',
    department: 'Department',
    lastActive: 'Last Active',
    role: 'Role',
    actions: 'Actions',
    allUsers: 'All Users',
    expand: 'Expand',
    collapse: 'Collapse',
  },
  cn: {
    title: '管理员',
    teams: '团队管理',
    stats: '统计',
    auditLogs: '审计日志',
    users: '用户',
    addAdmin: '添加管理员',
    removeAdmin: '移除管理员',
    loginId: '登录 ID',
    cancel: '取消',
    add: '添加',
    remove: '移除',
    confirm: '确认',
    totalUsers: '总用户数',
    totalNotes: '总笔记数',
    totalTeams: '总团队数',
    activeToday: '今日活跃',
    noTeams: '暂无团队',
    noLogs: '暂无日志',
    noUsers: '暂无用户',
    search: '搜索',
    action: '操作',
    user: '用户',
    target: '目标',
    time: '时间',
    refactor: '整理结构',
    refactorDesc: 'AI 将自动整理文件夹结构',
    refactorStart: '开始整理',
    previous: '上一页',
    next: '下一页',
    adminAddSuccess: '管理员添加成功',
    adminRemoveSuccess: '管理员移除成功',
    teamName: '团队名称',
    admins: '管理员',
    members: '成员',
    models: '模型管理',
    defaultModel: '默认模型',
    fallbackModels: '备用模型',
    availableModels: '可用模型',
    setAsDefault: '设为默认',
    addFallback: '添加备用',
    removeFallback: '移除备用',
    saveModelConfig: '保存设置',
    modelConfigSaved: '模型配置已保存',
    noModels: '暂无可用模型',
    loadingModels: '加载模型中...',
    modelConfigDesc: '默认模型失败时，按顺序尝试备用模型',
    currentDefault: '当前默认',
    fallbackOrder: '备用顺序',
    maxTokens: '最大令牌',
    refreshModels: '刷新',
    // New translations
    teamMembers: '团队成员',
    promote: '升级',
    demote: '降级',
    promoteSuccess: '已升级为团队管理员',
    demoteSuccess: '已撤销团队管理员权限',
    superAdminBadge: '超级管理员',
    teamAdminBadge: '团队管理员',
    memberBadge: '成员',
    superAdminSection: '超级管理员专用',
    department: '部门',
    lastActive: '最近活跃',
    role: '角色',
    actions: '操作',
    allUsers: '所有用户',
    expand: '展开',
    collapse: '收起',
  },
};

type Tab = 'teams' | 'stats' | 'logs' | 'users' | 'models';

interface Team {
  id: string;
  name: string;
  displayName: string;
  businessUnit: string;
  adminCount: number;
  memberCount: number;
  admins: Array<{ id: string; loginid: string; username: string }>;
}

interface TeamMember {
  id: string;
  loginid: string;
  username: string;
  deptname: string;
  lastActive: string;
  isTeamAdmin: boolean;
  isSuperAdmin: boolean;
}

interface Stats {
  totalUsers: number;
  totalNotes: number;
  totalTeams: number;
  activeToday: number;
  dailyStats: Array<{ date: string; users: number; notes: number }>;
}

interface AuditLog {
  id: string;
  action: string;
  userId: string;
  username: string;
  targetId?: string;
  targetName?: string;
  createdAt: string;
}

interface User {
  id: string;
  loginid: string;
  username: string;
  deptname: string;
  lastActive: string;
  isSuperAdmin?: boolean;
  isTeamAdmin?: boolean;
  teamAdminOf?: string[];
}

interface LLMModel {
  id: string;
  displayName: string;
  maxTokens: number;
}

interface ModelConfig {
  defaultModel: string;
  fallbackModels: string[];
  updatedBy?: string;
  updatedAt?: string;
}

// Role badge component
function RoleBadge({ isSuperAdmin, isTeamAdmin, t }: { isSuperAdmin?: boolean; isTeamAdmin?: boolean; t: typeof translations['ko'] }) {
  if (isSuperAdmin) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
        <ShieldExclamationIcon className="w-3 h-3" />
        {t.superAdminBadge}
      </span>
    );
  }
  if (isTeamAdmin) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
        <ShieldCheckIcon className="w-3 h-3" />
        {t.teamAdminBadge}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
      {t.memberBadge}
    </span>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  const [activeTab, setActiveTab] = useState<Tab>('teams');
  const [teams, setTeams] = useState<Team[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [newAdminLoginId, setNewAdminLoginId] = useState('');

  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSearch, setUsersSearch] = useState('');

  // Model management state
  const [availableModels, setAvailableModels] = useState<LLMModel[]>([]);
  const [modelConfig, setModelConfig] = useState<ModelConfig>({ defaultModel: '', fallbackModels: [] });
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelConfigDirty, setModelConfigDirty] = useState(false);

  // Expandable team members state
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({});
  const [teamMembersLoading, setTeamMembersLoading] = useState<Set<string>>(new Set());
  const [teamMembersPagination, setTeamMembersPagination] = useState<Record<string, { page: number; total: number; totalPages: number }>>({});
  const [teamMembersSearch, setTeamMembersSearch] = useState<Record<string, string>>({});

  const isSuperAdmin = user?.isSuperAdmin;
  const isTeamAdmin = user?.isTeamAdmin;

  useEffect(() => {
    if (!isSuperAdmin && !isTeamAdmin) {
      navigate('/home');
      return;
    }
    loadData();
  }, [activeTab, logsPage, usersPage, usersSearch]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      switch (activeTab) {
        case 'teams':
          const teamsRes = await adminApi.getTeams();
          setTeams(teamsRes.data.teams || []);
          break;
        case 'stats':
          const statsRes = await adminApi.getStats(30);
          const statsData = statsRes.data;
          setStats({
            totalUsers: statsData.overview?.totalUsers || 0,
            totalNotes: statsData.overview?.totalFiles || 0,
            totalTeams: statsData.overview?.totalTeams || 0,
            activeToday: 0,
            dailyStats: (statsData.requests?.daily || []).map((d: any) => ({
              date: d.createdAt,
              users: 0,
              notes: d._count || 0,
            })),
          });
          break;
        case 'logs':
          const logsRes = await adminApi.getAuditLogs({ page: logsPage, limit: 20 });
          setLogs(logsRes.data.logs || []);
          setLogsTotal(logsRes.data.pagination?.total || 0);
          break;
        case 'users':
          const usersRes = await adminApi.getUsers({
            page: usersPage,
            limit: 20,
            search: usersSearch || undefined,
          });
          setUsers(usersRes.data.users || []);
          setUsersTotal(usersRes.data.pagination?.total || 0);
          break;
        case 'models':
          await loadModels();
          break;
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTeamMembers = useCallback(async (teamId: string, page: number = 1, search?: string) => {
    setTeamMembersLoading(prev => new Set(prev).add(teamId));
    try {
      const res = await adminApi.getTeamMembers(teamId, { page, limit: 20, search });
      setTeamMembers(prev => ({ ...prev, [teamId]: res.data.members || [] }));
      setTeamMembersPagination(prev => ({
        ...prev,
        [teamId]: {
          page: res.data.pagination?.page || 1,
          total: res.data.pagination?.total || 0,
          totalPages: res.data.pagination?.totalPages || 1,
        },
      }));
    } catch (error) {
      console.error('Failed to load team members:', error);
    } finally {
      setTeamMembersLoading(prev => {
        const next = new Set(prev);
        next.delete(teamId);
        return next;
      });
    }
  }, []);

  const toggleTeamExpand = (teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
        if (!teamMembers[teamId]) {
          loadTeamMembers(teamId);
        }
      }
      return next;
    });
  };

  const refreshTeamList = async () => {
    try {
      const teamsRes = await adminApi.getTeams();
      setTeams(teamsRes.data.teams || []);
    } catch (error) {
      console.error('Failed to refresh teams:', error);
    }
  };

  const handlePromote = async (teamId: string, loginid: string) => {
    try {
      await adminApi.addTeamAdmin(teamId, loginid);
      showToast.success(t.promoteSuccess);
      loadTeamMembers(teamId, teamMembersPagination[teamId]?.page || 1, teamMembersSearch[teamId]);
      refreshTeamList();
    } catch (error: any) {
      console.error('Failed to promote:', error);
      showToast.error(error.response?.data?.error || 'Failed to promote');
    }
  };

  const handleDemote = async (teamId: string, userId: string) => {
    try {
      await adminApi.removeTeamAdmin(teamId, userId);
      showToast.success(t.demoteSuccess);
      loadTeamMembers(teamId, teamMembersPagination[teamId]?.page || 1, teamMembersSearch[teamId]);
      refreshTeamList();
    } catch (error: any) {
      console.error('Failed to demote:', error);
      showToast.error(error.response?.data?.error || 'Failed to demote');
    }
  };

  const handleAddAdmin = async () => {
    if (!selectedTeam || !newAdminLoginId.trim()) return;

    try {
      await adminApi.addTeamAdmin(selectedTeam.id, newAdminLoginId.trim());
      showToast.success(t.adminAddSuccess);
      setShowAddAdminModal(false);
      setNewAdminLoginId('');
      setSelectedTeam(null);
      loadData();
    } catch (error: any) {
      console.error('Failed to add admin:', error);
      showToast.error(error.response?.data?.error || 'Failed to add admin');
    }
  };

  const handleRemoveAdmin = async (teamId: string, userId: string) => {
    try {
      await adminApi.removeTeamAdmin(teamId, userId);
      showToast.success(t.adminRemoveSuccess);
      loadData();
    } catch (error: any) {
      console.error('Failed to remove admin:', error);
      showToast.error(error.response?.data?.error || 'Failed to remove admin');
    }
  };

  const loadModels = async () => {
    setModelsLoading(true);
    try {
      const [modelsRes, configRes] = await Promise.all([
        adminApi.getModels(),
        adminApi.getModelConfig(),
      ]);
      const models = modelsRes.data.models || [];
      setAvailableModels(models);
      const config = configRes.data;
      if (!config.defaultModel && models.length > 0) {
        config.defaultModel = models[0].id;
      }
      setModelConfig(config);
      setModelConfigDirty(false);
    } catch (error) {
      console.error('Failed to load models:', error);
    } finally {
      setModelsLoading(false);
    }
  };

  const handleSetDefaultModel = (modelId: string) => {
    setModelConfig(prev => {
      const newFallback = prev.fallbackModels.filter(m => m !== modelId);
      return { ...prev, defaultModel: modelId, fallbackModels: newFallback };
    });
    setModelConfigDirty(true);
  };

  const handleToggleFallback = (modelId: string) => {
    setModelConfig(prev => {
      if (modelId === prev.defaultModel) return prev;
      const exists = prev.fallbackModels.includes(modelId);
      const newFallback = exists
        ? prev.fallbackModels.filter(m => m !== modelId)
        : [...prev.fallbackModels, modelId];
      return { ...prev, fallbackModels: newFallback };
    });
    setModelConfigDirty(true);
  };

  const handleMoveFallback = (modelId: string, direction: 'up' | 'down') => {
    setModelConfig(prev => {
      const arr = [...prev.fallbackModels];
      const idx = arr.indexOf(modelId);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= arr.length) return prev;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return { ...prev, fallbackModels: arr };
    });
    setModelConfigDirty(true);
  };

  const handleSaveModelConfig = async () => {
    try {
      await adminApi.updateModelConfig({
        defaultModel: modelConfig.defaultModel,
        fallbackModels: modelConfig.fallbackModels,
      });
      showToast.success(t.modelConfigSaved);
      setModelConfigDirty(false);
    } catch (error) {
      console.error('Failed to save model config:', error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    if (language === 'ko') {
      return date.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (language === 'en') {
      return date.toLocaleString('en-US', {
        timeZone: 'Asia/Seoul',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else {
      return date.toLocaleString('zh-CN', {
        timeZone: 'Asia/Seoul',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  // Tab structure: Team Admin tabs + Super Admin only tabs
  const teamAdminTabs: Array<{ id: Tab; label: string; icon: typeof UserGroupIcon }> = [
    { id: 'teams', label: t.teams, icon: UserGroupIcon },
    { id: 'stats', label: t.stats, icon: ChartBarIcon },
  ];

  const superAdminTabs: Array<{ id: Tab; label: string; icon: typeof UserGroupIcon }> = [
    { id: 'logs', label: t.auditLogs, icon: ClipboardDocumentListIcon },
    { id: 'users', label: t.allUsers, icon: UsersIcon },
    { id: 'models', label: t.models, icon: CpuChipIcon },
  ];

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="card p-6">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'teams':
        return (
          <div className="space-y-4">
            {teams.length > 0 ? (
              teams.map((team) => {
                const isExpanded = expandedTeams.has(team.id);
                const members = teamMembers[team.id] || [];
                const membersLoading = teamMembersLoading.has(team.id);
                const pagination = teamMembersPagination[team.id];
                const searchQuery = teamMembersSearch[team.id] || '';

                return (
                  <div key={team.id} className="card">
                    {/* Team Header - Clickable to expand */}
                    <button
                      onClick={() => toggleTeamExpand(team.id)}
                      className="w-full p-4 flex items-center justify-between hover:bg-surface-secondary/50 transition-colors rounded-t-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <h3 className="font-semibold text-content-primary text-left">{team.displayName || team.name}</h3>
                          <p className="text-sm text-content-tertiary text-left">{team.businessUnit}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-4 text-sm text-content-secondary">
                          <span>{t.members}: {team.memberCount}</span>
                          <span>{t.admins}: {team.adminCount}</span>
                        </div>
                        {isExpanded ? (
                          <ChevronUpIcon className="w-5 h-5 text-content-tertiary" />
                        ) : (
                          <ChevronDownIcon className="w-5 h-5 text-content-tertiary" />
                        )}
                      </div>
                    </button>

                    {/* Expanded: Members table */}
                    {isExpanded && (
                      <div className="border-t border-border-primary">
                        {/* Admins row */}
                        <div className="px-4 py-3 bg-surface-secondary/30">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-content-secondary">{t.admins}</span>
                            <button
                              onClick={() => {
                                setSelectedTeam(team);
                                setShowAddAdminModal(true);
                              }}
                              className="btn-ghost text-xs py-1 px-2"
                            >
                              <PlusIcon className="w-3 h-3" />
                              {t.addAdmin}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(team.admins || []).map((admin) => (
                              <div
                                key={admin.id}
                                className="flex items-center gap-2 px-3 py-1.5 bg-surface-primary rounded-lg text-sm"
                              >
                                <span className="text-content-primary">{admin.username}</span>
                                <span className="text-content-quaternary">({admin.loginid})</span>
                                <button
                                  onClick={() => handleRemoveAdmin(team.id, admin.id)}
                                  className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"
                                >
                                  <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Members search */}
                        <div className="px-4 py-3 border-t border-border-primary">
                          <div className="flex items-center gap-2 mb-3">
                            <h4 className="text-sm font-medium text-content-secondary">{t.teamMembers}</h4>
                          </div>
                          <div className="relative mb-3">
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTeamMembersSearch(prev => ({ ...prev, [team.id]: val }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  loadTeamMembers(team.id, 1, teamMembersSearch[team.id]);
                                }
                              }}
                              placeholder={t.search}
                              className="input w-full pl-10 text-sm"
                            />
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                          </div>

                          {/* Members table */}
                          {membersLoading ? (
                            <div className="space-y-2">
                              {[...Array(3)].map((_, i) => (
                                <div key={i} className="skeleton h-10 rounded-lg" />
                              ))}
                            </div>
                          ) : (
                            <>
                              <div className="overflow-x-auto">
                                <table className="w-full">
                                  <thead>
                                    <tr className="border-b border-border-primary">
                                      <th className="text-left px-3 py-2 text-xs font-medium text-content-secondary">{t.user}</th>
                                      <th className="text-left px-3 py-2 text-xs font-medium text-content-secondary">{t.loginId}</th>
                                      <th className="text-left px-3 py-2 text-xs font-medium text-content-secondary">{t.department}</th>
                                      <th className="text-left px-3 py-2 text-xs font-medium text-content-secondary">{t.role}</th>
                                      <th className="text-left px-3 py-2 text-xs font-medium text-content-secondary">{t.actions}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {members.map((member) => (
                                      <tr key={member.id} className="border-b border-border-primary last:border-0">
                                        <td className="px-3 py-2">
                                          <span className="text-sm font-medium text-content-primary">{member.username}</span>
                                        </td>
                                        <td className="px-3 py-2">
                                          <span className="text-sm text-content-secondary">{member.loginid}</span>
                                        </td>
                                        <td className="px-3 py-2">
                                          <span className="text-sm text-content-tertiary">{member.deptname}</span>
                                        </td>
                                        <td className="px-3 py-2">
                                          <RoleBadge isSuperAdmin={member.isSuperAdmin} isTeamAdmin={member.isTeamAdmin} t={t} />
                                        </td>
                                        <td className="px-3 py-2">
                                          {/* Super Admin은 환경변수로 결정되므로 승격/해제 불가 */}
                                          {!member.isSuperAdmin && (
                                            member.isTeamAdmin ? (
                                              <button
                                                onClick={() => handleDemote(team.id, member.id)}
                                                className="btn-ghost text-xs py-1 px-2 text-orange-600 dark:text-orange-400"
                                              >
                                                {t.demote}
                                              </button>
                                            ) : (
                                              <button
                                                onClick={() => handlePromote(team.id, member.loginid)}
                                                className="btn-ghost text-xs py-1 px-2 text-blue-600 dark:text-blue-400"
                                              >
                                                {t.promote}
                                              </button>
                                            )
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                    {members.length === 0 && (
                                      <tr>
                                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-content-tertiary">
                                          {t.noUsers}
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>

                              {/* Member pagination */}
                              {pagination && pagination.totalPages > 1 && (
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-primary">
                                  <button
                                    onClick={() => loadTeamMembers(team.id, pagination.page - 1, searchQuery)}
                                    disabled={pagination.page === 1}
                                    className="btn-ghost text-xs disabled:opacity-50"
                                  >
                                    <ChevronLeftIcon className="w-3.5 h-3.5" />
                                    {t.previous}
                                  </button>
                                  <span className="text-xs text-content-secondary">
                                    {pagination.page} / {pagination.totalPages}
                                  </span>
                                  <button
                                    onClick={() => loadTeamMembers(team.id, pagination.page + 1, searchQuery)}
                                    disabled={pagination.page >= pagination.totalPages}
                                    className="btn-ghost text-xs disabled:opacity-50"
                                  >
                                    {t.next}
                                    <ChevronRightIcon className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="card p-12 text-center">
                <p className="text-content-tertiary">{t.noTeams}</p>
              </div>
            )}
          </div>
        );

      case 'stats':
        return (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <UsersIcon className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-content-primary">
                      {stats?.totalUsers || 0}
                    </p>
                    <p className="text-xs text-content-tertiary">{t.totalUsers}</p>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <DocumentTextIcon className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-content-primary">
                      {stats?.totalNotes || 0}
                    </p>
                    <p className="text-xs text-content-tertiary">{t.totalNotes}</p>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <UserGroupIcon className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-content-primary">
                      {stats?.totalTeams || 0}
                    </p>
                    <p className="text-xs text-content-tertiary">{t.totalTeams}</p>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <CalendarIcon className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-content-primary">
                      {stats?.activeToday || 0}
                    </p>
                    <p className="text-xs text-content-tertiary">{t.activeToday}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Chart placeholder */}
            <div className="card p-6">
              <h3 className="font-semibold text-content-primary mb-4">Daily Activity (30 days)</h3>
              <div className="h-64 flex items-end gap-1">
                {stats?.dailyStats?.map((day, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-primary-200 dark:bg-primary-800 rounded-t"
                      style={{
                        height: `${Math.max(4, (day.notes / Math.max(...stats.dailyStats.map((d) => d.notes), 1)) * 200)}px`,
                      }}
                      title={`${day.date}: ${day.notes} notes`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'logs':
        return (
          <div className="card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-primary">
                    <th className="text-left px-4 py-3 text-sm font-medium text-content-secondary">
                      {t.action}
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-content-secondary">
                      {t.user}
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-content-secondary">
                      {t.target}
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-content-secondary">
                      {t.time}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length > 0 ? (
                    logs.map((log) => (
                      <tr key={log.id} className="border-b border-border-primary last:border-0">
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-content-primary">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-content-secondary">{log.username}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-content-tertiary">
                            {log.targetName || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-content-quaternary">
                            {formatTime(log.createdAt)}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-content-tertiary">
                        {t.noLogs}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {logsTotal > 20 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border-primary">
                <button
                  onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                  disabled={logsPage === 1}
                  className="btn-ghost text-sm disabled:opacity-50"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                  {t.previous}
                </button>
                <span className="text-sm text-content-secondary">
                  {logsPage} / {Math.ceil(logsTotal / 20)}
                </span>
                <button
                  onClick={() => setLogsPage((p) => p + 1)}
                  disabled={logsPage >= Math.ceil(logsTotal / 20)}
                  className="btn-ghost text-sm disabled:opacity-50"
                >
                  {t.next}
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        );

      case 'users':
        return (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={usersSearch}
                onChange={(e) => {
                  setUsersSearch(e.target.value);
                  setUsersPage(1);
                }}
                placeholder={t.search}
                className="input w-full pl-10"
              />
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-content-tertiary" />
            </div>

            <div className="card">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-primary">
                      <th className="text-left px-4 py-3 text-sm font-medium text-content-secondary">
                        {t.user}
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-content-secondary">
                        {t.loginId}
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-content-secondary">
                        {t.department}
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-content-secondary">
                        {t.role}
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-content-secondary">
                        {t.lastActive}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length > 0 ? (
                      users.map((u) => (
                        <tr key={u.id} className="border-b border-border-primary last:border-0">
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-content-primary">
                              {u.username}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-content-secondary">{u.loginid}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-content-tertiary">{u.deptname}</span>
                          </td>
                          <td className="px-4 py-3">
                            <RoleBadge isSuperAdmin={u.isSuperAdmin} isTeamAdmin={u.isTeamAdmin} t={t} />
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-content-quaternary">
                              {u.lastActive ? formatTime(u.lastActive) : '-'}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-content-tertiary">
                          {t.noUsers}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {usersTotal > 20 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border-primary">
                  <button
                    onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                    disabled={usersPage === 1}
                    className="btn-ghost text-sm disabled:opacity-50"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                    {t.previous}
                  </button>
                  <span className="text-sm text-content-secondary">
                    {usersPage} / {Math.ceil(usersTotal / 20)}
                  </span>
                  <button
                    onClick={() => setUsersPage((p) => p + 1)}
                    disabled={usersPage >= Math.ceil(usersTotal / 20)}
                    className="btn-ghost text-sm disabled:opacity-50"
                  >
                    {t.next}
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        );

      case 'models':
        return (
          <div className="space-y-6">
            {/* Description & Refresh */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-content-secondary">{t.modelConfigDesc}</p>
              <button
                onClick={loadModels}
                disabled={modelsLoading}
                className="btn-ghost text-sm"
              >
                <ArrowPathIcon className={`w-4 h-4 ${modelsLoading ? 'animate-spin' : ''}`} />
                {t.refreshModels}
              </button>
            </div>

            {/* Current Config Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Default Model */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <StarIcon className="w-5 h-5 text-amber-500" />
                  <h3 className="font-semibold text-content-primary">{t.defaultModel}</h3>
                </div>
                <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    {modelConfig.defaultModel || '-'}
                  </span>
                </div>
                {modelConfig.updatedBy && (
                  <p className="text-xs text-content-quaternary mt-2">
                    Updated by {modelConfig.updatedBy}
                    {modelConfig.updatedAt && ` at ${new Date(modelConfig.updatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`}
                  </p>
                )}
              </div>

              {/* Fallback Models */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowsUpDownIcon className="w-5 h-5 text-blue-500" />
                  <h3 className="font-semibold text-content-primary">{t.fallbackModels}</h3>
                  <span className="text-xs text-content-quaternary">({t.fallbackOrder})</span>
                </div>
                {modelConfig.fallbackModels.length > 0 ? (
                  <div className="space-y-1.5">
                    {modelConfig.fallbackModels.map((modelId, idx) => {
                      const model = availableModels.find(m => m.id === modelId);
                      return (
                        <div key={modelId} className="flex items-center gap-2 px-3 py-1.5 bg-surface-secondary rounded-lg">
                          <span className="text-xs font-mono text-content-quaternary w-5">{idx + 1}.</span>
                          <span className="text-sm text-content-primary flex-1">
                            {model?.displayName || modelId}
                          </span>
                          <button
                            onClick={() => handleMoveFallback(modelId, 'up')}
                            disabled={idx === 0}
                            className="p-0.5 hover:bg-surface-tertiary rounded disabled:opacity-30"
                          >
                            <ChevronLeftIcon className="w-3.5 h-3.5 rotate-90 text-content-tertiary" />
                          </button>
                          <button
                            onClick={() => handleMoveFallback(modelId, 'down')}
                            disabled={idx === modelConfig.fallbackModels.length - 1}
                            className="p-0.5 hover:bg-surface-tertiary rounded disabled:opacity-30"
                          >
                            <ChevronRightIcon className="w-3.5 h-3.5 rotate-90 text-content-tertiary" />
                          </button>
                          <button
                            onClick={() => handleToggleFallback(modelId)}
                            className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-content-tertiary">{t.noModels}</p>
                )}
              </div>
            </div>

            {/* Save button */}
            {modelConfigDirty && (
              <div className="flex justify-end">
                <button onClick={handleSaveModelConfig} className="btn-primary">
                  <CheckCircleIcon className="w-4 h-4" />
                  {t.saveModelConfig}
                </button>
              </div>
            )}

            {/* Available Models List */}
            <div className="card">
              <div className="px-4 py-3 border-b border-border-primary">
                <h3 className="font-semibold text-content-primary">{t.availableModels}</h3>
              </div>
              {modelsLoading ? (
                <div className="p-6 text-center text-content-tertiary">{t.loadingModels}</div>
              ) : availableModels.length > 0 ? (
                <div className="divide-y divide-border-primary">
                  {availableModels.map((model) => {
                    const isDefault = modelConfig.defaultModel === model.id;
                    const isFallback = modelConfig.fallbackModels.includes(model.id);
                    return (
                      <div key={model.id} className="flex items-center gap-4 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-content-primary">
                              {model.displayName}
                            </span>
                            {isDefault && (
                              <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs font-medium">
                                {t.currentDefault}
                              </span>
                            )}
                            {isFallback && (
                              <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
                                Fallback #{modelConfig.fallbackModels.indexOf(model.id) + 1}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-content-quaternary font-mono">{model.id}</span>
                            <span className="text-xs text-content-quaternary">{t.maxTokens}: {model.maxTokens.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isDefault && (
                            <button
                              onClick={() => handleSetDefaultModel(model.id)}
                              className="btn-ghost text-xs py-1 px-2"
                            >
                              <StarIcon className="w-3.5 h-3.5" />
                              {t.setAsDefault}
                            </button>
                          )}
                          {!isDefault && (
                            <button
                              onClick={() => handleToggleFallback(model.id)}
                              className={`btn-ghost text-xs py-1 px-2 ${isFallback ? 'text-red-500' : ''}`}
                            >
                              {isFallback ? (
                                <>
                                  <TrashIcon className="w-3.5 h-3.5" />
                                  {t.removeFallback}
                                </>
                              ) : (
                                <>
                                  <PlusIcon className="w-3.5 h-3.5" />
                                  {t.addFallback}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center text-content-tertiary">{t.noModels}</div>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-content-primary">{t.title}</h1>
      </div>

      {/* Tabs with separator for Super Admin section */}
      <div className="flex gap-1 p-1 bg-surface-secondary rounded-xl mb-6 overflow-x-auto items-center">
        {/* Team Admin tabs */}
        {teamAdminTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-surface-primary text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}

        {/* Separator + Super Admin tabs */}
        {isSuperAdmin && (
          <>
            <div className="flex items-center gap-1.5 px-2">
              <div className="w-px h-6 bg-border-primary" />
              <span className="text-[10px] font-medium text-content-quaternary uppercase tracking-wider whitespace-nowrap">
                {t.superAdminSection}
              </span>
              <div className="w-px h-6 bg-border-primary" />
            </div>
            {superAdminTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-surface-primary text-primary-600 dark:text-primary-400 shadow-sm'
                      : 'text-content-tertiary hover:text-content-secondary'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Content */}
      {renderContent()}

      {/* Add Admin Modal */}
      <Modal
        isOpen={showAddAdminModal}
        onClose={() => {
          setShowAddAdminModal(false);
          setNewAdminLoginId('');
          setSelectedTeam(null);
        }}
        title={t.addAdmin}
        description={selectedTeam?.name}
      >
        <Modal.Body>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">
              {t.loginId}
            </label>
            <input
              type="text"
              value={newAdminLoginId}
              onChange={(e) => setNewAdminLoginId(e.target.value)}
              className="input w-full"
              placeholder="user@example.com"
              autoFocus
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            onClick={() => {
              setShowAddAdminModal(false);
              setNewAdminLoginId('');
              setSelectedTeam(null);
            }}
            className="btn-ghost"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleAddAdmin}
            disabled={!newAdminLoginId.trim()}
            className="btn-primary"
          >
            {t.add}
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
