import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { commentsApi } from '../../services/api';
import { showToast } from '../common/Toast';
import {
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  EllipsisHorizontalIcon,
  PencilIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const translations = {
  ko: {
    title: '댓글',
    placeholder: '댓글을 입력하세요...',
    replyPlaceholder: '답글을 입력하세요...',
    reply: '답글',
    edit: '수정',
    delete: '삭제',
    cancel: '취소',
    save: '저장',
    empty: '아직 댓글이 없습니다',
    emptyDesc: '첫 번째 댓글을 남겨보세요',
    deleteConfirm: '정말 삭제하시겠습니까?',
    replyingTo: '답글 대상:',
    postError: '댓글 등록에 실패했습니다',
    updateError: '댓글 수정에 실패했습니다',
    deleteError: '댓글 삭제에 실패했습니다',
  },
  en: {
    title: 'Comments',
    placeholder: 'Write a comment...',
    replyPlaceholder: 'Write a reply...',
    reply: 'Reply',
    edit: 'Edit',
    delete: 'Delete',
    cancel: 'Cancel',
    save: 'Save',
    empty: 'No comments yet',
    emptyDesc: 'Be the first to comment',
    deleteConfirm: 'Are you sure you want to delete?',
    replyingTo: 'Replying to',
    postError: 'Failed to post comment',
    updateError: 'Failed to update comment',
    deleteError: 'Failed to delete comment',
  },
  cn: {
    title: '评论',
    placeholder: '写评论...',
    replyPlaceholder: '写回复...',
    reply: '回复',
    edit: '编辑',
    delete: '删除',
    cancel: '取消',
    save: '保存',
    empty: '暂无评论',
    emptyDesc: '成为第一个评论者',
    deleteConfirm: '确定要删除吗？',
    replyingTo: '回复给',
    postError: '评论发布失败',
    updateError: '评论修改失败',
    deleteError: '评论删除失败',
  },
};

interface Comment {
  id: string;
  content: string;
  blockId: string | null;
  user: {
    id: string;
    username: string;
    loginid: string;
  };
  createdAt: string;
  updatedAt: string;
  replies?: Comment[];
}

interface CommentThreadProps {
  fileId: string;
  blockId?: string;
}

export default function CommentThread({ fileId, blockId }: CommentThreadProps) {
  const { user } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadComments();
  }, [fileId]);

  const loadComments = async () => {
    setIsLoading(true);
    try {
      const response = await commentsApi.getForFile(fileId);
      // API는 블록별 그룹화된 객체를 반환 { "blockId": [comments] }
      // 플랫 배열로 변환
      const grouped = response.data.comments || {};
      const flat = Object.values(grouped).flat() as Comment[];
      setComments(flat);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await commentsApi.create(fileId, blockId || '', newComment.trim(), replyTo || undefined);
      setNewComment('');
      setReplyTo(null);
      loadComments();
    } catch (error) {
      console.error('Failed to create comment:', error);
      showToast.error(t.postError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (commentId: string) => {
    if (!editContent.trim()) return;

    try {
      await commentsApi.update(commentId, editContent.trim());
      setEditingId(null);
      setEditContent('');
      loadComments();
    } catch (error) {
      console.error('Failed to update comment:', error);
      showToast.error(t.updateError);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm(t.deleteConfirm)) return;

    try {
      await commentsApi.delete(commentId);
      loadComments();
    } catch (error) {
      console.error('Failed to delete comment:', error);
      showToast.error(t.deleteError);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (language === 'ko') {
      if (minutes < 1) return '방금';
      if (minutes < 60) return `${minutes}분`;
      if (hours < 24) return `${hours}시간`;
      if (days < 7) return `${days}일`;
      return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' });
    } else if (language === 'en') {
      if (minutes < 1) return 'now';
      if (minutes < 60) return `${minutes}m`;
      if (hours < 24) return `${hours}h`;
      if (days < 7) return `${days}d`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' });
    } else {
      if (minutes < 1) return '刚刚';
      if (minutes < 60) return `${minutes}分`;
      if (hours < 24) return `${hours}时`;
      if (days < 7) return `${days}天`;
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' });
    }
  };

  const renderComment = (comment: Comment, isReply = false) => {
    const isOwn = user?.id === comment.user.id;
    const isEditing = editingId === comment.id;

    return (
      <div
        key={comment.id}
        className={`group ${isReply ? 'ml-8 mt-3' : 'mb-4'}`}
      >
        <div className="flex gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-medium">
              {comment.user.username?.charAt(0) || 'U'}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm text-content-primary">
                {comment.user.username}
              </span>
              <span className="text-xs text-content-quaternary">
                {formatTime(comment.createdAt)}
              </span>
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="input w-full text-sm min-h-[60px] resize-none"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setEditContent('');
                    }}
                    className="btn-ghost text-xs py-1 px-2"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={() => handleEdit(comment.id)}
                    className="btn-primary text-xs py-1 px-2"
                  >
                    {t.save}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-content-secondary whitespace-pre-wrap">
                  {comment.content}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!isReply && (
                    <button
                      onClick={() => {
                        setReplyTo(comment.id);
                        inputRef.current?.focus();
                      }}
                      className="flex items-center gap-1 text-xs text-content-tertiary hover:text-content-secondary"
                    >
                      <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                      {t.reply}
                    </button>
                  )}
                  {isOwn && (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(comment.id);
                          setEditContent(comment.content);
                        }}
                        className="flex items-center gap-1 text-xs text-content-tertiary hover:text-content-secondary"
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                        {t.edit}
                      </button>
                      <button
                        onClick={() => handleDelete(comment.id)}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-500"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                        {t.delete}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-3">
            {comment.replies.map((reply) => renderComment(reply, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-primary">
        <ChatBubbleLeftRightIcon className="w-5 h-5 text-content-secondary" />
        <h3 className="font-semibold text-content-primary">{t.title}</h3>
        <span className="text-sm text-content-tertiary">({comments.length})</span>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton w-8 h-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/4 rounded" />
                  <div className="skeleton h-3 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length > 0 ? (
          comments.map((comment) => renderComment(comment))
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ChatBubbleLeftRightIcon className="w-12 h-12 text-content-quaternary mb-3" />
            <p className="text-content-secondary font-medium mb-1">{t.empty}</p>
            <p className="text-content-tertiary text-sm">{t.emptyDesc}</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border-primary">
        {replyTo && (
          <div className="flex items-center justify-between mb-2 text-xs text-content-tertiary bg-surface-secondary rounded-lg px-3 py-2">
            <span>
              {t.replyingTo}{' '}
              {comments.find((c) => c.id === replyTo)?.user.username || ''}
            </span>
            <button
              onClick={() => setReplyTo(null)}
              className="p-0.5 hover:bg-surface-tertiary rounded"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={replyTo ? t.replyPlaceholder : t.placeholder}
            className="input flex-1 min-h-[40px] max-h-[120px] resize-none text-sm"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!newComment.trim() || isSubmitting}
            className="btn-primary p-2.5 self-end"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
