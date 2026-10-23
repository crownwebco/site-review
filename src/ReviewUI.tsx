'use client';

import { useReview } from './ReviewContext';
import { ReviewOverlay } from './ReviewOverlay';
import { ReviewPanel } from './ReviewPanel';

/**
 * Internal UI shell, rendered by <ReviewProvider> only when the feature is
 * `active` (allowed host + switched on). Task #9 provides the gated enter/exit
 * toggle; the discovery overlays (#10) and the progress panel + submit modal
 * (#11) build on top of this.
 */
export function ReviewUI() {
  const { reviewMode, toggleReviewMode } = useReview();

  if (!reviewMode) {
    return (
      <button
        type="button"
        onClick={toggleReviewMode}
        aria-label="Enter review mode"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 2147483000,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 20px',
          borderRadius: 9999,
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          color: '#fff',
          background: '#7c3aed',
          boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
        }}
      >
        Review Mode
      </button>
    );
  }

  return (
    <>
      <ReviewOverlay />
      <ReviewPanel />
    </>
  );
}
