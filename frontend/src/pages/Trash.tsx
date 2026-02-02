import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSpaceStore } from '../stores/spaceStore';
import { useSettingsStore } from '../stores/settingsStore';
import { trashApi } from '../services/api';
import { showToast } from '../components/common/Toast';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import {
  TrashIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const translations = {
  ko: {
    title: '휴지통',
    description: '삭제된 항목은 30일 후 자동으로 영구 삭제됩니다',
    empty: '휴지통이 비어있습니다',
    emptyDesc: '삭제된 노트가 여기에 표시됩니다',
    restore: '복원',
    delete: '영구 삭제',
    emptyTrash: '휴지통 비우기',
    emptyTrashConfirm: '휴지통의 모든 항목을 영구 삭제하시겠습니까?',
    emptyTrashWarning: '이 작업은 되돌릴 수 없습니다.',
    cancel: '취소',
    confirm: '삭제',
    restoreSuccess: '복원되었습니다',
    deleteSuccess: '영구 삭제되었습니다',
    emptySuccess: '휴지통을 비웠습니다',
    deletedAt: '삭제일',
    expiresIn: '만료',
    days: '일 후',
    selectAll: '전체 선택',
    selected: '개 선택됨',
  },
  en: {
    title: 'Trash',
    description: 'Deleted items will be permanently removed after 30 days',
    empty: 'Trash is empty',
    emptyDesc: 'Deleted notes will appear here',
    restore: 'Restore',
    delete: 'Delete permanently',
    emptyTrash: 'Empty trash',
    emptyTrashConfirm: 'Permanently delete all items in trash?',
    emptyTrashWarning: 'This action cannot be undone.',
    cancel: 'Cancel',
    confirm: 'Delete',
    restoreSuccess: 'Restored successfully',
    deleteSuccess: 'Deleted permanently',
    emptySuccess: 'Trash emptied',
    deletedAt: 'Deleted',
    expiresIn: 'Expires in',
    days: ' days',
    selectAll: 'Select all',
    selected: ' selected',
  },
  cn: {
    title: '回收站',
    description: '删除的项目将在30天后自动永久删除',
    empty: '回收站为空',
    emptyDesc: '已删除的笔记将显示在这里',
    restore: '恢复',
    delete: '永久删除',
    emptyTrash: '清空回收站',
    emptyTrashConfirm: '永久删除回收站中的所有项目？',
    emptyTrashWarning: '此操作无法撤销。',
    cancel: '取消',
    confirm: '删除',
    restoreSuccess: '恢复成功',
    deleteSuccess: '已永久删除',
    emptySuccess: '回收站已清空',
    deletedAt: '删除于',
    expiresIn: '将在',
    days: '天后过期',
    selectAll: '全选',
    selected: '已选择',
  },
};

interface TrashItem {
  id: string;
  name: string;
  path: string;
  deletedAt: string;
  expiresAt: string;
}

export default function Trash() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { activeTab, refresh } = useSpaceStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  const [items, setItems] = useState<TrashItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showEmptyModal, setShowEmptyModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const personalSpaceId = user?.spaces?.personalSpaceId;
  const teamSpaceId = user?.spaces?.teamSpaceId;
  const currentSpaceId = activeTab === 'personal' ? personalSpaceId : teamSpaceId;

  useEffect(() => {
    if (currentSpaceId) {
      loadTrash();
    }
  }, [currentSpaceId]);

  const loadTrash = async () => {
    if (!currentSpaceId) return;

    setIsLoading(true);
    try {
      const response = await trashApi.list(currentSpaceId);
      setItems(response.data.files || []);
    } catch (error) {
      console.error('Failed to load trash:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (itemId: string) => {
    try {
      await trashApi.restore(itemId);
      showToast.success(t.restoreSuccess);
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      refresh();
    } catch (error) {
      console.error('Restore failed:', error);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await trashApi.permanentDelete(itemId);
      showToast.success(t.deleteSuccess);
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleEmptyTrash = async () => {
    if (!currentSpaceId) return;

    setIsProcessing(true);
    try {
      await trashApi.empty(currentSpaceId);
      showToast.success(t.emptySuccess);
      setItems([]);
      setSelectedIds(new Set());
      setShowEmptyModal(false);
    } catch (error) {
      console.error('Empty trash failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkRestore = async () => {
    setIsProcessing(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => trashApi.restore(id)));
      showToast.success(t.restoreSuccess);
      setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
      refresh();
    } catch (error) {
      console.error('Bulk restore failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    setIsProcessing(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => trashApi.permanentDelete(id)));
      showToast.success(t.deleteSuccess);
      setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Bulk delete failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((item) => item.id)));
    }
  };

  const getDaysRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    return Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / 86400000));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (language === 'ko') {
      return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' });
    } else if (language === 'en') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' });
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-content-primary mb-1">
            {t.title}
          </h1>
          <p className="text-content-tertiary text-sm">{t.description}</p>
        </div>

        {items.length > 0 && (
          <button
            onClick={() => setShowEmptyModal(true)}
            className="btn-ghost text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <TrashIcon className="w-4 h-4" />
            {t.emptyTrash}
          </button>
        )}
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="card p-3 mb-4 flex items-center justify-between animate-slideUp">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                selectedIds.size === items.length
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : 'border-border-secondary'
              }`}
            >
              {selectedIds.size === items.length && <CheckIcon className="w-3 h-3" />}
            </button>
            <span className="text-sm text-content-secondary">
              {selectedIds.size}
              {t.selected}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleBulkRestore}
              disabled={isProcessing}
              className="btn-ghost text-sm"
            >
              <ArrowPathIcon className="w-4 h-4" />
              {t.restore}
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isProcessing}
              className="btn-ghost text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm"
            >
              <TrashIcon className="w-4 h-4" />
              {t.delete}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="card">
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton w-5 h-5 rounded" />
                <div className="skeleton w-10 h-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/3 rounded" />
                  <div className="skeleton h-3 w-1/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : items.length > 0 ? (
        <div className="card divide-y divide-border-primary">
          {/* Select all header */}
          <div className="px-4 py-3 bg-surface-secondary/50 flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                selectedIds.size === items.length
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : 'border-border-secondary hover:border-border-primary'
              }`}
            >
              {selectedIds.size === items.length && <CheckIcon className="w-3 h-3" />}
            </button>
            <span className="text-sm text-content-secondary">{t.selectAll}</span>
          </div>

          {/* Items */}
          {items.map((item) => {
            const daysRemaining = getDaysRemaining(item.expiresAt);
            const isSelected = selectedIds.has(item.id);

            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                  isSelected ? 'bg-primary-50 dark:bg-primary-900/10' : 'hover:bg-surface-secondary'
                }`}
              >
                <button
                  onClick={() => toggleSelect(item.id)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-primary-500 border-primary-500 text-white'
                      : 'border-border-secondary hover:border-border-primary'
                  }`}
                >
                  {isSelected && <CheckIcon className="w-3 h-3" />}
                </button>

                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-100 dark:bg-blue-900/30">
                  <DocumentTextIcon className="w-5 h-5 text-blue-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-content-primary truncate">{item.name}</p>
                  <p className="text-sm text-content-tertiary truncate">{item.path}</p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-content-quaternary">
                      {t.deletedAt}: {formatDate(item.deletedAt)}
                    </p>
                    <p
                      className={`text-xs ${
                        daysRemaining <= 7 ? 'text-red-500' : 'text-content-quaternary'
                      }`}
                    >
                      {t.expiresIn} {daysRemaining}
                      {t.days}
                    </p>
                  </div>

                  <div className="flex gap-1">
                    <button
                      onClick={() => handleRestore(item.id)}
                      className="p-2 rounded-lg hover:bg-surface-tertiary text-content-tertiary hover:text-content-secondary transition-colors"
                      title={t.restore}
                    >
                      <ArrowPathIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-content-tertiary hover:text-red-500 transition-colors"
                      title={t.delete}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="trash" title={t.empty} description={t.emptyDesc} />
        </div>
      )}

      {/* Empty trash modal */}
      <Modal
        isOpen={showEmptyModal}
        onClose={() => setShowEmptyModal(false)}
        title={t.emptyTrash}
      >
        <Modal.Body>
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-content-primary mb-2">{t.emptyTrashConfirm}</p>
              <p className="text-sm text-content-tertiary">{t.emptyTrashWarning}</p>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            onClick={() => setShowEmptyModal(false)}
            disabled={isProcessing}
            className="btn-ghost"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleEmptyTrash}
            disabled={isProcessing}
            className="btn-primary bg-red-500 hover:bg-red-600"
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              t.confirm
            )}
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
