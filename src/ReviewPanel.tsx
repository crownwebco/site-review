'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { useReview } from './ReviewContext';
import type { ReviewSubmissionData } from './types';

const UI_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function detectDevice(): 'Mobile' | 'Desktop / Laptop' {
  if (typeof window === 'undefined') return 'Desktop / Laptop';
  return window.innerWidth < 768 ? 'Mobile' : 'Desktop / Laptop';
}

/**
 * The review control surface shown in review mode: the comment modal, the
 * submit-summary modal, and the docked progress panel. Submit is available at
 * any time (unless `requireComplete`), so partial feedback can be sent.
 */
export function ReviewPanel() {
  const {
    sections,
    activeModalId,
    addComment,
    closeModal,
    toggleReviewMode,
    getPageProgress,
    getTotalProgress,
    isComplete,
    requireComplete,
    siteName,
    submit,
  } = useReview();

  const pathname = usePathname();

  const [comment, setComment] = useState('');
  const [additionalComments, setAdditionalComments] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();

  const allPages = useMemo(
    () => [...new Set(Object.values(sections).map((s) => s.page))],
    [sections]
  );

  const activeSection = activeModalId ? sections[activeModalId] : null;
  const total = getTotalProgress();
  const canSubmit = !requireComplete || isComplete;

  useEffect(() => {
    setComment(activeModalId ? (sections[activeModalId]?.comment ?? '') : '');
  }, [activeModalId, sections]);

  const handleSaveComment = () => {
    if (!activeModalId) return;
    addComment(activeModalId, comment.trim() || ' ');
    closeModal();
  };

  const handleSubmit = () => {
    setStatus('idle');
    startTransition(async () => {
      try {
        const device = detectDevice();
        const url = typeof window !== 'undefined' ? window.location.href : undefined;
        const viewport =
          typeof window !== 'undefined'
            ? `${window.innerWidth}x${window.innerHeight}`
            : undefined;
        const data: ReviewSubmissionData[] = Object.values(sections).map((s) => ({
          id: s.id,
          page: s.pageName,
          name: s.name,
          status: s.status,
          comment: s.comment,
          deviceType: device,
          url,
          viewport,
        }));
        const result = await submit(data, additionalComments.trim() || undefined);
        setStatus(result.success ? 'success' : 'error');
      } catch {
        setStatus('error');
      }
    });
  };

  return (
    <>
      {/* ── Comment modal ── */}
      {activeModalId && activeSection && (
        <div style={overlayBackdrop}>
          <div style={backdropFill} onClick={closeModal} />
          <div style={{ ...modalCard, maxWidth: 520 }}>
            <div style={modalHeader}>
              <h3 style={modalTitle}>Leave Feedback</h3>
              <p style={modalSub}>
                {activeSection.pageName} › {activeSection.name}
              </p>
            </div>
            <div style={{ padding: 24 }}>
              <label style={fieldLabel}>What do you like, or want changed?</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g. Love the colors — or — can we change the heading font?"
                rows={5}
                autoFocus
                style={textarea}
              />
            </div>
            <div style={{ ...modalFooter, gap: 12 }}>
              <button type="button" onClick={closeModal} style={btnGhost}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveComment}
                disabled={!comment.trim()}
                style={{ ...btnSolid('#d97706'), opacity: comment.trim() ? 1 : 0.5 }}
              >
                Save Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit summary modal ── */}
      {showSubmit && (
        <div style={overlayBackdrop}>
          <div
            style={backdropFill}
            onClick={() => {
              if (!isPending) {
                setShowSubmit(false);
                setStatus('idle');
              }
            }}
          />
          <div style={{ ...modalCard, maxWidth: 640 }}>
            <div style={modalHeader}>
              <h3 style={{ ...modalTitle, fontSize: 20 }}>Review Summary</h3>
              <p style={modalSub}>
                {siteName} — {total.reviewed} of {total.total} sections reviewed
              </p>
            </div>

            <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: 24 }}>
              {allPages.map((page) => {
                const pageSections = Object.values(sections).filter((s) => s.page === page);
                const prog = getPageProgress(page);
                const pageName = pageSections[0]?.pageName ?? page;
                return (
                  <div key={page} style={{ marginBottom: 20 }}>
                    <h4 style={summaryPageHeading}>
                      {pageName}{' '}
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 400,
                          color: prog.reviewed === prog.total ? '#16a34a' : '#9ca3af',
                        }}
                      >
                        ({prog.reviewed}/{prog.total})
                      </span>
                    </h4>
                    <div style={{ paddingLeft: 16 }}>
                      {pageSections.map((s) => (
                        <div key={s.id} style={{ display: 'flex', gap: 8, fontSize: 14, marginBottom: 6 }}>
                          <span style={{ color: markColor(s.status), fontWeight: 700 }}>
                            {mark(s.status)}
                          </span>
                          <div>
                            <span style={{ color: '#374151' }}>{s.name}</span>
                            {s.comment.trim() && (
                              <p style={{ margin: '2px 0 0', fontStyle: 'italic', color: '#6b7280' }}>
                                “{s.comment.trim()}”
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

            <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 24px' }}>
              <label style={fieldLabel}>
                Anything else? <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
              </label>
              <textarea
                value={additionalComments}
                onChange={(e) => setAdditionalComments(e.target.value)}
                placeholder="Any other thoughts that didn't fit a specific section…"
                rows={3}
                disabled={isPending || status !== 'idle'}
                style={textarea}
              />
            </div>

            <div style={modalFooter}>
              {status === 'success' ? (
                <div style={{ textAlign: 'center', width: '100%' }}>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', margin: 0 }}>
                    Review Sent!
                  </p>
                  <p style={{ fontSize: 14, color: '#4b5563', margin: '4px 0 0' }}>
                    Your feedback has been emailed to the developer.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubmit(false);
                      setStatus('idle');
                    }}
                    style={{ ...btnSolid('#16a34a'), marginTop: 16 }}
                  >
                    Done
                  </button>
                </div>
              ) : status === 'error' ? (
                <div style={{ textAlign: 'center', width: '100%' }}>
                  <p style={{ fontWeight: 700, color: '#dc2626', margin: 0 }}>Could Not Send</p>
                  <p style={{ fontSize: 14, color: '#4b5563', margin: '4px 0 12px' }}>
                    Please try again or contact the developer directly.
                  </p>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubmit(false);
                        setStatus('idle');
                      }}
                      style={btnGhost}
                    >
                      Close
                    </button>
                    <button type="button" onClick={handleSubmit} style={btnSolid('#2563eb')}>
                      Try Again
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                  <button
                    type="button"
                    onClick={() => setShowSubmit(false)}
                    disabled={isPending}
                    style={btnGhost}
                  >
                    Go Back
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isPending}
                    style={btnSolid('#2563eb')}
                  >
                    {isPending ? 'Sending…' : 'Send to Developer'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Docked panel ── */}
      <div style={panelWrap}>
        <div style={panelHeader}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#fff' }} />
            Review Mode
          </span>
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              style={headerIconBtn}
              aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {collapsed ? '▴' : '▾'}
            </button>
            <button
              type="button"
              onClick={toggleReviewMode}
              style={headerIconBtn}
              aria-label="Exit review mode"
            >
              ✕
            </button>
          </span>
        </div>

        {!collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ overflowY: 'auto', padding: 12, flex: 1 }}>
              <p style={panelSectionLabel}>Progress by Page</p>
              {allPages.length === 0 && (
                <p style={{ fontSize: 12, color: '#9ca3af', padding: '4px 8px', margin: 0 }}>
                  Scroll through the pages — sections appear as you visit them.
                </p>
              )}
              {allPages.map((page) => {
                const { reviewed, total: pageTotal } = getPageProgress(page);
                const pct = pageTotal > 0 ? (reviewed / pageTotal) * 100 : 0;
                const done = reviewed === pageTotal && pageTotal > 0;
                const current = pageFromPath(pathname) === page;
                const pageName =
                  Object.values(sections).find((s) => s.page === page)?.pageName ?? page;
                return (
                  <div
                    key={page}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 8,
                      background: current ? '#eff6ff' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: current ? '#1d4ed8' : '#374151' }}>
                        {current ? '› ' : ''}
                        {pageName}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: done ? '#16a34a' : '#6b7280' }}>
                        {reviewed}/{pageTotal}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 9999, background: '#f1f5f9', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          borderRadius: 9999,
                          background: done ? '#22c55e' : '#60a5fa',
                          transition: 'width 300ms',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
                <span style={{ fontWeight: 500, color: '#374151' }}>Total</span>
                <span style={{ fontWeight: 700, color: isComplete ? '#16a34a' : '#111827' }}>
                  {total.reviewed}/{total.total}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowSubmit(true)}
                disabled={!canSubmit}
                title={canSubmit ? 'Send your review' : 'Review all sections first'}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                  fontWeight: 600,
                  color: canSubmit ? '#fff' : '#9ca3af',
                  background: canSubmit ? '#22c55e' : '#f3f4f6',
                }}
              >
                {canSubmit
                  ? `Send Review${total.reviewed ? ` (${total.reviewed})` : ''}`
                  : `${total.total - total.reviewed} left to review`}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function pageFromPath(pathname: string | null): string {
  if (!pathname || pathname === '/') return 'home';
  return pathname.replace(/^\//, '').split('/')[0] || 'home';
}

const mark = (s: string) => (s === 'approved' ? '✓' : s === 'commented' ? '✎' : '○');
const markColor = (s: string) =>
  s === 'approved' ? '#16a34a' : s === 'commented' ? '#d97706' : '#d1d5db';

// ── Inline style objects (self-contained — no consumer Tailwind/CSS needed) ──
const overlayBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147483600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  fontFamily: UI_FONT,
};
const backdropFill: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
};
const modalCard: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  background: '#fff',
  borderRadius: 16,
  boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
  overflow: 'hidden',
};
const modalHeader: React.CSSProperties = { padding: '16px 24px', borderBottom: '1px solid #e5e7eb' };
const modalTitle: React.CSSProperties = { margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' };
const modalSub: React.CSSProperties = { margin: '2px 0 0', fontSize: 14, color: '#6b7280' };
const modalFooter: React.CSSProperties = {
  display: 'flex',
  padding: '16px 24px',
  borderTop: '1px solid #e5e7eb',
};
const fieldLabel: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 14,
  fontWeight: 500,
  color: '#374151',
};
const textarea: React.CSSProperties = {
  width: '100%',
  resize: 'none',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  padding: 12,
  fontSize: 14,
  color: '#111827',
  boxSizing: 'border-box',
  fontFamily: UI_FONT,
};
const btnGhost: React.CSSProperties = {
  flex: 1,
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#374151',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};
const btnSolid = (bg: string): React.CSSProperties => ({
  flex: 1,
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: bg,
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
});
const summaryPageHeading: React.CSSProperties = {
  margin: '0 0 8px',
  paddingBottom: 8,
  borderBottom: '2px solid #e2e8f0',
  fontSize: 15,
  fontWeight: 700,
  color: '#0f172a',
};
const panelWrap: React.CSSProperties = {
  position: 'fixed',
  bottom: 24,
  right: 24,
  zIndex: 2147483000,
  width: 288,
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: 520,
  display: 'flex',
  flexDirection: 'column',
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e5e7eb',
  boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
  overflow: 'hidden',
  fontFamily: UI_FONT,
};
const panelHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  background: '#2563eb',
  color: '#fff',
  fontSize: 14,
  fontWeight: 700,
};
const headerIconBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  padding: '2px 6px',
  borderRadius: 4,
  lineHeight: 1,
};
const panelSectionLabel: React.CSSProperties = {
  margin: '0 0 6px',
  padding: '0 8px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280',
};
