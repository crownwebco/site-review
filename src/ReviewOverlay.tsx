'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useReview, type SectionRegistration } from './ReviewContext';

interface Discovered extends SectionRegistration {
  el: Element;
}

function pageFromPath(pathname: string | null): string {
  if (!pathname || pathname === '/') return 'home';
  return pathname.replace(/^\//, '').split('/')[0] || 'home';
}

function humanize(s: string): string {
  return s
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Scans the DOM for `[data-review]` elements, registers them with the provider,
 * and renders positioned review chrome (border + badges + approve/comment
 * buttons) over each. No component wrapping or config needed in the host app.
 *
 * Attributes read from each element:
 *   data-review        → section label (required)
 *   data-review-id     → stable id (optional; defaults to slug of page + label)
 *   data-review-page   → page key (optional; defaults to first pathname segment)
 *   data-review-page-name → page label (optional; defaults to humanized page key)
 */
export function ReviewOverlay() {
  const { sections, registerSection, approveSection, unreviewSection, openModal, devMode } =
    useReview();
  const pathname = usePathname();

  const [items, setItems] = useState<Discovered[]>([]);
  const [rects, setRects] = useState<Record<string, DOMRect>>({});
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const frame = useRef<number | null>(null);
  const sigRef = useRef('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scan = useCallback(() => {
    const page = pageFromPath(pathname);
    const els = Array.from(document.querySelectorAll('[data-review]'));
    const found: Discovered[] = els.map((el) => {
      const name = el.getAttribute('data-review') || 'Section';
      const pageKey = el.getAttribute('data-review-page') || page;
      const pageName =
        el.getAttribute('data-review-page-name') || humanize(pageKey);
      const id = el.getAttribute('data-review-id') || slug(`${pageKey}-${name}`);
      return { id, name, page: pageKey, pageName, el };
    });
    found.forEach(({ el: _el, ...reg }) => registerSection(reg));
    // Only replace the items array when the discovered set actually changes,
    // so routine DOM mutations don't churn the measure effect.
    const sig = found.map((f) => `${f.id}@${f.page}`).sort().join('|');
    if (sig !== sigRef.current) {
      sigRef.current = sig;
      setItems(found);
    }
  }, [pathname, registerSection]);

  const measure = useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      setRects((prev) => {
        const next: Record<string, DOMRect> = {};
        let changed = false;
        for (const it of items) {
          const r = it.el.getBoundingClientRect();
          next[it.id] = r;
          const p = prev[it.id];
          if (!p || p.top !== r.top || p.left !== r.left || p.width !== r.width || p.height !== r.height) {
            changed = true;
          }
        }
        return changed || Object.keys(prev).length !== items.length ? next : prev;
      });
    });
  }, [items]);

  // Re-scan on navigation, and when the DOM mutates (client-rendered content).
  // Debounced, and ignores mutations from the review UI's own DOM so it can't
  // trigger itself into a loop.
  useEffect(() => {
    scan();
    const isOwnUI = (n: Node | null): boolean => {
      const el = n instanceof Element ? n : n?.parentElement ?? null;
      return !!el?.closest('[data-review-overlay-root],[data-sr-ui]');
    };
    const mo = new MutationObserver((records) => {
      const relevant = records.some(
        (r) => !isOwnUI(r.target) && !isOwnUI(r.addedNodes[0] ?? null)
      );
      if (!relevant) return;
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(scan, 150);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [scan]);

  // Keep overlay boxes aligned with their elements.
  useEffect(() => {
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    items.forEach((it) => ro.observe(it.el));
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      ro.disconnect();
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [items, measure]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-review-overlay-root
      style={{ position: 'fixed', inset: 0, zIndex: 2147482000, pointerEvents: 'none' }}
    >
      {items.map((it) => {
        const rect = rects[it.id];
        if (!rect) return null;
        const section = sections[it.id];
        const status = section?.status ?? 'unreviewed';
        const hasNote = !!section?.comment?.trim();
        const color =
          status === 'approved' ? '#16a34a' : status === 'changes' ? '#d97706' : '#3b82f6';
        const statusText =
          status === 'approved'
            ? hasNote
              ? 'Approved · note'
              : 'Approved'
            : status === 'changes'
              ? 'Changes requested'
              : 'Not Reviewed';
        const approved = status === 'approved';
        return (
          <div
            key={it.id}
            style={{
              position: 'fixed',
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              border: `2px ${status === 'unreviewed' ? 'dashed' : 'solid'} ${color}`,
              borderRadius: 4,
              boxSizing: 'border-box',
              pointerEvents: 'none',
              transition: 'border-color 150ms',
            }}
          >
            {/* Section name — top left */}
            <span
              style={{
                position: 'absolute',
                top: 6,
                left: 6,
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                color: '#fff',
                background: 'rgba(0,0,0,0.6)',
                fontFamily: UI_FONT,
                whiteSpace: 'nowrap',
              }}
            >
              {it.name}
            </span>

            {/* Status badge — top right. In dev view with a note, it's a
                clickable pill that reveals the feedback inline. */}
            {devMode && hasNote ? (
              <button
                type="button"
                title={section?.comment}
                onClick={() => setOpenNoteId((cur) => (cur === it.id ? null : it.id))}
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  padding: '2px 8px',
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                  background: color,
                  fontFamily: UI_FONT,
                  whiteSpace: 'nowrap',
                  border: 'none',
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                }}
              >
                {statusText} ⓘ
              </button>
            ) : (
              <span
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  padding: '2px 8px',
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                  background: color,
                  fontFamily: UI_FONT,
                  whiteSpace: 'nowrap',
                }}
              >
                {statusText}
              </span>
            )}

            {/* Read-only note bubble (dev view) */}
            {devMode && openNoteId === it.id && hasNote && (
              <div
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 6,
                  width: 'min(380px, 80vw)',
                  maxHeight: 200,
                  overflowY: 'auto',
                  background: '#fff',
                  color: '#1f2937',
                  fontSize: 12,
                  lineHeight: 1.45,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
                  fontFamily: UI_FONT,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  pointerEvents: 'auto',
                  zIndex: 1,
                }}
              >
                {section?.comment?.trim()}
              </div>
            )}

            {/* Action buttons — always visible in review mode, hidden in read-only dev view */}
            <div
              style={{
                position: 'absolute',
                top: 34,
                right: 6,
                display: devMode ? 'none' : 'flex',
                gap: 6,
                pointerEvents: 'auto',
              }}
            >
              <button
                type="button"
                title={approved ? 'Approved — click to undo' : 'Mark as approved'}
                aria-label={approved ? 'Undo approval' : 'Mark as approved'}
                aria-pressed={approved}
                onClick={() => (approved ? unreviewSection(it.id) : approveSection(it.id))}
                style={roundBtn(approved ? '#16a34a' : '#ffffff', approved ? '#ffffff' : '#16a34a')}
              >
                ✓
              </button>
              <button
                type="button"
                title="Leave feedback"
                aria-label="Leave feedback"
                onClick={() => openModal(it.id)}
                style={roundBtn('#d97706')}
              >
                ✎
              </button>
            </div>
          </div>
        );
      })}
    </div>,
    document.body
  );
}

const UI_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function roundBtn(bg: string, fg = '#fff'): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 9999,
    border: bg === '#ffffff' ? `2px solid ${fg}` : 'none',
    cursor: 'pointer',
    color: fg,
    background: bg,
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1,
    boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
    pointerEvents: 'auto',
  };
}
