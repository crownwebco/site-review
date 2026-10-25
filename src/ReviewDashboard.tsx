'use client';

import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useReview, pageKeyFromPath } from './ReviewContext';
import type { SectionState } from './types';

const UI_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Scroll to a reviewed section on the current page and flash it. */
function goToSection(s: SectionState) {
  const el =
    document.querySelector(`[data-review-id="${CSS.escape(s.id)}"]`) ||
    Array.from(document.querySelectorAll('[data-review]')).find(
      (e) => e.getAttribute('data-review') === s.name
    );
  if (!(el instanceof HTMLElement)) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const prev = el.style.boxShadow;
  el.style.transition = 'box-shadow 200ms';
  el.style.boxShadow = '0 0 0 4px rgba(79,70,229,0.65)';
  window.setTimeout(() => {
    el.style.boxShadow = prev;
  }, 1300);
}

/** Scroll to a pin's coordinates on the current page. */
function goToPin(x: number, y: number) {
  window.scrollTo({ top: Math.max(0, y - 120), left: 0, behavior: 'smooth' });
}

const mark = (s: string) => (s === 'approved' ? '✓' : s === 'changes' ? '✎' : '○');
const markColor = (s: string) =>
  s === 'approved' ? '#16a34a' : s === 'changes' ? '#d97706' : '#d1d5db';

/**
 * Read-only developer panel shown when a snapshot link is opened (`devMode`).
 * Summarizes the reviewer's verdicts and pins from the hydrated snapshot — no
 * editing, submitting, or pinning.
 */
export function ReviewDashboard() {
  const { sections, pins, declaredPages, snapshotMeta, exitDevView } = useReview();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const currentKey = pageKeyFromPath(usePathname());

  const all = Object.values(sections);
  const approved = all.filter((s) => s.status === 'approved').length;
  const changes = all.filter((s) => s.status === 'changes').length;

  const pages = useMemo(() => {
    const map = new Map<string, { key: string; name: string; sections: SectionState[] }>();
    for (const p of declaredPages) {
      const key = pageKeyFromPath(p.path);
      map.set(key, { key, name: p.name, sections: [] });
    }
    for (const s of all) {
      let e = map.get(s.page);
      if (!e) {
        e = { key: s.page, name: s.pageName, sections: [] };
        map.set(s.page, e);
      }
      e.sections.push(s);
    }
    return [...map.values()];
  }, [declaredPages, all]);

  const when = snapshotMeta ? new Date(snapshotMeta.submittedAt).toLocaleString() : '';

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div data-sr-ui style={{ display: 'contents' }}>
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 2147483000,
          width: 300,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 560,
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #e5e7eb',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          fontFamily: UI_FONT,
        }}
      >
        <div style={{ padding: '10px 14px', background: '#4f46e5', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Developer view</span>
            <button
              type="button"
              onClick={exitDevView}
              style={{
                border: '1px solid rgba(255,255,255,0.5)',
                background: 'transparent',
                color: '#fff',
                borderRadius: 6,
                padding: '2px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Exit
            </button>
          </div>
          {when && (
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Snapshot from {when}</div>
          )}
        </div>

        {/* Summary counts */}
        <div style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid #f1f5f9' }}>
          <Stat label="Approved" value={approved} color="#16a34a" />
          <Stat label="Changes" value={changes} color="#d97706" />
          <Stat label="Pins" value={pins.length} color="#e11d48" />
        </div>

        {/* Pages → sections */}
        <div style={{ overflowY: 'auto', padding: 12, flex: 1 }}>
          <p style={label}>Sections</p>
          {pages.map((pg) => {
            const reviewed = pg.sections.filter((s) => s.status !== 'unreviewed').length;
            const isOpen = expanded.has(pg.key);
            const has = pg.sections.length > 0;
            return (
              <div key={pg.key} style={{ padding: '4px 4px' }}>
                <button
                  type="button"
                  onClick={() => has && toggle(pg.key)}
                  style={{
                    all: 'unset',
                    display: 'flex',
                    width: '100%',
                    justifyContent: 'space-between',
                    cursor: has ? 'pointer' : 'default',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#374151',
                    boxSizing: 'border-box',
                  }}
                >
                  <span>
                    {has ? (isOpen ? '▾ ' : '▸ ') : ''}
                    {pg.name}
                  </span>
                  <span style={{ color: '#6b7280' }}>{has ? `${reviewed}/${pg.sections.length}` : '—'}</span>
                </button>
                {isOpen && has && (
                  <div style={{ paddingLeft: 10, marginTop: 4 }}>
                    {pg.sections.map((s) => {
                      const here = s.page === currentKey;
                      return (
                        <div key={s.id} style={{ fontSize: 12, padding: '3px 0' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <span style={{ color: markColor(s.status), fontWeight: 700 }}>{mark(s.status)}</span>
                            {here ? (
                              <button
                                type="button"
                                onClick={() => goToSection(s)}
                                title="Scroll to this section"
                                style={{ all: 'unset', cursor: 'pointer', color: '#4f46e5', textDecoration: 'underline' }}
                              >
                                {s.name}
                              </button>
                            ) : (
                              <span style={{ color: '#4b5563' }} title="On another page">{s.name}</span>
                            )}
                          </div>
                          {s.comment.trim() && (
                            <p style={{ margin: '2px 0 0 18px', fontStyle: 'italic', color: '#6b7280' }}>
                              “{s.comment.trim()}”
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {pins.length > 0 && (
            <>
              <p style={{ ...label, marginTop: 12 }}>Pins</p>
              {pins.map((p, i) => {
                const here = p.page === currentKey;
                const headline = (
                  <>
                    <span style={{ color: '#e11d48', fontWeight: 700 }}>{i + 1}.</span>{' '}
                    {p.pageName}
                    {p.sectionName ? ` › ${p.sectionName}` : ' › (no section)'}
                    {here && <span style={{ color: '#4f46e5' }}> ↗</span>}
                  </>
                );
                return (
                  <div key={p.id} style={{ fontSize: 12, padding: '3px 0' }}>
                    {here ? (
                      <button
                        type="button"
                        onClick={() => goToPin(p.x, p.y)}
                        title="Scroll to this pin"
                        style={{ all: 'unset', cursor: 'pointer', display: 'block', color: '#374151' }}
                      >
                        {headline}
                      </button>
                    ) : (
                      <div style={{ color: '#374151' }} title="On another page">{headline}</div>
                    )}
                    {p.note.trim() && (
                      <p style={{ margin: '2px 0 0 14px', fontStyle: 'italic', color: '#6b7280' }}>
                        “{p.note.trim()}”
                      </p>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label: l, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{l}</div>
    </div>
  );
}

const label: React.CSSProperties = {
  margin: '0 0 6px',
  padding: '0 4px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280',
};
