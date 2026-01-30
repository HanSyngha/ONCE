import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSettingsStore, NoteLanguage } from '../stores/settingsStore';
import { filesApi } from '../services/api';
import { showToast } from '../components/common/Toast';
import BlockViewer from '../components/editor/BlockViewer';
import CommentThread from '../components/comment/CommentThread';
import { SkeletonNote } from '../components/common/Skeleton';
import { LanguageBadge } from '../components/common/Badge';
import {
  ArrowLeftIcon,
  ShareIcon,
  ArrowDownTrayIcon,
  ClockIcon,
  UserIcon,
  LanguageIcon,
  ChatBubbleLeftRightIcon,
  EllipsisHorizontalIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

const translations = {
  ko: {
    back: '뒤로',
    share: '공유',
    export: '내보내기',
    comments: '댓글',
    history: '히스토리',
    createdBy: '작성자',
    lastModified: '최종 수정',
    language: '언어',
    noContent: '내용이 없습니다',
    loading: '불러오는 중...',
    error: '노트를 불러오는데 실패했습니다',
    shareSuccess: '링크가 복사되었습니다',
    exportSuccess: '파일이 다운로드되었습니다',
    retryTranslation: '번역 재시도',
    translating: '번역 중...',
  },
  en: {
    back: 'Back',
    share: 'Share',
    export: 'Export',
    comments: 'Comments',
    history: 'History',
    createdBy: 'Created by',
    lastModified: 'Last modified',
    language: 'Language',
    noContent: 'No content',
    loading: 'Loading...',
    error: 'Failed to load note',
    shareSuccess: 'Link copied to clipboard',
    exportSuccess: 'File downloaded',
    retryTranslation: 'Retry translation',
    translating: 'Translating...',
  },
  cn: {
    back: '返回',
    share: '分享',
    export: '导出',
    comments: '评论',
    history: '历史',
    createdBy: '创建者',
    lastModified: '最后修改',
    language: '语言',
    noContent: '无内容',
    loading: '加载中...',
    error: '加载笔记失败',
    shareSuccess: '链接已复制',
    exportSuccess: '文件已下载',
    retryTranslation: '重试翻译',
    translating: '翻译中...',
  },
};

interface NoteData {
  id: string;
  name: string;
  path: string;
  content: any; // BlockNote content
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  hasKO: boolean;
  hasEN: boolean;
  hasCN: boolean;
}

export default function Note() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const { language, noteLanguage, setNoteLanguage } = useSettingsStore();
  const t = translations[language];

  const [note, setNote] = useState<NoteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    if (fileId) {
      loadNote();
    }
  }, [fileId, noteLanguage]);

  const loadNote = async () => {
    if (!fileId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await filesApi.get(fileId, noteLanguage);
      const { file, version, availableLanguages } = response.data;

      // version.content는 문자열일 수 있으므로 JSON 파싱
      let parsedContent = version?.content;
      if (typeof parsedContent === 'string') {
        try {
          parsedContent = JSON.parse(parsedContent);
        } catch {
          // 파싱 실패 시 원본 유지
        }
      }

      setNote({
        id: file.id,
        name: file.name,
        path: file.path,
        content: parsedContent,
        createdBy: file.createdBy,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        hasKO: availableLanguages.some((l: any) => l.language === 'KO'),
        hasEN: availableLanguages.some((l: any) => l.language === 'EN'),
        hasCN: availableLanguages.some((l: any) => l.language === 'CN'),
      });
    } catch (err: any) {
      setError(err.response?.data?.error || t.error);
      console.error('Failed to load note:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = async () => {
    if (!fileId) return;

    try {
      const response = await filesApi.share(fileId);
      const shareUrl = response.data.shareUrl;

      // HTTP 환경에서는 clipboard API가 없으므로 fallback 사용
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showToast.success(t.shareSuccess);
    } catch (err) {
      console.error('Share failed:', err);
      showToast.error('공유 링크 생성에 실패했습니다');
    }
  };

  const handleExport = async () => {
    if (!fileId || isExporting) return;

    setIsExporting(true);
    try {
      const response = await filesApi.export(fileId, noteLanguage, showComments);

      // Create download link
      const blob = new Blob([response.data], { type: 'text/markdown' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = note?.name || 'note';
      a.download = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showToast.success(t.exportSuccess);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleRetryTranslation = async (lang: 'EN' | 'CN') => {
    if (!fileId || isRetrying) return;

    setIsRetrying(true);
    try {
      await filesApi.retryTranslation(fileId, lang);
      showToast.info(t.translating);
      // Reload after a delay
      setTimeout(() => {
        loadNote();
        setIsRetrying(false);
      }, 3000);
    } catch (err) {
      console.error('Retry translation failed:', err);
      setIsRetrying(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (language === 'ko') {
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (language === 'en') {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else {
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  const availableLanguages: NoteLanguage[] = [];
  if (note?.hasKO) availableLanguages.push('KO');
  if (note?.hasEN) availableLanguages.push('EN');
  if (note?.hasCN) availableLanguages.push('CN');

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-surface-secondary transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 text-content-secondary" />
          </button>
          <div className="skeleton h-8 w-1/3 rounded-lg" />
        </div>
        <div className="card p-6">
          <SkeletonNote />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-surface-secondary transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 text-content-secondary" />
          </button>
        </div>
        <div className="card p-12 text-center">
          <p className="text-content-secondary">{error}</p>
          <button onClick={loadNote} className="btn-primary mt-4">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-surface-secondary transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 text-content-secondary" />
          </button>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-content-primary">
              {note?.name}
            </h1>
            <p className="text-sm text-content-tertiary">{note?.path}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Language selector */}
          {availableLanguages.length > 1 && (
            <div className="flex items-center gap-1 p-1 bg-surface-secondary rounded-lg">
              {availableLanguages.map((lang) => (
                <button
                  key={lang}
                  onClick={() => setNoteLanguage(lang)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    noteLanguage === lang
                      ? 'bg-surface-primary text-primary-600 dark:text-primary-400 shadow-sm'
                      : 'text-content-tertiary hover:text-content-secondary'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <button
            onClick={() => setShowComments(!showComments)}
            className={`p-2.5 rounded-xl transition-colors ${
              showComments
                ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                : 'hover:bg-surface-secondary text-content-secondary'
            }`}
            title={t.comments}
          >
            <ChatBubbleLeftRightIcon className="w-5 h-5" />
          </button>

          <button
            onClick={handleShare}
            className="p-2.5 rounded-xl hover:bg-surface-secondary text-content-secondary transition-colors"
            title={t.share}
          >
            <ShareIcon className="w-5 h-5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2.5 rounded-xl hover:bg-surface-secondary text-content-secondary transition-colors"
            >
              <EllipsisHorizontalIcon className="w-5 h-5" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-surface-primary rounded-xl border border-border-primary shadow-soft overflow-hidden z-50 animate-fadeIn">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        handleExport();
                        setShowMenu(false);
                      }}
                      disabled={isExporting}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-content-secondary hover:bg-surface-secondary transition-colors disabled:opacity-50"
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                      {t.export}
                    </button>
                    {/* TODO: History page not yet implemented */}
                  </div>

                  {/* Retry translation */}
                  {(note?.hasKO && (!note?.hasEN || !note?.hasCN)) && (
                    <div className="py-1 border-t border-border-primary">
                      <div className="px-4 py-1.5 text-xs font-medium text-content-quaternary uppercase tracking-wider">
                        {t.retryTranslation}
                      </div>
                      {note?.hasKO && !note?.hasEN && (
                        <button
                          onClick={() => {
                            handleRetryTranslation('EN');
                            setShowMenu(false);
                          }}
                          disabled={isRetrying}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-content-secondary hover:bg-surface-secondary transition-colors disabled:opacity-50"
                        >
                          <ArrowPathIcon className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                          English
                        </button>
                      )}
                      {note?.hasKO && !note?.hasCN && (
                        <button
                          onClick={() => {
                            handleRetryTranslation('CN');
                            setShowMenu(false);
                          }}
                          disabled={isRetrying}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-content-secondary hover:bg-surface-secondary transition-colors disabled:opacity-50"
                        >
                          <ArrowPathIcon className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                          Chinese
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Main content */}
        <div className={`flex-1 min-w-0 ${showComments ? 'lg:max-w-[calc(100%-420px)]' : ''}`}>
          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-content-tertiary">
            <div className="flex items-center gap-1.5">
              <UserIcon className="w-4 h-4" />
              {note?.createdBy}
            </div>
            <div className="flex items-center gap-1.5">
              <ClockIcon className="w-4 h-4" />
              {note?.updatedAt && formatDate(note.updatedAt)}
            </div>
            <div className="flex items-center gap-1.5">
              <LanguageIcon className="w-4 h-4" />
              <div className="flex gap-1">
                {availableLanguages.map((lang) => (
                  <LanguageBadge key={lang} language={lang} />
                ))}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="card p-6 lg:p-8">
            {note?.content ? (
              <BlockViewer content={note.content} />
            ) : (
              <p className="text-content-tertiary text-center py-8">{t.noContent}</p>
            )}
          </div>
        </div>

        {/* Comments sidebar */}
        {showComments && (
          <div className="hidden lg:block w-[400px] flex-shrink-0">
            <div className="sticky top-24">
              <CommentThread fileId={fileId!} />
            </div>
          </div>
        )}
      </div>

      {/* Mobile comments */}
      {showComments && (
        <div className="lg:hidden mt-6">
          <CommentThread fileId={fileId!} />
        </div>
      )}
    </div>
  );
}
