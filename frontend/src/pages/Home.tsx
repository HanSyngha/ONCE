import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSpaceStore } from '../stores/spaceStore';
import { useSettingsStore } from '../stores/settingsStore';
import { spacesApi, requestsApi } from '../services/api';
import InputModal from '../components/input/InputModal';
import { showToast } from '../components/common/Toast';
import {
  SparklesIcon,
  FolderIcon,
  DocumentTextIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';

const translations = {
  ko: {
    greeting: '안녕하세요',
    welcome: '무엇을 작성해드릴까요?',
    quickStart: '빠른 시작',
    newNote: '새 노트 작성',
    newNoteDesc: 'AI가 자동으로 정리합니다',
    recentNotes: '최근 노트',
    viewAll: '전체 보기',
    stats: '통계',
    totalNotes: '전체 노트',
    totalFolders: '폴더',
    thisWeek: '이번 주',
    empty: '아직 노트가 없습니다',
    emptyDesc: '첫 번째 노트를 작성해보세요',
    teamSpace: '팀 공간',
    personalSpace: '개인 공간',
  },
  en: {
    greeting: 'Hello',
    welcome: 'What would you like to write?',
    quickStart: 'Quick Start',
    newNote: 'Create New Note',
    newNoteDesc: 'AI organizes automatically',
    recentNotes: 'Recent Notes',
    viewAll: 'View All',
    stats: 'Statistics',
    totalNotes: 'Total Notes',
    totalFolders: 'Folders',
    thisWeek: 'This Week',
    empty: 'No notes yet',
    emptyDesc: 'Create your first note',
    teamSpace: 'Team Space',
    personalSpace: 'Personal Space',
  },
  cn: {
    greeting: '你好',
    welcome: '今天想写点什么？',
    quickStart: '快速开始',
    newNote: '创建新笔记',
    newNoteDesc: 'AI 自动整理',
    recentNotes: '最近笔记',
    viewAll: '查看全部',
    stats: '统计',
    totalNotes: '笔记总数',
    totalFolders: '文件夹',
    thisWeek: '本周',
    empty: '暂无笔记',
    emptyDesc: '创建您的第一个笔记',
    teamSpace: '团队空间',
    personalSpace: '个人空间',
  },
};

interface SpaceSummary {
  totalFiles: number;
  totalFolders: number;
  recentFiles: Array<{
    id: string;
    name: string;
    path: string;
    updatedAt: string;
  }>;
  thisWeekCount: number;
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { activeTab } = useSpaceStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  const [showInputModal, setShowInputModal] = useState(false);
  const [summary, setSummary] = useState<SpaceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const personalSpaceId = user?.spaces?.personalSpaceId;
  const teamSpaceId = user?.spaces?.teamSpaceId;
  const currentSpaceId = activeTab === 'personal' ? personalSpaceId : teamSpaceId;

  useEffect(() => {
    if (currentSpaceId) {
      loadSummary();
    }
  }, [currentSpaceId]);

  const loadSummary = async () => {
    if (!currentSpaceId) return;

    setIsLoading(true);
    try {
      const response = await spacesApi.getSummary(currentSpaceId);
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to load summary:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (language === 'ko') {
      if (minutes < 1) return '방금 전';
      if (minutes < 60) return `${minutes}분 전`;
      if (hours < 24) return `${hours}시간 전`;
      if (days < 7) return `${days}일 전`;
      return date.toLocaleDateString('ko-KR');
    } else if (language === 'en') {
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString('en-US');
    } else {
      if (minutes < 1) return '刚刚';
      if (minutes < 60) return `${minutes}分钟前`;
      if (hours < 24) return `${hours}小时前`;
      if (days < 7) return `${days}天前`;
      return date.toLocaleDateString('zh-CN');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Greeting + Quick Start */}
      <div
        onClick={() => setShowInputModal(true)}
        className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-primary-600 via-primary-500 to-accent-purple cursor-pointer group hover:shadow-glow transition-all duration-300"
      >
        <div className="flex items-center gap-5">
          <div className="flex-1">
            <p className="text-primary-100 text-sm font-medium mb-1">
              {t.greeting}, {user?.username}
            </p>
            <h1 className="text-xl lg:text-2xl font-bold text-white mb-1">
              {t.welcome}
            </h1>
            <p className="text-primary-200 text-sm">{t.newNoteDesc}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
            <SparklesIcon className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <DocumentTextIcon className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-content-primary">
                {isLoading ? '-' : summary?.totalFiles || 0}
              </p>
              <p className="text-xs text-content-tertiary">{t.totalNotes}</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <FolderIcon className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-content-primary">
                {isLoading ? '-' : summary?.totalFolders || 0}
              </p>
              <p className="text-xs text-content-tertiary">{t.totalFolders}</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <ArrowTrendingUpIcon className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-content-primary">
                {isLoading ? '-' : summary?.thisWeekCount || 0}
              </p>
              <p className="text-xs text-content-tertiary">{t.thisWeek}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Notes */}
      <div className="card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary">
          <h2 className="font-semibold text-content-primary">{t.recentNotes}</h2>
          <button
            onClick={() => navigate(`/search?space=${activeTab}`)}
            className="text-sm text-primary-500 hover:text-primary-600 font-medium"
          >
            {t.viewAll}
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton w-10 h-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/3 rounded" />
                  <div className="skeleton h-3 w-1/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : summary?.recentFiles && summary.recentFiles.length > 0 ? (
          <div className="divide-y divide-border-primary">
            {summary.recentFiles.map((file) => (
              <div
                key={file.id}
                onClick={() => navigate(`/note/${file.id}`)}
                className="flex items-center gap-3 px-6 py-4 hover:bg-surface-secondary cursor-pointer transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <DocumentTextIcon className="w-5 h-5 text-primary-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-content-primary truncate">{file.name}</p>
                  <p className="text-sm text-content-tertiary truncate">{file.path}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-content-quaternary">
                  <ClockIcon className="w-3.5 h-3.5" />
                  {getTimeAgo(file.updatedAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-secondary flex items-center justify-center mb-4">
              <DocumentTextIcon className="w-8 h-8 text-content-quaternary" />
            </div>
            <p className="text-content-secondary font-medium mb-1">{t.empty}</p>
            <p className="text-content-tertiary text-sm">{t.emptyDesc}</p>
          </div>
        )}
      </div>

      {/* Input Modal */}
      <InputModal
        isOpen={showInputModal}
        onClose={() => setShowInputModal(false)}
        spaceId={currentSpaceId || ''}
      />
    </div>
  );
}
