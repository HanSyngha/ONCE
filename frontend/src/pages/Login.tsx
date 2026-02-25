import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore, Language } from '../stores/settingsStore';
import { api, authApi } from '../services/api';
import { showToast } from '../components/common/Toast';
import {
  SparklesIcon,
  SunIcon,
  MoonIcon,
  GlobeAltIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const translations = {
  ko: {
    title: 'ONCE',
    subtitle: '작성하기 귀찮을 때 쓰는\n지식 공유 & 메모 관리 서비스',
    description:
      '아무거나 입력하면 AI가 자동으로 정리해드립니다. 회의록, 아이디어, 메모, 뭐든지 괜찮아요.',
    loginWith: '로그인',
    loggingIn: '로그인 중...',
    feature1: '자동 정리',
    feature1Desc: '입력한 내용을 AI가 구조화',
    feature2: '다국어 지원',
    feature2Desc: '한국어·영어·중국어 자동 번역',
    feature3: '팀 협업',
    feature3Desc: '팀 공간에서 함께 공유',
    copyright: '© 2026 ONCE. Developed by syngha.han',
    tagline: 'AI powered 노트 · 지식 관리',
    catchphrase: '한번만 입력하면 모든걸 알아서!',
    notice: '개인 프로젝트 | 버그 제보:',
    contact: 'syngha.han',
    orLoginWith: '간편 로그인',
  },
  en: {
    title: 'ONCE',
    subtitle: 'Knowledge sharing &\nmemo management for the lazy',
    description:
      'Just type anything and AI will organize it for you. Meeting notes, ideas, memos - anything works.',
    loginWith: 'Login',
    loggingIn: 'Logging in...',
    feature1: 'Auto-organize',
    feature1Desc: 'AI structures your content',
    feature2: 'Multilingual',
    feature2Desc: 'Auto-translate KO·EN·CN',
    feature3: 'Team Collaboration',
    feature3Desc: 'Share in team spaces',
    copyright: '© 2026 ONCE. Developed by syngha.han',
    tagline: 'AI powered 노트 · 지식 관리',
    catchphrase: 'Type once, AI handles the rest!',
    notice: 'Personal project | Bug report:',
    contact: 'syngha.han',
    orLoginWith: 'Sign in with',
  },
  cn: {
    title: 'ONCE',
    subtitle: '懒人专用\n知识共享 & 备忘录管理服务',
    description:
      '随意输入，AI 自动整理。会议记录、创意、备忘录，什么都可以。',
    loginWith: '登录',
    loggingIn: '登录中...',
    feature1: '自动整理',
    feature1Desc: 'AI 结构化您的内容',
    feature2: '多语言支持',
    feature2Desc: '韩·英·中自动翻译',
    feature3: '团队协作',
    feature3Desc: '在团队空间中共享',
    copyright: '© 2026 ONCE. Developed by syngha.han',
    tagline: 'AI powered 노트 · 지식 관리',
    catchphrase: '输入一次，AI全搞定！',
    notice: '个人项目 | 错误反馈:',
    contact: 'syngha.han',
    orLoginWith: '快速登录',
  },
};

const languageLabels: Record<Language, string> = {
  ko: '한국어',
  en: 'English',
  cn: '中文',
};

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL || '';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, setUser, setIsLoading } = useAuthStore();
  const { language, setLanguage, theme, setTheme } = useSettingsStore();
  const t = translations[language];

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Check if already logged in
  useEffect(() => {
    const token = localStorage.getItem('once_token');
    if (token && user) {
      navigate('/home');
    }
  }, [user, navigate]);

  // Handle OAuth callback (?token= from redirect)
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      handleOAuthCallback(token);
    } else {
      checkExistingSession();
    }
  }, [searchParams]);

  const checkExistingSession = async () => {
    const token = localStorage.getItem('once_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await authApi.me();
      setUser(response.data);
      navigate('/home');
    } catch {
      localStorage.removeItem('once_token');
      setIsLoading(false);
    }
  };

  // OAuth 콜백 처리: Dashboard JWT를 받아 로컬 JWT로 교환
  const handleOAuthCallback = async (dashboardToken: string) => {
    setIsLoggingIn(true);
    try {
      // Dashboard JWT → ONCE 로컬 JWT 교환
      const exchangeResponse = await api.post('/auth/exchange', { dashboardToken });
      const localToken = exchangeResponse.data.token;
      localStorage.setItem('once_token', localToken);

      const response = await authApi.me();
      setUser(response.data);

      window.history.replaceState({}, '', window.location.pathname);
      navigate('/home');
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      localStorage.removeItem('once_token');
      showToast.error(
        error.response?.data?.error || 'OAuth 인증 처리 중 오류가 발생했습니다.'
      );
      setIsLoggingIn(false);
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  // OAuth 로그인 시작 (Dashboard에 위임)
  const handleOAuthLogin = (provider: 'naver' | 'kakao' | 'google') => {
    setIsLoggingIn(true);
    const redirectUrl = window.location.origin + window.location.pathname;
    if (DASHBOARD_URL) {
      window.location.href = `${DASHBOARD_URL}/api/auth/${provider}/login?redirect=${encodeURIComponent(redirectUrl)}`;
    } else {
      window.location.href = `${API_BASE_URL}/auth/${provider}/login?redirect=${encodeURIComponent(redirectUrl)}`;
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="min-h-screen bg-surface-primary flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 px-6 flex items-center justify-between z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-semibold text-content-primary">{t.title}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl hover:bg-surface-secondary transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <SunIcon className="w-5 h-5 text-content-secondary" />
            ) : (
              <MoonIcon className="w-5 h-5 text-content-secondary" />
            )}
          </button>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-surface-secondary transition-colors"
            >
              <GlobeAltIcon className="w-5 h-5 text-content-secondary" />
              <span className="text-sm text-content-secondary hidden sm:block">
                {languageLabels[language]}
              </span>
            </button>

            {showLangMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowLangMenu(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-40 bg-surface-primary rounded-xl border border-border-primary shadow-soft overflow-hidden z-50 animate-fadeIn">
                  {(['ko', 'en', 'cn'] as Language[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => {
                        setLanguage(lang);
                        setShowLangMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                        language === lang
                          ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                          : 'text-content-secondary hover:bg-surface-secondary'
                      }`}
                    >
                      {languageLabels[lang]}
                      {language === lang && <CheckIcon className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-6 pt-16">
        <div className="max-w-4xl w-full grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Hero content */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs font-medium mb-6 tracking-wide">
              <SparklesIcon className="w-4 h-4" />
              {t.tagline}
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold text-content-primary mb-3 leading-tight whitespace-pre-line">
              {t.subtitle}
            </h1>

            <p className="text-base font-semibold text-primary-500 dark:text-primary-400 mb-5 max-w-lg mx-auto lg:mx-0">
              {t.catchphrase}
            </p>

            <p className="text-lg text-content-secondary mb-8 max-w-lg mx-auto lg:mx-0">
              {t.description}
            </p>

            {/* Features */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="text-center lg:text-left">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 flex items-center justify-center mx-auto lg:mx-0 mb-2">
                  <span className="text-lg">✨</span>
                </div>
                <p className="text-sm font-medium text-content-primary">{t.feature1}</p>
                <p className="text-xs text-content-tertiary mt-0.5">{t.feature1Desc}</p>
              </div>
              <div className="text-center lg:text-left">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/30 dark:to-green-800/30 flex items-center justify-center mx-auto lg:mx-0 mb-2">
                  <span className="text-lg">🌍</span>
                </div>
                <p className="text-sm font-medium text-content-primary">{t.feature2}</p>
                <p className="text-xs text-content-tertiary mt-0.5">{t.feature2Desc}</p>
              </div>
              <div className="text-center lg:text-left">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30 flex items-center justify-center mx-auto lg:mx-0 mb-2">
                  <span className="text-lg">👥</span>
                </div>
                <p className="text-sm font-medium text-content-primary">{t.feature3}</p>
                <p className="text-xs text-content-tertiary mt-0.5">{t.feature3Desc}</p>
              </div>
            </div>

            {/* OAuth Login Buttons */}
            <div className="space-y-3 max-w-sm mx-auto lg:mx-0">
              <p className="text-sm text-content-tertiary text-center lg:text-left mb-2">
                {t.orLoginWith}
              </p>

              {/* Naver */}
              <button
                onClick={() => handleOAuthLogin('naver')}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-3 px-6 py-3.5
                           bg-[#03C75A] hover:bg-[#02b351] text-white
                           rounded-xl font-medium text-sm
                           shadow-sm hover:shadow-md
                           transition-all duration-200
                           disabled:opacity-60 disabled:pointer-events-none"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z"/>
                </svg>
                <span>Naver {t.loginWith}</span>
              </button>

              {/* Kakao */}
              <button
                onClick={() => handleOAuthLogin('kakao')}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-3 px-6 py-3.5
                           bg-[#FEE500] hover:bg-[#F5DC00] text-[#191919]
                           rounded-xl font-medium text-sm
                           shadow-sm hover:shadow-md
                           transition-all duration-200
                           disabled:opacity-60 disabled:pointer-events-none"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.726 1.8 5.127 4.5 6.49-.198.742-.716 2.69-.82 3.108-.127.51.187.503.393.366.162-.108 2.575-1.75 3.616-2.458.746.104 1.514.159 2.311.159 5.523 0 10-3.463 10-7.691C22 6.463 17.523 3 12 3z"/>
                </svg>
                <span>Kakao {t.loginWith}</span>
              </button>

              {/* Google */}
              <button
                onClick={() => handleOAuthLogin('google')}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-3 px-6 py-3.5
                           bg-white hover:bg-gray-50 text-gray-700
                           border border-gray-300
                           rounded-xl font-medium text-sm
                           shadow-sm hover:shadow-md
                           transition-all duration-200
                           disabled:opacity-60 disabled:pointer-events-none
                           dark:bg-surface-secondary dark:hover:bg-surface-tertiary dark:text-content-primary dark:border-border-primary"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Google {t.loginWith}</span>
              </button>

              {isLoggingIn && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <div className="w-4 h-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
                  <span className="text-sm text-content-secondary">{t.loggingIn}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Illustration */}
          <div className="hidden lg:block">
            <div className="relative">
              {/* Background decoration */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary-100 to-accent-purple/20 dark:from-primary-900/30 dark:to-accent-purple/10 rounded-3xl transform rotate-3" />

              {/* Card mockup */}
              <div className="relative bg-surface-primary rounded-2xl shadow-soft border border-border-primary p-6 transform -rotate-2 hover:rotate-0 transition-transform duration-500">
                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>

                {/* Content preview */}
                <div className="space-y-3">
                  <div className="h-6 bg-surface-secondary rounded-lg w-3/4" />
                  <div className="h-4 bg-surface-tertiary rounded w-full" />
                  <div className="h-4 bg-surface-tertiary rounded w-5/6" />
                  <div className="h-4 bg-surface-tertiary rounded w-4/5" />

                  <div className="pt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-amber-200 dark:bg-amber-800 rounded" />
                      <div className="h-4 bg-surface-secondary rounded w-1/3" />
                    </div>
                    <div className="pl-6 space-y-1.5">
                      <div className="h-3 bg-surface-tertiary rounded w-2/3" />
                      <div className="h-3 bg-surface-tertiary rounded w-1/2" />
                    </div>
                  </div>

                  <div className="pt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-blue-200 dark:bg-blue-800 rounded" />
                      <div className="h-4 bg-surface-secondary rounded w-1/4" />
                    </div>
                    <div className="pl-6 space-y-1.5">
                      <div className="h-3 bg-surface-tertiary rounded w-3/4" />
                      <div className="h-3 bg-surface-tertiary rounded w-1/2" />
                    </div>
                  </div>
                </div>

                {/* AI badge */}
                <div className="absolute -bottom-3 -right-3 px-3 py-1.5 bg-gradient-to-r from-primary-500 to-accent-purple rounded-full text-white text-xs font-medium shadow-glow flex items-center gap-1.5">
                  <SparklesIcon className="w-3.5 h-3.5" />
                  AI Generated
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center space-y-1">
        <p className="text-xs text-content-quaternary/60">{t.tagline}</p>
        <p className="text-sm text-content-quaternary">{t.copyright}</p>
        <p className="text-[10px] text-content-quaternary/40">
          {t.notice}{' '}
          {t.contact}
        </p>
      </footer>
    </div>
  );
}
