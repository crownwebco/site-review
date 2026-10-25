'use client';

import { useReview } from './ReviewContext';
import { ReviewOverlay } from './ReviewOverlay';
import { ReviewPanel } from './ReviewPanel';
import { ReviewPins } from './ReviewPins';
import { ReviewDashboard } from './ReviewDashboard';

/**
 * Internal UI shell, rendered by <ReviewProvider> only when the feature is
 * `active`. Two roles: a reviewer (interactive panel + overlays) and a developer
 * (read-only dashboard + overlays), set by opening a submitted snapshot link and
 * persisted on that browser. Each role has its own enter button when collapsed.
 */
export function ReviewUI() {
  const { reviewMode, toggleReviewMode, devMode } = useReview();

  // Developer role (persisted): collapsed → a "Developer View" button; open →
  // read-only overlays + pins + dashboard.
  if (devMode) {
    if (!reviewMode) {
      return <EnterButton label="Developer View" background="#4f46e5" onClick={toggleReviewMode} />;
    }
    return (
      <>
        <ReviewOverlay />
        <ReviewPins />
        <ReviewDashboard />
      </>
    );
  }

  // Reviewer role.
  if (!reviewMode) {
    return <EnterButton label="Review Mode" background="#7c3aed" onClick={toggleReviewMode} />;
  }
  return (
    <>
      <ReviewOverlay />
      <ReviewPins />
      <ReviewPanel />
    </>
  );
}

function EnterButton({
  label,
  background,
  onClick,
}: {
  label: string;
  background: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
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
        background,
        boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
      }}
    >
      {label}
    </button>
  );
}
