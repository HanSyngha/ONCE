import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

import { useSettingsStore } from '../stores/settingsStore';
import { requestsApi } from '../services/api';
import { showToast } from '../components/common/Toast';
import RatingPopup, { shouldShowRating } from '../components/common/RatingPopup';
import EmptyState from '../components/common/EmptyState';
import {
  on,
  off,
  subscribeToRequest,
  RequestComplete,
  RequestProgress,
} from '../services/websocket';
import {
  MagnifyingGlassIcon,
  DocumentTextIcon,
  ClockIcon,
  SparklesIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';

const translations = {
  ko: {
    title: '검색',
    placeholder: '무엇이든 찾아 드립니다...',
    searching: 'AI가 검색 중입니다...',
    searchingDetail: '폴더를 탐색하고 관련 노트를 찾고 있습니다',
    results: '검색 결과',
    noResults: '검색 결과가 없습니다',
    noResultsDesc: '다른 검색어로 다시 시도해보세요',
    recentSearches: '최근 검색',
    clearHistory: '기록 삭제',
    relevance: '관련도',
    filter: '필터',
    all: '전체',
    personal: '개인',
    team: '팀',
    searchFailed: '검색에 실패했습니다',
  },
  en: {
    title: 'Search',
    placeholder: 'We\'ll find anything for you...',
    searching: 'AI is searching...',
    searchingDetail: 'Exploring folders and finding relevant notes',
    results: 'Search Results',
    noResults: 'No results found',
    noResultsDesc: 'Try a different search term',
    recentSearches: 'Recent Searches',
    clearHistory: 'Clear History',
    relevance: 'Relevance',
    filter: 'Filter',
    all: 'All',
    personal: 'Personal',
    team: 'Team',
    searchFailed: 'Search failed',
  },
  cn: {
    title: '搜索',
    placeholder: '什么都能帮您找到...',
    searching: 'AI正在搜索...',
    searchingDetail: '正在浏览文件夹并查找相关笔记',
    results: '搜索结果',
    noResults: '未找到结果',
    noResultsDesc: '尝试其他搜索词',
    recentSearches: '最近搜索',
    clearHistory: '清除历史',
    relevance: '相关度',
    filter: '筛选',
    all: '全部',
    personal: '个人',
    team: '团队',
    searchFailed: '搜索失败',
  },
};

interface SearchResultItem {
  fileId: string;
  path: string;
  title: string;
  snippet: string;
  relevanceScore: number;
}

export default function Search() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [spaceFilter, setSpaceFilter] = useState<'all' | 'personal' | 'team'>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRating, setShowRating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  const personalSpaceId = user?.spaces?.personalSpaceId;
  const teamSpaceId = user?.spaces?.teamSpaceId;
  const currentRequestId = useRef<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('once_recent_searches');
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch {
        // Ignore
      }
    }
  }, []);

  const searchQ = searchParams.get('q');
  useEffect(() => {
    if (searchQ) {
      setQuery(searchQ);
      handleSearch(searchQ);
    }
  }, [searchQ]);

  // WebSocket listeners for search results
  useEffect(() => {
    const handleComplete = (data: RequestComplete) => {
      if (data.requestId !== currentRequestId.current) return;

      setIsSearching(false);
      setProgress(100);

      if (data.success && data.result?.results) {
        setResults(data.result.results);
      } else if (data.error) {
        showToast.error(t.searchFailed);
        setResults([]);
      } else {
        // Success but no results
        setResults([]);
      }

      // Rating popup
      if (shouldShowRating()) {
        setTimeout(() => setShowRating(true), 600);
      }
    };

    const handleFailed = (data: { requestId: string; error: string }) => {
      if (data.requestId !== currentRequestId.current) return;

      setIsSearching(false);
      setProgress(0);
      showToast.error(t.searchFailed);
      setResults([]);
    };

    const handleProgress = (data: RequestProgress) => {
      if (data.requestId !== currentRequestId.current) return;

      setProgress(data.progress);
      if (data.message) {
        setProgressMessage(data.message);
      }
    };

    on('request:complete', handleComplete);
    on('request:failed', handleFailed);
    on('request:progress', handleProgress);

    return () => {
      off('request:complete', handleComplete);
      off('request:failed', handleFailed);
      off('request:progress', handleProgress);
    };
  }, [t]);

  const saveRecentSearch = (q: string) => {
    const updated = [q, ...recentSearches.filter((s) => s !== q)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('once_recent_searches', JSON.stringify(updated));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('once_recent_searches');
  };

  const handleSearch = useCallback(async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!q.trim()) return;

    const spaceId =
      spaceFilter === 'personal'
        ? personalSpaceId
        : spaceFilter === 'team'
        ? teamSpaceId
        : personalSpaceId || teamSpaceId;

    if (!spaceId) return;

    setIsSearching(true);
    setHasSearched(true);
    setResults([]);
    setProgress(0);
    setProgressMessage('');
    saveRecentSearch(q.trim());

    try {
      const response = await requestsApi.search(spaceId, q.trim());
      const requestId = response.data.request?.id;

      if (requestId) {
        currentRequestId.current = requestId;
        subscribeToRequest(requestId);

        // Safety timeout — if WebSocket never responds, stop loading after 2 min
        setTimeout(() => {
          if (currentRequestId.current === requestId) {
            setIsSearching((prev) => {
              if (prev) {
                setResults([]);
                showToast.error(t.searchFailed);
              }
              return false;
            });
          }
        }, 120_000);
      } else {
        // No requestId returned — unexpected
        setIsSearching(false);
        setResults([]);
      }
    } catch (error) {
      console.error('Search failed:', error);
      showToast.error(t.searchFailed);
      setResults([]);
      setIsSearching(false);
    }
  }, [query, spaceFilter, personalSpaceId, teamSpaceId, t]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchParams({ q: query.trim() });
    }
  };

  return (
    <>
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-content-primary mb-2">
          {t.title}
        </h1>
      </div>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.placeholder}
            className="input w-full pl-12 pr-24 py-3.5 text-base"
            autoFocus
          />
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-content-tertiary" />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-20 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-secondary rounded"
            >
              <XMarkIcon className="w-4 h-4 text-content-tertiary" />
            </button>
          )}
          <button
            type="submit"
            disabled={!query.trim() || isSearching}
            className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary py-2"
          >
            {isSearching ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <SparklesIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      </form>

      {/* Filters */}
      {teamSpaceId && (
        <div className="flex items-center gap-2 mb-6">
          <AdjustmentsHorizontalIcon className="w-4 h-4 text-content-tertiary" />
          <div className="flex gap-1 p-1 bg-surface-secondary rounded-lg">
            {(['all', 'personal', 'team'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setSpaceFilter(filter)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  spaceFilter === filter
                    ? 'bg-surface-primary text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-content-tertiary hover:text-content-secondary'
                }`}
              >
                {t[filter]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {isSearching ? (
        <div className="card p-12">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-4" />
            <p className="text-content-primary font-medium mb-1">{t.searching}</p>
            <p className="text-content-tertiary text-sm mb-4">{t.searchingDetail}</p>
            {progress > 0 && (
              <div className="w-full max-w-xs">
                <div className="h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(progress, 99)}%` }}
                  />
                </div>
                {progressMessage && (
                  <p className="text-xs text-content-quaternary mt-2 text-center">{progressMessage}</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : hasSearched ? (
        results.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-content-primary">
                {t.results} ({results.length})
              </h2>
            </div>
            {results.map((result) => (
              <div
                key={result.fileId}
                onClick={() => navigate(`/note/${result.fileId}`)}
                className="card p-4 cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <DocumentTextIcon className="w-5 h-5 text-primary-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-content-primary truncate">
                        {result.title}
                      </h3>
                    </div>
                    <p className="text-sm text-content-tertiary mb-2 truncate">
                      {result.path}
                    </p>
                    {result.snippet && (
                      <p className="text-sm text-content-secondary line-clamp-2">
                        {result.snippet}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-content-quaternary">
                      <div className="flex items-center gap-1">
                        <SparklesIcon className="w-3.5 h-3.5" />
                        {t.relevance}: {Math.round(result.relevanceScore)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="search"
            title={t.noResults}
            description={t.noResultsDesc}
          />
        )
      ) : (
        // Recent searches
        recentSearches.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
              <h3 className="font-semibold text-content-primary">{t.recentSearches}</h3>
              <button
                onClick={clearRecentSearches}
                className="text-sm text-content-tertiary hover:text-content-secondary"
              >
                {t.clearHistory}
              </button>
            </div>
            <div className="py-2">
              {recentSearches.map((search, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(search);
                    setSearchParams({ q: search });
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-secondary transition-colors"
                >
                  <ClockIcon className="w-4 h-4 text-content-quaternary" />
                  <span className="text-sm text-content-secondary">{search}</span>
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </div>

    <RatingPopup
      isOpen={showRating}
      onClose={() => setShowRating(false)}
      modelName="unknown"
    />
    </>
  );
}
