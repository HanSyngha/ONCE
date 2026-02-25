import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useSpaceStore, SpaceTab } from '../../stores/spaceStore';
import { useSettingsStore, NoteLanguage } from '../../stores/settingsStore';
import { spacesApi } from '../../services/api';
import NoteTree from '../tree/NoteTree';
import InputModal from '../input/InputModal';
import {
  UserIcon,
  UserGroupIcon,
  PlusIcon,
  TrashIcon,
  FolderIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const translations = {
  ko: {
    personal: '개인 공간',
    team: '팀 공간',
    newNote: '새 노트 작성',
    trash: '휴지통',
    empty: '아직 노트가 없습니다',
    createFirst: '첫 번째 노트를 작성해보세요',
  },
  en: {
    personal: 'Personal',
    team: 'Team',
    newNote: 'New Note',
    trash: 'Trash',
    empty: 'No notes yet',
    createFirst: 'Create your first note',
  },
  cn: {
    personal: '个人空间',
    team: '团队空间',
    newNote: '新建笔记',
    trash: '回收站',
    empty: '暂无笔记',
    createFirst: '创建您的第一个笔记',
  },
};

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const {
    activeTab,
    setActiveTab,
    personalTree,
    teamTree,
    setPersonalTree,
    setTeamTree,
    isLoadingPersonal,
    isLoadingTeam,
    setIsLoadingPersonal,
    setIsLoadingTeam,
    refreshKey,
  } = useSpaceStore();
  const { language, noteLanguage, sidebarCollapsed, setSidebarCollapsed } = useSettingsStore();
  const t = translations[language];

  const [showInputModal, setShowInputModal] = useState(false);

  const personalSpaceId = user?.spaces?.personalSpaceId;
  const teamSpaceId = user?.spaces?.teamSpaceId;
  const currentSpaceId = activeTab === 'personal' ? personalSpaceId : teamSpaceId;
  const currentTree = activeTab === 'personal' ? personalTree : teamTree;
  const isLoading = activeTab === 'personal' ? isLoadingPersonal : isLoadingTeam;

  useEffect(() => {
    loadTree('personal');
    loadTree('team');
  }, [refreshKey, noteLanguage]);

  const loadTree = async (tab: SpaceTab) => {
    const spaceId = tab === 'personal' ? personalSpaceId : teamSpaceId;
    if (!spaceId) return;

    const setLoading = tab === 'personal' ? setIsLoadingPersonal : setIsLoadingTeam;
    const setTree = tab === 'personal' ? setPersonalTree : setTeamTree;

    setLoading(true);
    try {
      const res = await spacesApi.getTree(spaceId, noteLanguage);
      setTree(res.data.tree || []);
    } catch (error) {
      console.error(`Failed to load ${tab} tree:`, error);
      setTree([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: SpaceTab) => {
    setActiveTab(tab);
  };

  const handleNewNote = () => {
    setShowInputModal(true);
  };

  if (sidebarCollapsed) {
    return (
      <>
        <aside className="fixed left-0 top-16 bottom-0 w-16 bg-surface-primary border-r border-border-primary z-40 flex flex-col items-center py-4 gap-2">
          {/* Expand button */}
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="p-2 rounded-lg hover:bg-surface-secondary transition-colors mb-2"
            aria-label="Expand sidebar"
          >
            <ChevronRightIcon className="w-5 h-5 text-content-secondary" />
          </button>

          {/* Tab icons */}
          <button
            onClick={() => handleTabChange('personal')}
            className={`p-2.5 rounded-xl transition-all ${
              activeTab === 'personal'
                ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                : 'text-content-tertiary hover:bg-surface-secondary'
            }`}
            title={t.personal}
          >
            <UserIcon className="w-5 h-5" />
          </button>

          {teamSpaceId && (
            <button
              onClick={() => handleTabChange('team')}
              className={`p-2.5 rounded-xl transition-all ${
                activeTab === 'team'
                  ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-content-tertiary hover:bg-surface-secondary'
              }`}
              title={t.team}
            >
              <UserGroupIcon className="w-5 h-5" />
            </button>
          )}

          <div className="flex-1" />

          {/* New note button */}
          <button
            onClick={handleNewNote}
            className="p-2.5 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-colors shadow-soft"
            title={t.newNote}
          >
            <PlusIcon className="w-5 h-5" />
          </button>

          {/* Trash */}
          <button
            onClick={() => navigate('/trash')}
            className={`p-2.5 rounded-xl transition-all ${
              location.pathname === '/trash'
                ? 'bg-surface-secondary text-content-primary'
                : 'text-content-tertiary hover:bg-surface-secondary'
            }`}
            title={t.trash}
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </aside>

        <InputModal
          isOpen={showInputModal}
          onClose={() => setShowInputModal(false)}
          spaceId={currentSpaceId || ''}
        />
      </>
    );
  }

  return (
    <>
      <aside className="fixed left-0 top-16 bottom-0 w-72 bg-surface-primary border-r border-border-primary z-40 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
          <h2 className="font-semibold text-content-primary">
            {activeTab === 'personal' ? t.personal : t.team}
          </h2>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="p-1.5 rounded-lg hover:bg-surface-secondary transition-colors"
            aria-label="Collapse sidebar"
          >
            <ChevronLeftIcon className="w-4 h-4 text-content-tertiary" />
          </button>
        </div>

        {/* Space tabs */}
        <div className="flex px-3 py-2 gap-1 border-b border-border-primary">
          <button
            onClick={() => handleTabChange('personal')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'personal'
                ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                : 'text-content-secondary hover:bg-surface-secondary'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            {t.personal}
          </button>

          {teamSpaceId && (
            <button
              onClick={() => handleTabChange('team')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'team'
                  ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-content-secondary hover:bg-surface-secondary'
              }`}
            >
              <UserGroupIcon className="w-4 h-4" />
              {t.team}
            </button>
          )}
        </div>

        {/* Tree content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton h-8 rounded-lg" />
              ))}
            </div>
          ) : currentTree.length > 0 ? (
            <NoteTree nodes={currentTree} />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-surface-secondary flex items-center justify-center mb-4">
                <FolderIcon className="w-8 h-8 text-content-quaternary" />
              </div>
              <p className="text-content-secondary font-medium mb-1">{t.empty}</p>
              <p className="text-content-tertiary text-sm mb-4">{t.createFirst}</p>
              <button
                onClick={handleNewNote}
                className="btn-primary text-sm"
              >
                <SparklesIcon className="w-4 h-4" />
                {t.newNote}
              </button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-3 border-t border-border-primary space-y-2">
          {/* New note button */}
          <button
            onClick={handleNewNote}
            className="w-full btn-primary justify-center"
          >
            <SparklesIcon className="w-4 h-4" />
            {t.newNote}
          </button>

          {/* Trash link */}
          <button
            onClick={() => navigate('/trash')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
              location.pathname === '/trash'
                ? 'bg-surface-secondary text-content-primary'
                : 'text-content-tertiary hover:bg-surface-secondary'
            }`}
          >
            <TrashIcon className="w-4 h-4" />
            {t.trash}
          </button>
        </div>
      </aside>

      <InputModal
        isOpen={showInputModal}
        onClose={() => setShowInputModal(false)}
        spaceId={currentSpaceId || ''}
      />
    </>
  );
}
