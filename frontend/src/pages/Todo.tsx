import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { todosApi } from '../services/api';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';

const translations = {
  ko: {
    title: 'Todo',
    week: '주',
    month: '월',
    year: '년',
    empty: '등록된 Todo가 없습니다',
    emptyDesc: '메모를 입력하면 AI가 자동으로 할일을 추출합니다',
    today: '오늘',
    completed: '완료',
    incomplete: '미완료',
  },
  en: {
    title: 'Todo',
    week: 'Week',
    month: 'Month',
    year: 'Year',
    empty: 'No todos yet',
    emptyDesc: 'AI will automatically extract action items from your notes',
    today: 'Today',
    completed: 'Completed',
    incomplete: 'Incomplete',
  },
  cn: {
    title: '待办事项',
    week: '周',
    month: '月',
    year: '年',
    empty: '暂无待办事项',
    emptyDesc: 'AI会自动从笔记中提取待办事项',
    today: '今天',
    completed: '已完成',
    incomplete: '未完成',
  },
};

type ViewMode = 'week' | 'month' | 'year';

interface TodoItem {
  id: string;
  title: string;
  content: string | null;
  startDate: string;
  endDate: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
}

function formatDateRange(start: string, end: string, language: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const locale = language === 'ko' ? 'ko-KR' : language === 'cn' ? 'zh-CN' : 'en-US';
  const sStr = s.toLocaleDateString(locale, opts);
  const eStr = e.toLocaleDateString(locale, opts);
  if (sStr === eStr) return sStr;
  return `${sStr} ~ ${eStr}`;
}

function getViewLabel(view: ViewMode, date: Date, language: string): string {
  const locale = language === 'ko' ? 'ko-KR' : language === 'cn' ? 'zh-CN' : 'en-US';

  if (view === 'week') {
    const day = date.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const start = new Date(date);
    start.setDate(date.getDate() + diffToMon);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString(locale, opts)} — ${end.toLocaleDateString(locale, opts)}`;
  }

  if (view === 'month') {
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  }

  return date.toLocaleDateString(locale, { year: 'numeric' });
}

function navigateDate(date: Date, view: ViewMode, direction: number): Date {
  const d = new Date(date);
  if (view === 'week') d.setDate(d.getDate() + direction * 7);
  else if (view === 'month') d.setMonth(d.getMonth() + direction);
  else d.setFullYear(d.getFullYear() + direction);
  return d;
}

export default function Todo() {
  const { user } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const spaceId = user?.spaces?.personalSpaceId;

  const loadTodos = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const dateStr = currentDate.toISOString().split('T')[0];
      const res = await todosApi.list(spaceId, view, dateStr);
      setTodos(res.data.todos || []);
    } catch (error) {
      console.error('Failed to load todos:', error);
      setTodos([]);
    } finally {
      setLoading(false);
    }
  }, [spaceId, view, currentDate]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  const handleToggleComplete = async (todo: TodoItem) => {
    try {
      await todosApi.update(todo.id, { completed: !todo.completed });
      // 즉시 UI 업데이트
      setTodos(prev =>
        prev.map(t =>
          t.id === todo.id
            ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : null }
            : t
        )
      );
    } catch (error) {
      console.error('Failed to toggle todo:', error);
    }
  };

  const handleGoToday = () => setCurrentDate(new Date());
  const handlePrev = () => setCurrentDate(prev => navigateDate(prev, view, -1));
  const handleNext = () => setCurrentDate(prev => navigateDate(prev, view, 1));

  const incompleteTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
          <ClipboardDocumentListIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <h1 className="text-2xl font-bold text-content-primary">{t.title}</h1>
      </div>

      {/* View mode + Navigation */}
      <div className="flex items-center justify-between mb-6 bg-surface-secondary rounded-xl p-2">
        {/* View switcher */}
        <div className="flex gap-1">
          {(['week', 'month', 'year'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                view === v
                  ? 'bg-surface-primary text-content-primary shadow-sm'
                  : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              {t[v]}
            </button>
          ))}
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleGoToday}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/20 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            {t.today}
          </button>
          <button
            onClick={handlePrev}
            className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors"
          >
            <ChevronLeftIcon className="w-4 h-4 text-content-secondary" />
          </button>
          <span className="text-sm font-medium text-content-primary min-w-[160px] text-center">
            {getViewLabel(view, currentDate, language)}
          </span>
          <button
            onClick={handleNext}
            className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors"
          >
            <ChevronRightIcon className="w-4 h-4 text-content-secondary" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : todos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-secondary flex items-center justify-center mb-4">
            <CalendarDaysIcon className="w-8 h-8 text-content-quaternary" />
          </div>
          <p className="text-content-secondary font-medium mb-1">{t.empty}</p>
          <p className="text-content-tertiary text-sm">{t.emptyDesc}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Incomplete */}
          {incompleteTodos.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-content-tertiary uppercase tracking-wider mb-3">
                {t.incomplete} ({incompleteTodos.length})
              </h3>
              <div className="space-y-2">
                {incompleteTodos.map(todo => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    language={language}
                    onToggle={handleToggleComplete}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completedTodos.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-content-tertiary uppercase tracking-wider mb-3">
                {t.completed} ({completedTodos.length})
              </h3>
              <div className="space-y-2">
                {completedTodos.map(todo => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    language={language}
                    onToggle={handleToggleComplete}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TodoRow({
  todo,
  language,
  onToggle,
}: {
  todo: TodoItem;
  language: string;
  onToggle: (todo: TodoItem) => void;
}) {
  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
        todo.completed
          ? 'bg-surface-secondary/50 border-border-secondary'
          : 'bg-surface-primary border-border-primary hover:border-primary-300 dark:hover:border-primary-700'
      }`}
    >
      <button
        onClick={() => onToggle(todo)}
        className="mt-0.5 flex-shrink-0 transition-transform hover:scale-110"
      >
        {todo.completed ? (
          <CheckCircleSolidIcon className="w-5 h-5 text-green-500" />
        ) : (
          <CheckCircleIcon className="w-5 h-5 text-content-quaternary hover:text-primary-500" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium ${
            todo.completed
              ? 'text-content-tertiary line-through'
              : 'text-content-primary'
          }`}
        >
          {todo.title}
        </p>
        {todo.content && (
          <p className="text-xs text-content-tertiary mt-0.5 truncate">
            {todo.content}
          </p>
        )}
        <p className="text-xs text-content-quaternary mt-1">
          {formatDateRange(todo.startDate, todo.endDate, language)}
        </p>
      </div>
    </div>
  );
}
