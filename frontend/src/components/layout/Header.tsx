import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore, Theme, Language } from '../../stores/settingsStore';
import { authApi } from '../../services/api';
import {
  MagnifyingGlassIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  ChevronDownIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const themeIcons: Record<Theme, typeof SunIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: ComputerDesktopIcon,
};

const themeLabels: Record<Theme, Record<Language, string>> = {
  light: { ko: '라이트', en: 'Light', cn: '浅色' },
  dark: { ko: '다크', en: 'Dark', cn: '深色' },
  system: { ko: '시스템', en: 'System', cn: '系统' },
};

const translations = {
  ko: {
    search: '검색',
    searchPlaceholder: '무엇이든 찾아 드립니다...',
    profile: '프로필',
    settings: '설정',
    logout: '로그아웃',
    admin: '관리자',
  },
  en: {
    search: 'Search',
    searchPlaceholder: 'We\'ll find anything for you...',
    profile: 'Profile',
    settings: 'Settings',
    logout: 'Logout',
    admin: 'Admin',
  },
  cn: {
    search: '搜索',
    searchPlaceholder: '什么都能帮您找到...',
    profile: '个人资料',
    settings: '设置',
    logout: '退出',
    admin: '管理员',
  },
};

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearUser } = useAuthStore();
  const { language, theme, setTheme, toggleSidebar } = useSettingsStore();
  const t = translations[language];

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearch(false);
      }
      if (themeRef.current && !themeRef.current.contains(event.target as Node)) {
        setShowThemeMenu(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global keyboard shortcut: Cmd/Ctrl + K to open search
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setShowSearch(true);
      }
      if (event.key === 'Escape') {
        setShowSearch(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setShowSearch(false);
      setSearchQuery('');
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore error
    }
    clearUser();
    navigate('/');
  };

  const cycleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const ThemeIcon = themeIcons[theme];

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-surface-primary/80 backdrop-blur-xl border-b border-border-primary z-50">
      <div className="h-full px-4 lg:px-6 flex items-center justify-between">
        {/* Left section */}
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg hover:bg-surface-secondary transition-colors"
            aria-label="Toggle sidebar"
          >
            <Bars3Icon className="w-5 h-5 text-content-secondary" />
          </button>

          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => navigate('/home')}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-content-primary hidden sm:block">
              AIPO
            </span>
          </div>
        </div>

        {/* Center section - Search */}
        <div ref={searchRef} className="flex-1 max-w-xl mx-4">
          {showSearch ? (
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="input w-full pl-10"
                autoFocus
              />
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-content-tertiary" />
            </form>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-secondary hover:bg-surface-tertiary border border-border-secondary text-content-tertiary transition-all duration-200"
            >
              <MagnifyingGlassIcon className="w-5 h-5" />
              <span className="text-sm">{t.searchPlaceholder}</span>
              <kbd className="ml-auto hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-surface-primary border border-border-primary text-xs text-content-quaternary">
                <span className="text-[10px]">⌘</span>K
              </kbd>
            </button>
          )}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <div ref={themeRef} className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="p-2.5 rounded-xl hover:bg-surface-secondary transition-colors"
              aria-label="Theme"
            >
              <ThemeIcon className="w-5 h-5 text-content-secondary" />
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 top-full mt-2 w-40 bg-surface-primary rounded-xl border border-border-primary shadow-soft overflow-hidden animate-fadeIn">
                {(['light', 'dark', 'system'] as Theme[]).map((t) => {
                  const Icon = themeIcons[t];
                  return (
                    <button
                      key={t}
                      onClick={() => {
                        setTheme(t);
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        theme === t
                          ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                          : 'text-content-secondary hover:bg-surface-secondary'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {themeLabels[t][language]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Profile menu */}
          <div ref={profileRef} className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 p-1.5 pr-3 rounded-xl hover:bg-surface-secondary transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-medium text-sm">
                {user?.username?.charAt(0) || 'U'}
              </div>
              <span className="hidden md:block text-sm font-medium text-content-primary max-w-[100px] truncate">
                {user?.username}
              </span>
              <ChevronDownIcon className="w-4 h-4 text-content-tertiary hidden md:block" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-surface-primary rounded-xl border border-border-primary shadow-soft overflow-hidden animate-fadeIn">
                {/* User info */}
                <div className="px-4 py-3 border-b border-border-primary">
                  <p className="font-medium text-content-primary truncate">
                    {user?.username}
                  </p>
                  <p className="text-sm text-content-tertiary truncate">
                    {user?.deptname}
                  </p>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      navigate('/settings');
                      setShowProfileMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-content-secondary hover:bg-surface-secondary transition-colors"
                  >
                    <Cog6ToothIcon className="w-4 h-4" />
                    {t.settings}
                  </button>

                  {(user?.isSuperAdmin || user?.isTeamAdmin) && (
                    <button
                      onClick={() => {
                        navigate('/admin');
                        setShowProfileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-content-secondary hover:bg-surface-secondary transition-colors"
                    >
                      <UserCircleIcon className="w-4 h-4" />
                      {t.admin}
                    </button>
                  )}
                </div>

                {/* Logout */}
                <div className="py-1 border-t border-border-primary">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <ArrowRightOnRectangleIcon className="w-4 h-4" />
                    {t.logout}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
