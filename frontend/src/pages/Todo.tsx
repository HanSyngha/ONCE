import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { todosApi } from '../services/api';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  CalendarDaysIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
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
    save: '저장',
    cancel: '취소',
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
    save: 'Save',
    cancel: 'Cancel',
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
    save: '保存',
    cancel: '取消',
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

// ─── Date helpers ───

function getViewLabel(view: ViewMode, date: Date, language: string): string {
  const locale = language === 'ko' ? 'ko-KR' : language === 'cn' ? 'zh-CN' : 'en-US';
  if (view === 'week') {
    const { start, end } = getWeekRange(date);
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

function getWeekRange(date: Date) {
  const day = date.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diffToMon);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function getMonthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
}

function getYearRange(date: Date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const end = new Date(date.getFullYear(), 11, 31);
  return { start, end };
}

function getTimelineRange(view: ViewMode, date: Date) {
  if (view === 'week') return getWeekRange(date);
  if (view === 'month') return getMonthRange(date);
  return getYearRange(date);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatShortDate(d: Date, language: string): string {
  const locale = language === 'ko' ? 'ko-KR' : language === 'cn' ? 'zh-CN' : 'en-US';
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

// ─── Timeline column labels ───

function getTimelineColumns(view: ViewMode, date: Date, language: string): { label: string; date: Date }[] {
  const { start, end } = getTimelineRange(view, date);
  const cols: { label: string; date: Date }[] = [];
  const locale = language === 'ko' ? 'ko-KR' : language === 'cn' ? 'zh-CN' : 'en-US';

  if (view === 'week') {
    const d = new Date(start);
    while (d <= end) {
      cols.push({
        label: d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' }),
        date: new Date(d),
      });
      d.setDate(d.getDate() + 1);
    }
  } else if (view === 'month') {
    const d = new Date(start);
    while (d <= end) {
      cols.push({
        label: `${d.getDate()}`,
        date: new Date(d),
      });
      d.setDate(d.getDate() + 1);
    }
  } else {
    // year → 12 months
    for (let m = 0; m < 12; m++) {
      const md = new Date(date.getFullYear(), m, 1);
      cols.push({
        label: md.toLocaleDateString(locale, { month: 'short' }),
        date: md,
      });
    }
  }
  return cols;
}

// ─── Bar position calc ───

function getBarStyle(
  todo: TodoItem,
  view: ViewMode,
  date: Date
): { left: string; width: string } | null {
  const { start: tlStart, end: tlEnd } = getTimelineRange(view, date);
  const totalDays = daysBetween(tlStart, tlEnd) + 1;

  const todoStart = new Date(todo.startDate);
  const todoEnd = new Date(todo.endDate);
  todoStart.setHours(0, 0, 0, 0);
  todoEnd.setHours(0, 0, 0, 0);

  // 범위 밖이면 null
  if (todoEnd < tlStart || todoStart > tlEnd) return null;

  const clampedStart = todoStart < tlStart ? tlStart : todoStart;
  const clampedEnd = todoEnd > tlEnd ? tlEnd : todoEnd;

  const offsetDays = daysBetween(tlStart, clampedStart);
  const spanDays = daysBetween(clampedStart, clampedEnd) + 1;

  const left = (offsetDays / totalDays) * 100;
  const width = (spanDays / totalDays) * 100;

  return {
    left: `${left}%`,
    width: `${Math.max(width, 100 / totalDays)}%`, // 최소 1칸
  };
}

// ─── Colors for bars ───
const BAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-indigo-500',
];

// ─── Main Component ───

export default function Todo() {
  const { user } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const handleUpdate = async (todoId: string, data: { title?: string; startDate?: string; endDate?: string }) => {
    try {
      await todosApi.update(todoId, data);
      setTodos(prev =>
        prev.map(t => (t.id === todoId ? { ...t, ...data } : t))
      );
      setEditingId(null);
    } catch (error) {
      console.error('Failed to update todo:', error);
    }
  };

  const handleGoToday = () => setCurrentDate(new Date());
  const handlePrev = () => setCurrentDate(prev => navigateDate(prev, view, -1));
  const handleNext = () => setCurrentDate(prev => navigateDate(prev, view, 1));

  const columns = getTimelineColumns(view, currentDate, language);
  const { start: tlStart, end: tlEnd } = getTimelineRange(view, currentDate);
  const totalDays = daysBetween(tlStart, tlEnd) + 1;

  // Today marker position
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = today >= tlStart && today <= tlEnd
    ? (daysBetween(tlStart, today) / totalDays) * 100
    : null;

  const incompleteTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
          <ClipboardDocumentListIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <h1 className="text-2xl font-bold text-content-primary">{t.title}</h1>
      </div>

      {/* View mode + Navigation */}
      <div className="flex items-center justify-between mb-6 bg-surface-secondary rounded-xl p-2">
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

        <div className="flex items-center gap-2">
          <button
            onClick={handleGoToday}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/20 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            {t.today}
          </button>
          <button onClick={handlePrev} className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors">
            <ChevronLeftIcon className="w-4 h-4 text-content-secondary" />
          </button>
          <span className="text-sm font-medium text-content-primary min-w-[160px] text-center">
            {getViewLabel(view, currentDate, language)}
          </span>
          <button onClick={handleNext} className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors">
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
        <div className="space-y-8">
          {/* Gantt Chart */}
          <div className="bg-surface-primary border border-border-primary rounded-xl overflow-hidden">
            {/* Timeline header */}
            <div className="relative border-b border-border-primary">
              <div className="flex">
                {/* Label column */}
                <div className="w-56 flex-shrink-0 px-4 py-2 text-xs font-semibold text-content-tertiary uppercase tracking-wider border-r border-border-primary">
                  {t.title}
                </div>
                {/* Timeline columns */}
                <div className="flex-1 flex relative">
                  {columns.map((col, i) => {
                    const isToday = todayOffset !== null &&
                      col.date.toDateString() === today.toDateString();
                    return (
                      <div
                        key={i}
                        className={`flex-1 text-center py-2 text-xs border-r border-border-secondary last:border-r-0 ${
                          isToday
                            ? 'bg-primary-50 dark:bg-primary-900/20 font-bold text-primary-600 dark:text-primary-400'
                            : 'text-content-quaternary'
                        }`}
                      >
                        {col.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Incomplete section */}
            {incompleteTodos.length > 0 && (
              <div>
                <div className="px-4 py-1.5 bg-surface-secondary/50 border-b border-border-secondary">
                  <span className="text-xs font-semibold text-content-tertiary uppercase tracking-wider">
                    {t.incomplete} ({incompleteTodos.length})
                  </span>
                </div>
                {incompleteTodos.map((todo, idx) => (
                  <GanttRow
                    key={todo.id}
                    todo={todo}
                    colorClass={BAR_COLORS[idx % BAR_COLORS.length]}
                    view={view}
                    currentDate={currentDate}
                    columns={columns}
                    todayOffset={todayOffset}
                    language={language}
                    isEditing={editingId === todo.id}
                    onStartEdit={() => setEditingId(todo.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onToggle={handleToggleComplete}
                    onUpdate={handleUpdate}
                    t={t}
                  />
                ))}
              </div>
            )}

            {/* Completed section */}
            {completedTodos.length > 0 && (
              <div>
                <div className="px-4 py-1.5 bg-surface-secondary/50 border-b border-border-secondary border-t border-t-border-primary">
                  <span className="text-xs font-semibold text-content-tertiary uppercase tracking-wider">
                    {t.completed} ({completedTodos.length})
                  </span>
                </div>
                {completedTodos.map((todo, idx) => (
                  <GanttRow
                    key={todo.id}
                    todo={todo}
                    colorClass="bg-gray-400"
                    view={view}
                    currentDate={currentDate}
                    columns={columns}
                    todayOffset={todayOffset}
                    language={language}
                    isEditing={editingId === todo.id}
                    onStartEdit={() => setEditingId(todo.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onToggle={handleToggleComplete}
                    onUpdate={handleUpdate}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gantt Row ───

function GanttRow({
  todo,
  colorClass,
  view,
  currentDate,
  columns,
  todayOffset,
  language,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onToggle,
  onUpdate,
  t,
}: {
  todo: TodoItem;
  colorClass: string;
  view: ViewMode;
  currentDate: Date;
  columns: { label: string; date: Date }[];
  todayOffset: number | null;
  language: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onToggle: (todo: TodoItem) => void;
  onUpdate: (id: string, data: { title?: string; startDate?: string; endDate?: string }) => void;
  t: Record<string, string>;
}) {
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editStart, setEditStart] = useState(todo.startDate.split('T')[0]);
  const [editEnd, setEditEnd] = useState(todo.endDate.split('T')[0]);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditTitle(todo.title);
    setEditStart(todo.startDate.split('T')[0]);
    setEditEnd(todo.endDate.split('T')[0]);
  }, [todo]);

  const barStyle = getBarStyle(todo, view, currentDate);

  const handleSave = () => {
    const updates: { title?: string; startDate?: string; endDate?: string } = {};
    if (editTitle !== todo.title) updates.title = editTitle;
    if (editStart !== todo.startDate.split('T')[0]) updates.startDate = editStart;
    if (editEnd !== todo.endDate.split('T')[0]) updates.endDate = editEnd;
    if (Object.keys(updates).length > 0) {
      onUpdate(todo.id, updates);
    } else {
      onCancelEdit();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onCancelEdit();
  };

  return (
    <div className="flex border-b border-border-secondary last:border-b-0 group hover:bg-surface-secondary/30 transition-colors">
      {/* Label column */}
      <div className="w-56 flex-shrink-0 px-3 py-2.5 border-r border-border-secondary flex items-center gap-2">
        <button
          onClick={() => onToggle(todo)}
          className="flex-shrink-0 transition-transform hover:scale-110"
        >
          {todo.completed ? (
            <CheckCircleSolidIcon className="w-4.5 h-4.5 text-green-500" />
          ) : (
            <div className={`w-4 h-4 rounded-full border-2 border-current ${colorClass.replace('bg-', 'text-')}`} />
          )}
        </button>

        {isEditing ? (
          <div className="flex-1 min-w-0 space-y-1.5">
            <input
              ref={titleInputRef}
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full text-sm px-1.5 py-0.5 rounded border border-border-primary bg-surface-primary text-content-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <div className="flex gap-1">
              <input
                type="date"
                value={editStart}
                onChange={e => setEditStart(e.target.value)}
                className="text-xs px-1 py-0.5 rounded border border-border-primary bg-surface-primary text-content-secondary w-[110px]"
              />
              <span className="text-xs text-content-quaternary self-center">~</span>
              <input
                type="date"
                value={editEnd}
                onChange={e => setEditEnd(e.target.value)}
                className="text-xs px-1 py-0.5 rounded border border-border-primary bg-surface-primary text-content-secondary w-[110px]"
              />
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleSave}
                className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600"
              >
                <CheckIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex items-center gap-1">
            <span
              className={`text-sm truncate ${
                todo.completed ? 'text-content-tertiary line-through' : 'text-content-primary'
              }`}
              title={todo.title}
            >
              {todo.title}
            </span>
            <button
              onClick={onStartEdit}
              className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-secondary transition-all text-content-quaternary hover:text-content-secondary"
            >
              <PencilIcon className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Bar area */}
      <div className="flex-1 relative py-2">
        {/* Grid lines */}
        <div className="absolute inset-0 flex">
          {columns.map((_, i) => (
            <div key={i} className="flex-1 border-r border-border-secondary/50 last:border-r-0" />
          ))}
        </div>

        {/* Today line */}
        {todayOffset !== null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
            style={{ left: `${todayOffset}%` }}
          />
        )}

        {/* Bar */}
        {barStyle && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-md ${
              todo.completed ? 'bg-gray-300 dark:bg-gray-600' : colorClass
            } opacity-85 hover:opacity-100 transition-opacity cursor-default shadow-sm`}
            style={{ left: barStyle.left, width: barStyle.width }}
            title={`${todo.title}\n${formatShortDate(new Date(todo.startDate), language)} ~ ${formatShortDate(new Date(todo.endDate), language)}`}
          >
            <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white truncate">
              {todo.title}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
