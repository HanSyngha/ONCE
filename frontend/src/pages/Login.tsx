import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore, Language } from '../stores/settingsStore';
import { authApi } from '../services/api';
import { showToast } from '../components/common/Toast';
import {
  SparklesIcon,
  ArrowRightIcon,
  SunIcon,
  MoonIcon,
  GlobeAltIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const translations = {
  ko: {
    title: 'AIPO',
    subtitle: '작성하기 귀찮을 때 쓰는 지식 공유 서비스',
    description:
      '아무거나 입력하면 AI가 자동으로 정리해드립니다. 회의록, 아이디어, 메모, 뭐든지 괜찮아요.',
    login: 'SSO 로그인',
    loggingIn: '로그인 중...',
    feature1: '자동 정리',
    feature1Desc: '입력한 내용을 AI가 구조화',
    feature2: '다국어 지원',
    feature2Desc: '한국어, 영어, 중국어 자동 번역',
    feature3: '팀 협업',
    feature3Desc: '팀 공간에서 함께 공유',
    copyright: '© 2026 AIPO for Web. Developed by syngha.han',
  },
  en: {
    title: 'AIPO',
    subtitle: 'Knowledge sharing for the lazy writer',
    description:
      'Just type anything and AI will organize it for you. Meeting notes, ideas, memos - anything works.',
    login: 'SSO Login',
    loggingIn: 'Logging in...',
    feature1: 'Auto-organize',
    feature1Desc: 'AI structures your content',
    feature2: 'Multi-language',
    feature2Desc: 'Korean, English, Chinese translation',
    feature3: 'Team Collaboration',
    feature3Desc: 'Share in team spaces',
    copyright: '© 2026 AIPO for Web. Developed by syngha.han',
  },
  cn: {
    title: 'AIPO',
    subtitle: '懒人专用知识共享服务',
    description:
      '随意输入，AI 自动整理。会议记录、创意、备忘录，什么都可以。',
    login: 'SSO 登录',
    loggingIn: '登录中...',
    feature1: '自动整理',
    feature1Desc: 'AI 结构化您的内容',
    feature2: '多语言支持',
    feature2Desc: '韩语、英语、中文自动翻译',
    feature3: '团队协作',
    feature3Desc: '在团队空间中共享',
    copyright: '© 2024 AIPO. 保留所有权利。',
  },
};

const languageLabels: Record<Language, string> = {
  ko: '한국어',
  en: 'English',
  cn: '中文',
};

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
    const token = localStorage.getItem('aipo_token');
    if (token && user) {
      navigate('/home');
    }
  }, [user, navigate]);

  // Handle SSO callback (Dashboard와 동일한 플로우)
  useEffect(() => {
    const data = searchParams.get('data');
    if (data) {
      handleSSOCallback(data);
    } else {
      checkExistingSession();
    }
  }, [searchParams]);

  const checkExistingSession = async () => {
    const token = localStorage.getItem('aipo_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await authApi.me();
      setUser(response.data);
      navigate('/home');
    } catch {
      localStorage.removeItem('aipo_token');
      setIsLoading(false);
    }
  };

  // SSO 콜백 처리 (Dashboard와 동일)
  const handleSSOCallback = async (dataString: string) => {
    setIsLoggingIn(true);
    try {
      // Parse SSO data
      const decodedData = decodeURIComponent(dataString);
      const ssoData = JSON.parse(decodedData);

      // Generate sso token (Unicode-safe base64 encoding)
      const jsonData = JSON.stringify({
        loginid: ssoData.loginid,
        username: ssoData.username,
        deptname: ssoData.deptname || '',
        timestamp: Date.now(),
      });
      const ssoToken = btoa(unescape(encodeURIComponent(jsonData)));

      // Exchange SSO data for session token
      const response = await authApi.login(`sso.${ssoToken}`);
      const { user, sessionToken } = response.data;

      localStorage.setItem('aipo_token', sessionToken);
      setUser(user);

      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
      navigate('/home');
    } catch (error: any) {
      console.error('SSO callback error:', error);
      showToast.error(
        error.response?.data?.error || 'SSO 인증 처리 중 오류가 발생했습니다.'
      );
      setIsLoggingIn(false);
      // Clear URL params on error too
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleLogin = () => {
    // SSO redirect (Dashboard와 동일)
    const SSO_BASE_URL = import.meta.env.VITE_SSO_URL || 'https://genai.samsungds.net:36810';
    const redirectUrl = window.location.origin + window.location.pathname;
    const ssoUrl = new URL('/direct_sso', SSO_BASE_URL);
    ssoUrl.searchParams.set('redirect_url', redirectUrl);
    window.location.href = ssoUrl.toString();
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
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-sm font-medium mb-6">
              <SparklesIcon className="w-4 h-4" />
              AI-Powered
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold text-content-primary mb-4 leading-tight">
              {t.subtitle}
            </h1>

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

            {/* Login button */}
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="group relative inline-flex items-center justify-center gap-3
                         px-10 py-4 text-base font-semibold text-white
                         bg-gradient-to-r from-primary-600 via-primary-500 to-accent-purple
                         rounded-2xl shadow-lg shadow-primary-500/25
                         hover:shadow-xl hover:shadow-primary-500/30 hover:scale-[1.02]
                         active:scale-[0.98]
                         transition-all duration-200 ease-out
                         disabled:opacity-60 disabled:pointer-events-none
                         mx-auto lg:mx-0
                         overflow-hidden"
            >
              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent
                              translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />

              {isLoggingIn ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{t.loggingIn}</span>
                </>
              ) : (
                <>
                  <span>{t.login}</span>
                  <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                </>
              )}
            </button>
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
      <footer className="py-6 text-center">
        <p className="text-sm text-content-quaternary">{t.copyright}</p>
      </footer>
    </div>
  );
}
