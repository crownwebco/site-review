'use client';

import { useState, useEffect, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { useReview } from './ReviewContext';
import type { ReviewSubmissionData } from './types';

export interface ReviewControlsProps {
  /**
   * Async function that receives the review data and sends the email.
   * Use a Next.js server action — see the README for a copy-paste template.
   */
  onSubmit: (
    data: ReviewSubmissionData[]
  ) => Promise<{ success: boolean; message: string }>;
  /**
   * Project name shown in the submit confirmation modal.
   * @default 'this website'
   */
  siteName?: string;
}

export function ReviewControls({
  onSubmit,
  siteName = 'this website',
}: ReviewControlsProps) {
  const {
    isReviewMode,
    sections,
    activeModalId,
    allPages,
    toggleReviewMode,
    addComment,
    closeModal,
    getPageProgress,
    getTotalProgress,
    getPageName,
    getCurrentPage,
    isComplete,
  } = useReview();

  const pathname = usePathname();
  const currentPage = getCurrentPage(pathname);

  const [comment, setComment] = useState('');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();

  // Populate textarea with existing comment whenever the modal opens
  useEffect(() => {
    if (activeModalId) {
      setComment(sections[activeModalId]?.comment ?? '');
    } else {
      setComment('');
    }
  }, [activeModalId, sections]);

  const activeSection = activeModalId ? sections[activeModalId] : null;
  const totalProgress = getTotalProgress();

  const handleSaveComment = () => {
    if (!activeModalId) return;
    addComment(activeModalId, comment.trim() || ' ');
    closeModal();
  };

  const handleSubmitReview = () => {
    setSubmitStatus('idle');
    startTransition(async () => {
      try {
        const result = await onSubmit(
          Object.values(sections).map((s) => ({
            id: s.id,
            page: s.pageName,
            name: s.name,
            status: s.status,
            comment: s.comment,
          }))
        );
        setSubmitStatus(result.success ? 'success' : 'error');
      } catch {
        setSubmitStatus('error');
      }
    });
  };

  return (
    <>
      {/* ── Comment Modal ── */}
      {activeModalId && activeSection && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => closeModal()}
          />
          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Leave Feedback</h3>
              <p className="mt-0.5 text-sm text-gray-500">
                {activeSection.pageName} &rsaquo; {activeSection.name}
              </p>
            </div>

            <div className="p-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                What do you like or want changed?
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g. I love the colors here — or — Can we change the heading font?"
                rows={5}
                autoFocus
                className="w-full resize-none rounded-lg border border-gray-300 p-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => closeModal()}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveComment}
                disabled={!comment.trim()}
                className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit Review Modal ── */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (!isPending) {
                setShowSubmitModal(false);
                setSubmitStatus('idle');
              }
            }}
          />
          <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-xl font-bold text-gray-900">Review Summary</h3>
              <p className="mt-0.5 text-sm text-gray-500">
                {siteName} — {totalProgress.reviewed} of {totalProgress.total} sections reviewed
              </p>
            </div>

            {/* Summary list */}
            <div className="max-h-[50vh] space-y-5 overflow-y-auto p-6">
              {allPages.map((page) => {
                const pageSections = Object.values(sections).filter((s) => s.page === page);
                const progress = getPageProgress(page);
                return (
                  <div key={page}>
                    <h4 className="mb-2 flex items-center gap-2 font-semibold text-gray-900">
                      {getPageName(page)}
                      <span
                        className={`text-xs font-normal ${
                          progress.reviewed === progress.total
                            ? 'text-green-600'
                            : 'text-gray-400'
                        }`}
                      >
                        ({progress.reviewed}/{progress.total})
                      </span>
                    </h4>
                    <div className="space-y-1.5 pl-4">
                      {pageSections.map((s) => (
                        <div key={s.id} className="flex items-start gap-2 text-sm">
                          <span
                            className={`mt-0.5 shrink-0 font-bold ${
                              s.status === 'approved'
                                ? 'text-green-600'
                                : s.status === 'commented'
                                  ? 'text-amber-600'
                                  : 'text-gray-300'
                            }`}
                          >
                            {s.status === 'approved'
                              ? '✓'
                              : s.status === 'commented'
                                ? '✏'
                                : '○'}
                          </span>
                          <div>
                            <span className="text-gray-700">{s.name}</span>
                            {s.comment && s.comment.trim() && (
                              <p className="mt-0.5 italic text-gray-500">
                                &ldquo;{s.comment.trim()}&rdquo;
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer actions */}
            <div className="border-t border-gray-200 px-6 py-4">
              {submitStatus === 'success' ? (
                <div className="py-2 text-center">
                  <p className="text-lg font-bold text-green-600">Review Sent!</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Your feedback has been emailed to the web developer.
                  </p>
                  <button
                    onClick={() => {
                      setShowSubmitModal(false);
                      setSubmitStatus('idle');
                    }}
                    className="mt-4 rounded-lg bg-green-500 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
                  >
                    Done
                  </button>
                </div>
              ) : submitStatus === 'error' ? (
                <div className="py-2 text-center">
                  <p className="font-bold text-red-600">Could Not Send Email</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Please try again or contact the developer directly.
                  </p>
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={() => {
                        setShowSubmitModal(false);
                        setSubmitStatus('idle');
                      }}
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      Close
                    </button>
                    <button
                      onClick={handleSubmitReview}
                      className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSubmitModal(false)}
                    disabled={isPending}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={handleSubmitReview}
                    disabled={isPending}
                    className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                  >
                    {isPending ? 'Sending…' : 'Send to Developer'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Floating UI ── */}
      {!isReviewMode ? (
        // Enter Review Mode button
        <button
          onClick={toggleReviewMode}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-violet-700"
        >
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Review Mode
        </button>
      ) : (
        // Review panel
        <div className="fixed bottom-6 right-6 z-40 w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          {/* Panel header */}
          <div className="flex items-center justify-between bg-blue-500 px-4 py-3">
            <div className="flex items-center gap-2 text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              <span className="text-sm font-bold">Review Mode Active</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
                title={isPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
                className="rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              >
                <svg
                  className={`h-4 w-4 transition-transform duration-200 ${isPanelCollapsed ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                onClick={toggleReviewMode}
                title="Exit Review Mode"
                className="rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {!isPanelCollapsed && (
            <>
              {/* Per-page progress */}
              <div className="space-y-2 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Progress by Page
                </p>
                {allPages.map((page) => {
                  const { reviewed, total } = getPageProgress(page);
                  const pct = total > 0 ? (reviewed / total) * 100 : 0;
                  const isCurrent = page === currentPage;
                  const isDone = reviewed === total;

                  return (
                    <div
                      key={page}
                      className={`rounded-lg px-3 py-2 ${isCurrent ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`text-xs font-medium ${
                            isCurrent ? 'text-blue-700' : 'text-gray-700'
                          }`}
                        >
                          {isCurrent && <span className="mr-1 font-bold">›</span>}
                          {getPageName(page)}
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            isDone ? 'text-green-600' : 'text-gray-500'
                          }`}
                        >
                          {reviewed}/{total}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isDone ? 'bg-green-500' : 'bg-blue-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total progress */}
              <div className="border-t border-gray-100 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">Total Progress</span>
                  <span
                    className={`font-bold ${
                      isComplete ? 'text-green-600' : 'text-gray-900'
                    }`}
                  >
                    {totalProgress.reviewed}/{totalProgress.total}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isComplete ? 'bg-green-500' : 'bg-blue-400'
                    }`}
                    style={{
                      width: `${(totalProgress.reviewed / totalProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Submit button */}
              <div className="border-t border-gray-100 p-4">
                <button
                  onClick={() => setShowSubmitModal(true)}
                  disabled={!isComplete}
                  title={
                    isComplete
                      ? 'Send your review to the developer'
                      : `${totalProgress.total - totalProgress.reviewed} sections still need review`
                  }
                  className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    isComplete
                      ? 'bg-green-500 text-white shadow-md hover:bg-green-600 hover:shadow-lg'
                      : 'cursor-not-allowed bg-gray-100 text-gray-400'
                  }`}
                >
                  {isComplete
                    ? '✓ Send Review to Developer'
                    : `${totalProgress.total - totalProgress.reviewed} section${totalProgress.total - totalProgress.reviewed === 1 ? '' : 's'} remaining`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
