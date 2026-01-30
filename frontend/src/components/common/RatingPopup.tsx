import { Fragment, useState, useEffect, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { StarIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';
import { ratingApi } from '../../services/api';
import { useSettingsStore } from '../../stores/settingsStore';

const translations = {
  ko: {
    title: '서비스 평가',
    subtitle: 'AI 응답 품질은 어떠셨나요?',
    placeholder: '의견을 남겨주세요 (선택)',
    submit: '제출',
    skip: '건너뛰기',
    thanks: '감사합니다!',
    labels: ['별로예요', '아쉬워요', '보통이에요', '좋아요', '최고예요'],
  },
  en: {
    title: 'Rate this service',
    subtitle: 'How was the AI response quality?',
    placeholder: 'Leave a comment (optional)',
    submit: 'Submit',
    skip: 'Skip',
    thanks: 'Thank you!',
    labels: ['Poor', 'Fair', 'Average', 'Good', 'Excellent'],
  },
  cn: {
    title: '评价服务',
    subtitle: 'AI 回复质量如何？',
    placeholder: '请留下您的意见（可选）',
    submit: '提交',
    skip: '跳过',
    thanks: '谢谢！',
    labels: ['很差', '较差', '一般', '不错', '很好'],
  },
};

interface RatingPopupProps {
  isOpen: boolean;
  onClose: () => void;
  modelName: string;
}

const RATING_INTERVAL = 20;
const STORAGE_KEY = 'once_request_count';

/** 요청 횟수 추적. 2회마다 true 반환 */
export function shouldShowRating(): boolean {
  const count = Number(localStorage.getItem(STORAGE_KEY) || '0') + 1;
  localStorage.setItem(STORAGE_KEY, String(count));
  return count % RATING_INTERVAL === 0;
}

export default function RatingPopup({ isOpen, onClose, modelName }: RatingPopupProps) {
  const { language } = useSettingsStore();
  const t = translations[language];

  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setHoveredStar(0);
      setSelectedRating(0);
      setSubmitted(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    if (selectedRating === 0 || submitting) return;
    setSubmitting(true);
    try {
      await ratingApi.submit(modelName, selectedRating);
    } catch (e) {
      console.error('Failed to submit rating:', e);
    }
    setSubmitted(true);
    setTimeout(() => onClose(), 1200);
  }, [selectedRating, modelName, submitting, onClose]);

  const displayRating = hoveredStar || selectedRating;

  return (
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
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95 translate-y-4"
            enterTo="opacity-100 scale-100 translate-y-0"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100 translate-y-0"
            leaveTo="opacity-0 scale-95 translate-y-4"
          >
            <Dialog.Panel className="w-full max-w-sm bg-surface-primary rounded-2xl shadow-2xl border border-border-primary overflow-hidden">
              {submitted ? (
                /* Thank you state */
                <div className="px-6 py-10 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold text-content-primary">{t.thanks}</p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="px-6 pt-6 pb-2 text-center">
                    <Dialog.Title className="text-lg font-bold text-content-primary">
                      {t.title}
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-content-secondary">{t.subtitle}</p>
                  </div>

                  {/* Stars */}
                  <div className="px-6 py-5">
                    <div className="flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => {
                        const filled = star <= displayRating;
                        return (
                          <button
                            key={star}
                            onMouseEnter={() => setHoveredStar(star)}
                            onMouseLeave={() => setHoveredStar(0)}
                            onClick={() => setSelectedRating(star)}
                            className="group relative p-1 transition-transform hover:scale-110 active:scale-95"
                          >
                            {filled ? (
                              <StarIcon className="w-10 h-10 text-amber-400 drop-shadow-sm transition-colors" />
                            ) : (
                              <StarOutlineIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 transition-colors group-hover:text-amber-300" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {/* Label */}
                    <div className="h-6 mt-2 text-center">
                      {displayRating > 0 && (
                        <span className="text-sm font-medium text-content-secondary animate-in fade-in duration-150">
                          {t.labels[displayRating - 1]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="px-6 pb-6 flex gap-3">
                    <button
                      onClick={onClose}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-content-tertiary hover:bg-surface-secondary transition-colors"
                    >
                      {t.skip}
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={selectedRating === 0 || submitting}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {t.submit}
                    </button>
                  </div>
                </>
              )}
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
