'use client';

import { useState } from 'react';

const UI_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Dismissible corner toast shown to a reviewer once the review window has ended
 * (the env flag is still on, but the `reviewUntil` date has passed). Rendered by
 * the provider in place of the review UI, including live on an open tab the
 * moment the deadline crosses.
 */
export function ReviewEnded() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 2147483000,
        maxWidth: 'min(360px, calc(100vw - 32px))',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '14px 16px',
        borderRadius: 12,
        background: '#111827',
        color: '#fff',
        boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
        fontFamily: UI_FONT,
      }}
    >
      <div style={{ fontSize: 13, lineHeight: 1.45 }}>
        <strong style={{ display: 'block', fontWeight: 700, marginBottom: 2 }}>
          Review period has ended
        </strong>
        Thank you for your feedback! This review window is now closed.
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          border: 'none',
          background: 'transparent',
          color: 'rgba(255,255,255,0.7)',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
          marginLeft: 'auto',
        }}
      >
        ✕
      </button>
    </div>
  );
}
