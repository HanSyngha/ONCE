import { useState, useRef, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { requestsApi, adminApi } from '../../services/api';
import RatingPopup, { shouldShowRating } from '../common/RatingPopup';
import {
  subscribeToRequest,
  on,
  off,
  QueueUpdate,
  RequestProgress,
  RequestComplete,
  RequestAskUser,
} from '../../services/websocket';
import {
  XMarkIcon,
  SparklesIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  FolderIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
}

type RequestStatus = 'idle' | 'submitting' | 'queued' | 'processing' | 'completed' | 'failed';

const translations = {
  ko: {
    title: '새 노트 작성',
    subtitle: '원하는 내용을 자유롭게 입력하세요. AI가 자동으로 정리해드립니다.',
    placeholder:
      '예: "오늘 회의에서 논의한 내용을 정리해줘. 주제는 2024년 상반기 마케팅 전략이고, 참석자는 김팀장, 이과장, 박대리야. 주요 안건은 SNS 광고 예산 증액, 신규 인플루언서 협업, 오프라인 이벤트 기획이었어."',
    submit: 'AI로 작성하기',
    submitting: '제출 중...',
    queued: '대기 중',
    processing: '작성 중',
    completed: '완료',
    failed: '실패',
    viewNote: '노트 보기',
    tryAgain: '다시 시도',
    close: '닫기',
    position: '대기 순번',
    progress: '진행률',
    createdFiles: '생성된 파일',
    createdFolders: '생성된 폴더',
    error: '오류가 발생했습니다',
    aiQuestion: 'AI가 질문을 보냈습니다',
    customInput: '직접 입력',
    sendAnswer: '응답 보내기',
    timeRemaining: '남은 시간',
  },
  en: {
    title: 'Create New Note',
    subtitle: 'Enter anything you want. AI will organize it for you.',
    placeholder:
      'Example: "Summarize today\'s meeting. The topic was Q1 2024 marketing strategy. Attendees were Team Lead Kim, Manager Lee, and Assistant Park. Main agendas were SNS ad budget increase, new influencer collaboration, and offline event planning."',
    submit: 'Create with AI',
    submitting: 'Submitting...',
    queued: 'In Queue',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
    viewNote: 'View Note',
    tryAgain: 'Try Again',
    close: 'Close',
    position: 'Queue Position',
    progress: 'Progress',
    createdFiles: 'Created Files',
    createdFolders: 'Created Folders',
    error: 'An error occurred',
    aiQuestion: 'AI has a question',
    customInput: 'Custom input',
    sendAnswer: 'Send answer',
    timeRemaining: 'Time remaining',
  },
  cn: {
    title: '创建新笔记',
    subtitle: '随意输入您想要的内容。AI 会自动为您整理。',
    placeholder:
      '例如："整理今天的会议内容。主题是2024年上半年营销策略。参会者有金组长、李科长、朴助理。主要议题是SNS广告预算增加、新网红合作、线下活动策划。"',
    submit: '使用 AI 创建',
    submitting: '提交中...',
    queued: '排队中',
    processing: '处理中',
    completed: '完成',
    failed: '失败',
    viewNote: '查看笔记',
    tryAgain: '重试',
    close: '关闭',
    position: '队列位置',
    progress: '进度',
    createdFiles: '创建的文件',
    createdFolders: '创建的文件夹',
    error: '发生错误',
    aiQuestion: 'AI 发来了一个问题',
    customInput: '自定义输入',
    sendAnswer: '发送回答',
    timeRemaining: '剩余时间',
  },
};

export default function InputModal({ isOpen, onClose, spaceId }: InputModalProps) {
  const navigate = useNavigate();
  const { language } = useSettingsStore();
  const { refresh } = useSpaceStore();
  const t = translations[language];

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<RequestComplete['result'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [ratingModel, setRatingModel] = useState('');
  const [askUserData, setAskUserData] = useState<RequestAskUser | null>(null);
  const askUserDataRef = useRef<RequestAskUser | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customAnswer, setCustomAnswer] = useState('');
  const [askDeadline, setAskDeadline] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startPolling = (rid: string) => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const res = await requestsApi.get(rid);
        const req = res.data.request;
        if (req.status === 'COMPLETED') {
          stopPolling();
          setStatus((prev) => {
            if (prev === 'completed' || prev === 'failed') return prev; // 이미 처리됨
            if (req.result) {
              try {
                const parsed = typeof req.result === 'string' ? JSON.parse(req.result) : req.result;
                setResult(parsed);
              } catch {
                setResult(null);
              }
            }
            setProgress(100);
            refresh();
            return 'completed';
          });
        } else if (req.status === 'FAILED' || req.status === 'CANCELLED') {
          stopPolling();
          setStatus((prev) => {
            if (prev === 'completed' || prev === 'failed') return prev;
            setError(req.error || t.error);
            return 'failed';
          });
        } else if (req.status === 'PROCESSING' && req.pendingQuestion && !askUserDataRef.current) {
          // WebSocket으로 ask_user 이벤트를 놓친 경우 polling fallback
          const data = {
            requestId: rid,
            question: req.pendingQuestion.question,
            options: req.pendingQuestion.options,
            timeoutMs: req.pendingQuestion.timeoutMs,
          };
          askUserDataRef.current = data;
          setAskUserData(data);
          setAskDeadline(Date.now() + req.pendingQuestion.timeoutMs);
          setSelectedOption(null);
          setCustomAnswer('');
        }
      } catch {
        // 폴링 에러는 무시
      }
    }, 3000);
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  useEffect(() => {
    if (!requestId) return;

    startPolling(requestId);

    const handleQueueUpdate = (data: QueueUpdate) => {
      if (data.requestId !== requestId) return;

      if (data.status === 'waiting') {
        setStatus('queued');
        setQueuePosition(data.position);
      } else if (data.status === 'processing') {
        setStatus('processing');
        setQueuePosition(null);
      } else if (data.status === 'completed') {
        setStatus('completed');
      } else if (data.status === 'failed') {
        setStatus('failed');
        setError(data.message || t.error);
      }
    };

    const handleProgress = (data: RequestProgress) => {
      if (data.requestId !== requestId) return;
      setProgress(data.progress);
      setProgressMessage(data.message || '');
    };

    const handleComplete = (data: RequestComplete) => {
      if (data.requestId !== requestId) return;

      stopPolling();
      if (data.success) {
        setStatus('completed');
        setResult(data.result || null);
        setProgress(100);
        refresh(); // Refresh the tree
      } else {
        setStatus('failed');
        setError(data.error || t.error);
      }
    };

    const handleFailed = (data: { requestId: string; error: string }) => {
      if (data.requestId !== requestId) return;
      stopPolling();
      setStatus('failed');
      setError(data.error || t.error);
      setAskUserData(null);
      setAskDeadline(null);
    };

    const handleAskUser = (data: RequestAskUser) => {
      if (data.requestId !== requestId) return;
      if (askUserDataRef.current) return; // 이미 질문 UI 표시 중이면 무시 (중복 이벤트 방지)
      askUserDataRef.current = data;
      setAskUserData(data);
      setAskDeadline(Date.now() + data.timeoutMs);
      setSelectedOption(null);
      setCustomAnswer('');
    };

    subscribeToRequest(requestId);
    on('queue:update', handleQueueUpdate);
    on('request:progress', handleProgress);
    on('request:complete', handleComplete);
    on('request:failed', handleFailed);
    on('request:ask_user', handleAskUser);

    return () => {
      stopPolling();
      off('queue:update', handleQueueUpdate);
      off('request:progress', handleProgress);
      off('request:complete', handleComplete);
      off('request:failed', handleFailed);
      off('request:ask_user', handleAskUser);
    };
  }, [requestId, refresh, t.error]);

  // 카운트다운 타이머
  useEffect(() => {
    if (!askDeadline) {
      setTimeLeft('');
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, askDeadline - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [askDeadline]);

  const handleSubmitAnswer = async () => {
    if (!requestId || !askUserData) return;

    const answer = selectedOption === '__custom__'
      ? customAnswer.trim()
      : selectedOption;

    if (!answer) return;

    try {
      await requestsApi.answerQuestion(requestId, answer);
      setAskUserData(null);
      setAskDeadline(null);
    } catch {
      // 타임아웃 등으로 실패 시 failed 이벤트가 올 것임
    }
  };

  const handleSubmit = async () => {
    if (!input.trim() || !spaceId) return;

    // 입력 시점에 평가 팝업 표시 (20회마다)
    if (shouldShowRating()) {
      adminApi.getModelConfig().then((res) => {
        setRatingModel(res.data.defaultModel || 'unknown');
      }).catch(() => {
        setRatingModel('unknown');
      });
      setShowRating(true);
    }

    setStatus('submitting');
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      const response = await requestsApi.input(spaceId, input.trim());
      setRequestId(response.data.request.id);
      setStatus('queued');
      setQueuePosition(response.data.request.position || 1);
    } catch (err: any) {
      setStatus('failed');
      setError(err.response?.data?.error || t.error);
    }
  };

  const handleReset = () => {
    stopPolling();
    setStatus('idle');
    setRequestId(null);
    setQueuePosition(null);
    setProgress(0);
    setProgressMessage('');
    setResult(null);
    setError(null);
    setAskUserData(null);
    askUserDataRef.current = null;
    setAskDeadline(null);
    setSelectedOption(null);
    setCustomAnswer('');
  };

  const handleClose = () => {
    // ask_to_user 대기 중이면 닫기 허용 + 기본 응답 전송
    if (askUserData && requestId) {
      requestsApi.answerQuestion(requestId, askUserData.options[0] || '확인').catch(() => {});
      handleReset();
      setInput('');
      onClose();
      return;
    }

    if (status === 'submitting' || status === 'queued' || status === 'processing') {
      // Don't close while in progress
      return;
    }
    handleReset();
    setInput('');
    onClose();
  };

  const handleViewNote = () => {
    if (result?.filesCreated && result.filesCreated.length > 0) {
      // Navigate to the first created file
      const firstFile = result.filesCreated[0];
      navigate(`/note/${firstFile}`);
    }
    handleClose();
  };

  const renderContent = () => {
    if (status === 'idle') {
      return (
        <>
          {/* Textarea */}
          <div className="px-6 py-5">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.placeholder}
              className="w-full h-48 resize-none rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-base text-slate-900 dark:text-slate-100 p-4 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSubmit();
                }
              }}
            />
          </div>

          {/* Actions */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
            <button onClick={handleClose} className="btn-ghost">
              {t.close}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="btn-primary"
            >
              <SparklesIcon className="w-4 h-4" />
              {t.submit}
            </button>
          </div>
        </>
      );
    }

    // Processing states
    return (
      <div className="px-6 py-8">
        <div className="flex flex-col items-center">
          {/* Status icon */}
          <div className="relative mb-6">
            {(status === 'submitting' || status === 'queued' || status === 'processing') && (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/50 dark:to-primary-800/50 flex items-center justify-center">
                <ArrowPathIcon className="w-10 h-10 text-primary-500 animate-spin" />
              </div>
            )}
            {status === 'completed' && (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/50 dark:to-green-800/50 flex items-center justify-center">
                <CheckCircleIcon className="w-10 h-10 text-green-500" />
              </div>
            )}
            {status === 'failed' && (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/50 dark:to-red-800/50 flex items-center justify-center">
                <ExclamationCircleIcon className="w-10 h-10 text-red-500" />
              </div>
            )}
          </div>

          {/* Status text */}
          <h3 className="text-lg font-semibold text-content-primary mb-2">
            {status === 'submitting' && t.submitting}
            {status === 'queued' && t.queued}
            {status === 'processing' && t.processing}
            {status === 'completed' && t.completed}
            {status === 'failed' && t.failed}
          </h3>

          {/* Queue position */}
          {status === 'queued' && queuePosition !== null && (
            <div className="flex items-center gap-2 text-content-secondary mb-4">
              <ClockIcon className="w-4 h-4" />
              <span>
                {t.position}: <strong>{queuePosition}</strong>
              </span>
            </div>
          )}

          {/* Progress bar */}
          {(status === 'processing' || status === 'completed') && (
            <div className="w-full max-w-xs mb-4">
              <div className="flex items-center justify-between text-sm text-content-secondary mb-2">
                <span>{t.progress}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary-500 to-accent-purple transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {progressMessage && (
                <p className="text-sm text-content-tertiary mt-2 text-center">
                  {progressMessage}
                </p>
              )}
            </div>
          )}

          {/* AI 질문 팝업 */}
          {askUserData && (
            <div className="w-full max-w-sm mt-4 p-5 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-3">
                {t.aiQuestion}
              </p>
              <p className="text-base text-content-primary mb-4">
                {askUserData.question}
              </p>

              <div className="space-y-2 mb-4">
                {askUserData.options.map((option, i) => (
                  <label
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedOption === option
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                        : 'border-slate-200 dark:border-slate-600 hover:bg-surface-secondary'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ask_option"
                      checked={selectedOption === option}
                      onChange={() => setSelectedOption(option)}
                      className="accent-primary-500"
                    />
                    <span className="text-sm text-content-primary">{option}</span>
                  </label>
                ))}

                {/* 직접 입력 */}
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedOption === '__custom__'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                      : 'border-slate-200 dark:border-slate-600 hover:bg-surface-secondary'
                  }`}
                >
                  <input
                    type="radio"
                    name="ask_option"
                    checked={selectedOption === '__custom__'}
                    onChange={() => setSelectedOption('__custom__')}
                    className="accent-primary-500"
                  />
                  <span className="text-sm text-content-primary">{t.customInput}</span>
                </label>

                {selectedOption === '__custom__' && (
                  <input
                    type="text"
                    value={customAnswer}
                    onChange={(e) => setCustomAnswer(e.target.value)}
                    placeholder={t.customInput}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-content-primary placeholder:text-content-quaternary focus:outline-none focus:ring-2 focus:ring-primary-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSubmitAnswer();
                    }}
                  />
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-content-tertiary">
                  {t.timeRemaining}: {timeLeft}
                </span>
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!selectedOption || (selectedOption === '__custom__' && !customAnswer.trim())}
                  className="btn-primary text-sm"
                >
                  {t.sendAnswer}
                </button>
              </div>
            </div>
          )}

          {/* Result */}
          {status === 'completed' && result && (
            <div className="w-full max-w-sm mt-4 space-y-3">
              {result.filesCreated && result.filesCreated.length > 0 && (
                <div className="p-3 bg-surface-secondary rounded-xl">
                  <div className="flex items-center gap-2 text-sm text-content-secondary mb-2">
                    <DocumentTextIcon className="w-4 h-4" />
                    {t.createdFiles}
                  </div>
                  <div className="space-y-1">
                    {result.filesCreated.slice(0, 5).map((file, i) => (
                      <p key={i} className="text-sm text-content-primary truncate">
                        {file}
                      </p>
                    ))}
                    {result.filesCreated.length > 5 && (
                      <p className="text-sm text-content-tertiary">
                        +{result.filesCreated.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {result.foldersCreated && result.foldersCreated.length > 0 && (
                <div className="p-3 bg-surface-secondary rounded-xl">
                  <div className="flex items-center gap-2 text-sm text-content-secondary mb-2">
                    <FolderIcon className="w-4 h-4" />
                    {t.createdFolders}
                  </div>
                  <div className="space-y-1">
                    {result.foldersCreated.slice(0, 3).map((folder, i) => (
                      <p key={i} className="text-sm text-content-primary truncate">
                        {folder}
                      </p>
                    ))}
                    {result.foldersCreated.length > 3 && (
                      <p className="text-sm text-content-tertiary">
                        +{result.foldersCreated.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {status === 'failed' && error && (
            <div className="w-full max-w-sm p-4 bg-red-50 dark:bg-red-900/20 rounded-xl mt-4">
              <p className="text-sm text-red-600 dark:text-red-400 text-center">
                {error}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6">
            {status === 'completed' && (
              <>
                <button onClick={handleClose} className="btn-ghost">
                  {t.close}
                </button>
                <button onClick={handleViewNote} className="btn-primary">
                  {t.viewNote}
                </button>
              </>
            )}
            {status === 'failed' && (
              <>
                <button onClick={handleClose} className="btn-ghost">
                  {t.close}
                </button>
                <button onClick={handleReset} className="btn-primary">
                  {t.tryAgain}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => {}}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                  <div className="flex items-center justify-between">
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-content-primary">
                        {t.title}
                      </Dialog.Title>
                      <p className="text-sm text-content-tertiary mt-0.5">
                        {t.subtitle}
                      </p>
                    </div>
                    <button
                      onClick={handleClose}
                      className="p-2 rounded-lg hover:bg-surface-secondary transition-colors"
                    >
                      <XMarkIcon className="w-5 h-5 text-content-tertiary" />
                    </button>
                  </div>
                </div>

                {renderContent()}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>

    <RatingPopup
      isOpen={showRating}
      onClose={() => setShowRating(false)}
      modelName={ratingModel}
    />
    </>
  );
}
