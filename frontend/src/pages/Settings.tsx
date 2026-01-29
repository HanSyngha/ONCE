import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore, Language, Theme, NoteLanguage } from '../stores/settingsStore';
import { settingsApi } from '../services/api';
import { showToast } from '../components/common/Toast';
import {
  UserCircleIcon,
  GlobeAltIcon,
  PaintBrushIcon,
  DocumentTextIcon,
  BellIcon,
  ShieldCheckIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const translations = {
  ko: {
    title: '설정',
    profile: '프로필',
    name: '이름',
    department: '부서',
    loginId: '로그인 ID',
    businessUnit: '사업부',
    appearance: '외관',
    language: '인터페이스 언어',
    theme: '테마',
    noteLanguage: '기본 노트 언어',
    notifications: '알림',
    emailNotifications: '이메일 알림',
    emailNotificationsDesc: '히스토리 만료 알림을 이메일로 받습니다',
    saved: '설정이 저장되었습니다',
    save: '저장',
    light: '라이트',
    dark: '다크',
    system: '시스템',
    korean: '한국어',
    english: 'English',
    chinese: '中文',
  },
  en: {
    title: 'Settings',
    profile: 'Profile',
    name: 'Name',
    department: 'Department',
    loginId: 'Login ID',
    businessUnit: 'Business Unit',
    appearance: 'Appearance',
    language: 'Interface Language',
    theme: 'Theme',
    noteLanguage: 'Default Note Language',
    notifications: 'Notifications',
    emailNotifications: 'Email Notifications',
    emailNotificationsDesc: 'Receive history expiration alerts via email',
    saved: 'Settings saved',
    save: 'Save',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    korean: '한국어',
    english: 'English',
    chinese: '中文',
  },
  cn: {
    title: '设置',
    profile: '个人资料',
    name: '姓名',
    department: '部门',
    loginId: '登录 ID',
    businessUnit: '事业部',
    appearance: '外观',
    language: '界面语言',
    theme: '主题',
    noteLanguage: '默认笔记语言',
    notifications: '通知',
    emailNotifications: '邮件通知',
    emailNotificationsDesc: '通过邮件接收历史过期提醒',
    saved: '设置已保存',
    save: '保存',
    light: '浅色',
    dark: '深色',
    system: '系统',
    korean: '한국어',
    english: 'English',
    chinese: '中文',
  },
};

const languageOptions: Array<{ value: Language; label: Record<Language, string> }> = [
  { value: 'ko', label: { ko: '한국어', en: 'Korean', cn: '韩语' } },
  { value: 'en', label: { ko: 'English', en: 'English', cn: 'English' } },
  { value: 'cn', label: { ko: '中文', en: 'Chinese', cn: '中文' } },
];

const themeOptions: Array<{ value: Theme; labelKey: keyof typeof translations.ko }> = [
  { value: 'light', labelKey: 'light' },
  { value: 'dark', labelKey: 'dark' },
  { value: 'system', labelKey: 'system' },
];

const noteLanguageOptions: Array<{ value: NoteLanguage; label: string }> = [
  { value: 'KO', label: '한국어 (Korean)' },
  { value: 'EN', label: 'English' },
  { value: 'CN', label: '中文 (Chinese)' },
];

export default function Settings() {
  const { user } = useAuthStore();
  const { language, setLanguage, theme, setTheme, noteLanguage, setNoteLanguage } =
    useSettingsStore();
  const t = translations[language];

  const [emailNotifications, setEmailNotifications] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await settingsApi.update({
        language,
        theme,
      });
      showToast.success(t.saved);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-content-primary">{t.title}</h1>
      </div>

      <div className="space-y-6">
        {/* Profile Section */}
        <div className="card">
          <div className="px-6 py-4 border-b border-border-primary">
            <div className="flex items-center gap-3">
              <UserCircleIcon className="w-5 h-5 text-content-secondary" />
              <h2 className="font-semibold text-content-primary">{t.profile}</h2>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  {t.name}
                </label>
                <input
                  type="text"
                  value={user?.username || ''}
                  disabled
                  className="input w-full bg-surface-secondary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  {t.loginId}
                </label>
                <input
                  type="text"
                  value={user?.loginid || ''}
                  disabled
                  className="input w-full bg-surface-secondary"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  {t.department}
                </label>
                <input
                  type="text"
                  value={user?.deptname || ''}
                  disabled
                  className="input w-full bg-surface-secondary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  {t.businessUnit}
                </label>
                <input
                  type="text"
                  value={user?.businessUnit || ''}
                  disabled
                  className="input w-full bg-surface-secondary"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Appearance Section */}
        <div className="card">
          <div className="px-6 py-4 border-b border-border-primary">
            <div className="flex items-center gap-3">
              <PaintBrushIcon className="w-5 h-5 text-content-secondary" />
              <h2 className="font-semibold text-content-primary">{t.appearance}</h2>
            </div>
          </div>
          <div className="p-6 space-y-6">
            {/* Interface Language */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-3">
                <GlobeAltIcon className="w-4 h-4 inline-block mr-2" />
                {t.language}
              </label>
              <div className="flex gap-2">
                {languageOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setLanguage(option.value)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      language === option.value
                        ? 'border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'border-border-secondary text-content-secondary hover:border-border-primary'
                    }`}
                  >
                    {option.label[language]}
                    {language === option.value && (
                      <CheckIcon className="w-4 h-4 inline-block ml-2" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-3">
                {t.theme}
              </label>
              <div className="flex gap-2">
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      theme === option.value
                        ? 'border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'border-border-secondary text-content-secondary hover:border-border-primary'
                    }`}
                  >
                    {t[option.labelKey]}
                    {theme === option.value && (
                      <CheckIcon className="w-4 h-4 inline-block ml-2" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Note Language */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-3">
                <DocumentTextIcon className="w-4 h-4 inline-block mr-2" />
                {t.noteLanguage}
              </label>
              <div className="flex gap-2">
                {noteLanguageOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setNoteLanguage(option.value)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      noteLanguage === option.value
                        ? 'border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'border-border-secondary text-content-secondary hover:border-border-primary'
                    }`}
                  >
                    {option.value}
                    {noteLanguage === option.value && (
                      <CheckIcon className="w-4 h-4 inline-block ml-2" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="card">
          <div className="px-6 py-4 border-b border-border-primary">
            <div className="flex items-center gap-3">
              <BellIcon className="w-5 h-5 text-content-secondary" />
              <h2 className="font-semibold text-content-primary">{t.notifications}</h2>
            </div>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-content-primary">{t.emailNotifications}</p>
                <p className="text-sm text-content-tertiary">{t.emailNotificationsDesc}</p>
              </div>
              <button
                onClick={() => setEmailNotifications(!emailNotifications)}
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  emailNotifications ? 'bg-primary-500' : 'bg-surface-tertiary'
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    emailNotifications ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <CheckIcon className="w-4 h-4" />
            )}
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
