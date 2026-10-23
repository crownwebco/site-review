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
  const { sections, registerSection, approveSection, openModal } = useReview();
  const pathname = usePathname();

  const [items, setItems] = useState<Discovered[]>([]);
  const [rects, setRects] = useState<Record<string, DOMRect>>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const frame = useRef<number | null>(null);

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
    setItems(found);
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
  useEffect(() => {
    scan();
    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
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
        const status = sections[it.id]?.status ?? 'unreviewed';
        const color =
          status === 'approved' ? '#16a34a' : status === 'commented' ? '#d97706' : '#3b82f6';
        const statusText =
          status === 'approved'
            ? 'Approved'
            : status === 'commented'
              ? 'Has Feedback'
              : 'Not Reviewed';
        const hovered = hoveredId === it.id;
        return (
          <div
            key={it.id}
            onMouseEnter={() => setHoveredId(it.id)}
            onMouseLeave={() => setHoveredId((cur) => (cur === it.id ? null : cur))}
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

            {/* Status badge — top right */}
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

            {/* Action buttons — on hover */}
            <div
              style={{
                position: 'absolute',
                top: 34,
                right: 6,
                display: 'flex',
                gap: 6,
                opacity: hovered ? 1 : 0,
                pointerEvents: hovered ? 'auto' : 'none',
                transition: 'opacity 150ms',
              }}
            >
              <button
                type="button"
                title="Mark as approved"
                aria-label="Mark as approved"
                onClick={() => approveSection(it.id)}
                style={roundBtn('#16a34a')}
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

function roundBtn(bg: string): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 9999,
    border: 'none',
    cursor: 'pointer',
    color: '#fff',
    background: bg,
    fontSize: 15,
    lineHeight: 1,
    boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
    pointerEvents: 'auto',
  };
}
