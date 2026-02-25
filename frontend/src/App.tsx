import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/services/api';
import Layout from '@/components/layout/Layout';
import Login from '@/pages/Login';
import Home from '@/pages/Home';
import Note from '@/pages/Note';
import Search from '@/pages/Search';
import Trash from '@/pages/Trash';
import Settings from '@/pages/Settings';
import Admin from '@/pages/Admin';


function App() {
  const { user, setUser, isLoading, setIsLoading } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('once_token');
      if (!token) {
        setReady(true);
        setIsLoading(false);
        return;
      }

      const response = await authApi.me();
      setUser(response.data);
    } catch {
      localStorage.removeItem('once_token');
    } finally {
      setReady(true);
      setIsLoading(false);
    }
  };

  // 초기 로딩 스플래시
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          {/* Animated Logo */}
          <div className="relative mb-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-glow animate-pulse-soft">
              <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>

          {/* Loading text */}
          <h1 className="text-xl font-semibold text-content-primary dark:text-content-primary-dark mb-2">
            ONCE
          </h1>
          <p className="text-sm text-content-secondary dark:text-content-secondary-dark">
            로딩 중...
          </p>

          {/* Loading indicator */}
          <div className="mt-6 flex items-center justify-center gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-primary-500 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 로그인되지 않은 경우
  if (!user) {
    return <Login />;
  }

  // 메인 앱
  return (
    <Layout>
      <Routes>
        {/* Main pages */}
        <Route path="/home" element={<Home />} />
        <Route path="/note/:fileId" element={<Note />} />
        <Route path="/search" element={<Search />} />
        <Route path="/trash" element={<Trash />} />
        <Route path="/settings" element={<Settings />} />

        {/* Admin pages */}
        {(user.isSuperAdmin || user.isTeamAdmin) && <Route path="/admin" element={<Admin />} />}

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
