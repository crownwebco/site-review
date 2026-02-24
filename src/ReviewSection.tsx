'use client';

import { useState } from 'react';
import { useReview } from './ReviewContext';

export interface ReviewSectionProps {
  /**
   * Must match the `id` field of a section defined in your `sections` config.
   * If the ID isn't found, the children render normally with no review chrome.
   */
  id: string;
  children: React.ReactNode;
}

export function ReviewSection({ id, children }: ReviewSectionProps) {
  const { isReviewMode, sections, approveSection, openModal } = useReview();
  const [isHovered, setIsHovered] = useState(false);

  // Pass-through when not in review mode — zero overhead for production
  if (!isReviewMode) return <>{children}</>;

  const section = sections[id];
  if (!section) return <>{children}</>;

  const { status, name } = section;

  const borderClass =
    status === 'approved'
      ? 'border-green-500'
      : status === 'commented'
        ? 'border-amber-500'
        : 'border-dashed border-blue-400';

  const badgeBg =
    status === 'approved'
      ? 'bg-green-600'
      : status === 'commented'
        ? 'bg-amber-600'
        : 'bg-blue-500';

  const statusText =
    status === 'approved'
      ? 'Approved'
      : status === 'commented'
        ? 'Has Feedback'
        : 'Not Reviewed';

  const statusIcon =
    status === 'approved' ? (
      <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ) : status === 'commented' ? (
      <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ) : (
      <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
      </svg>
    );

  return (
    <div
      className={`relative border-2 ${borderClass} transition-colors duration-200`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Section name — top left */}
      <div className="pointer-events-none absolute left-2 top-2 z-[60] select-none rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">
        {name}
      </div>

      {/* Status badge — top right */}
      <div
        className={`pointer-events-none absolute right-2 top-2 z-[60] flex select-none items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-white ${badgeBg}`}
      >
        {statusIcon}
        <span className="hidden sm:inline">{statusText}</span>
      </div>

      {/* Action buttons — visible on hover */}
      <div
        className={`absolute right-2 top-10 z-[60] flex gap-1.5 transition-opacity duration-150 ${
          isHovered ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          onClick={() => approveSection(id)}
          title="Mark as Approved"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-colors hover:bg-green-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>

        <button
          onClick={() => openModal(id)}
          title="Leave Feedback"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg transition-colors hover:bg-amber-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>

      {children}
    </div>
  );
}
