'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useReview, pageKeyFromPath } from './ReviewContext';

const UI_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function humanize(s: string): string {
  return s.replace(/[-_]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function describe(el: Element | null): string | undefined {
  if (!el) return undefined;
  const tag = el.tagName.toLowerCase();
  const text = (el.getAttribute('aria-label') || el.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
  return text ? `${tag} · ${text}` : tag;
}

/**
 * Freeform pins: in review mode the reviewer can drop a pin anywhere. Each pin
 * records the section it landed in (nearest [data-review]), the page, the
 * clicked element, and a note. Pins are shown as markers on their page and
 * included in the submitted review.
 */
export function ReviewPins() {
  const { pinMode, togglePinMode, pins, addPin, updatePin, removePin, declaredPages, devMode } =
    useReview();
  const pathname = usePathname();
  const currentKey = pageKeyFromPath(pathname);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const pageName =
    declaredPages.find((p) => pageKeyFromPath(p.path) === currentKey)?.name ??
    humanize(currentKey);

  // Placement: capture clicks anywhere (except our own UI) while pin mode is on.
  useEffect(() => {
    if (!pinMode || devMode) return;
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest('[data-sr-ui],[data-review-overlay-root],[data-sr-pins]')) return;
      e.preventDefault();
      e.stopPropagation();
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const section = hit?.closest('[data-review]') as Element | null;
      const id = `pin-${Date.now()}`;
      addPin({
        id,
        page: currentKey,
        pageName,
        x: e.pageX,
        y: e.pageY,
        sectionId: section?.getAttribute('data-review-id') || undefined,
        sectionName: section?.getAttribute('data-review') || undefined,
        target: describe(hit),
        note: '',
      });
      setDraft('');
      setEditingId(id);
      togglePinMode();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') togglePinMode();
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [pinMode, devMode, currentKey, pageName, addPin, togglePinMode]);

  const pagePins = pins.filter((p) => p.page === currentKey);

  const openEditor = (id: string, note: string) => {
    setDraft(note);
    setEditingId(id);
  };

  const closeEditor = () => {
    // Read-only in dev view — never mutate the hydrated snapshot.
    if (!devMode && editingId) {
      const pin = pins.find((p) => p.id === editingId);
      if (pin && !pin.note.trim() && !draft.trim()) removePin(editingId);
      else if (pin) updatePin(editingId, draft.trim());
    }
    setEditingId(null);
    setDraft('');
  };

  if (typeof document === 'undefined') return null;
  const editing = editingId ? pins.find((p) => p.id === editingId) : null;

  return createPortal(
    <div data-sr-pins style={{ fontFamily: UI_FONT }}>
      {/* Placement hint */}
      {pinMode && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2147483500,
            background: '#111827',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
          }}
        >
          Click anywhere to drop a pin · Esc to cancel
        </div>
      )}

      {/* Pin markers for the current page */}
      <div style={{ position: 'absolute', top: 0, left: 0 }}>
        {pagePins.map((p, i) => (
          <button
            key={p.id}
            type="button"
            title={p.note || 'Pinned comment'}
            onClick={() => openEditor(p.id, p.note)}
            style={{
              position: 'absolute',
              top: p.y,
              left: p.x,
              transform: 'translate(-50%, -100%)',
              zIndex: 2147483400,
              width: 24,
              height: 24,
              borderRadius: '50% 50% 50% 0',
              rotate: '-45deg',
              border: '2px solid #fff',
              background: '#e11d48',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 3px 8px rgba(0,0,0,0.35)',
            }}
          >
            <span style={{ display: 'inline-block', rotate: '45deg' }}>{i + 1}</span>
          </button>
        ))}
      </div>

      {/* Pin editor */}
      {editing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
            onClick={closeEditor}
          />
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 460,
              background: '#fff',
              borderRadius: 16,
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
                Pinned comment
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>
                {editing.pageName}
                {editing.sectionName ? ` › ${editing.sectionName}` : ' › (no section)'}
                {editing.target ? ` · ${editing.target}` : ''}
              </p>
            </div>
            {devMode ? (
              <>
                <div style={{ padding: 20 }}>
                  <p style={{ margin: 0, fontSize: 14, color: '#111827', whiteSpace: 'pre-wrap' }}>
                    {editing.note.trim() || <span style={{ color: '#9ca3af' }}>(no note)</span>}
                  </p>
                </div>
                <div style={{ display: 'flex', padding: '0 20px 20px' }}>
                  <button
                    type="button"
                    onClick={closeEditor}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#4f46e5',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ padding: 20 }}>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="What about this spot?"
                    rows={4}
                    autoFocus
                    style={{
                      width: '100%',
                      resize: 'none',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      padding: 12,
                      fontSize: 14,
                      color: '#111827',
                      boxSizing: 'border-box',
                      fontFamily: UI_FONT,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12, padding: '0 20px 20px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      removePin(editing.id);
                      setEditingId(null);
                      setDraft('');
                    }}
                    style={{
                      flex: '0 0 auto',
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid #fecaca',
                      background: '#fff',
                      color: '#b91c1c',
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={closeEditor}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#e11d48',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
