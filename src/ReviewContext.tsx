'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { usePathname } from 'next/navigation';
import LZString from 'lz-string';
import type {
  SectionState,
  SectionStatus,
  ReviewSubmissionData,
  ReviewOptions,
  ReviewPage,
  Pin,
  ReviewSnapshot,
} from './types';
import { ReviewUI } from './ReviewUI';
import { ReviewEnded } from './ReviewEnded';

export type { SectionState, SectionStatus, ReviewSubmissionData, ReviewOptions, ReviewPage, Pin };

/** Page key from a pathname — mirrors the overlay's derivation ('/' → 'home'). */
export function pageKeyFromPath(pathname: string | null): string {
  if (!pathname || pathname === '/') return 'home';
  return pathname.replace(/^\//, '').split('/')[0] || 'home';
}

/** A section registering itself from a discovered `data-review` element. */
export interface SectionRegistration {
  id: string;
  page: string;
  pageName: string;
  name: string;
}

interface ReviewContextValue {
  /** Feature is available on this host (reviewer window active, or dev view). */
  active: boolean;
  /** The review window's end date has passed (drives the "ended" notice). */
  windowEnded: boolean;
  /** The reviewer has entered review mode (persisted across reloads). */
  reviewMode: boolean;
  toggleReviewMode: () => void;
  sections: Record<string, SectionState>;
  registerSection: (reg: SectionRegistration) => void;
  /** Quick-approve; keeps any existing note (so approve-with-feedback survives). */
  approveSection: (id: string) => void;
  /** Set a verdict ('approved' | 'changes') with an accompanying note. */
  saveFeedback: (id: string, verdict: 'approved' | 'changes', comment: string) => void;
  unreviewSection: (id: string) => void;
  activeModalId: string | null;
  openModal: (id: string) => void;
  closeModal: () => void;
  getPageProgress: (page: string) => { reviewed: number; total: number };
  getTotalProgress: () => { reviewed: number; total: number };
  declaredPages: ReviewPage[];
  visitedPages: string[];
  pins: Pin[];
  pinMode: boolean;
  /** Read-only developer view, hydrated from a submitted snapshot link. */
  devMode: boolean;
  snapshotMeta: { submittedAt: string } | null;
  exitDevView: () => void;
  leaveDevView: () => void;
  togglePinMode: () => void;
  addPin: (pin: Pin) => void;
  updatePin: (id: string, note: string) => void;
  removePin: (id: string) => void;
  isComplete: boolean;
  requireComplete: boolean;
  maxCommentLength: number;
  siteName: string;
  submit: (
    data: ReviewSubmissionData[],
    additionalComments?: string,
    pins?: Pin[],
    devView?: { url: string; json: string }
  ) => Promise<{ success: boolean; message: string }>;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

type Action =
  | { type: 'LOAD'; sections: Record<string, SectionState> }
  | { type: 'LOAD_PINS'; pins: Pin[] }
  | { type: 'REGISTER'; reg: SectionRegistration }
  | { type: 'APPROVE'; id: string }
  | { type: 'SET_FEEDBACK'; id: string; verdict: 'approved' | 'changes'; comment: string }
  | { type: 'UNREVIEW'; id: string }
  | { type: 'ADD_PIN'; pin: Pin }
  | { type: 'UPDATE_PIN'; id: string; note: string }
  | { type: 'REMOVE_PIN'; id: string }
  | { type: 'SET_MODAL'; id: string | null };

interface State {
  sections: Record<string, SectionState>;
  pins: Pin[];
  activeModalId: string | null;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD':
      return { ...state, sections: action.sections };
    case 'REGISTER': {
      const existing = state.sections[action.reg.id];
      // Idempotent: if this section is already known with identical labels,
      // change nothing (stable object identity stops re-render/persist churn).
      if (
        existing &&
        existing.name === action.reg.name &&
        existing.page === action.reg.page &&
        existing.pageName === action.reg.pageName
      ) {
        return state;
      }
      // Preserve status/comment across navigations; refresh labels.
      return {
        ...state,
        sections: {
          ...state.sections,
          [action.reg.id]: {
            ...action.reg,
            status: existing?.status ?? 'unreviewed',
            comment: existing?.comment ?? '',
          },
        },
      };
    }
    case 'APPROVE':
      // Keep any existing note so "approve with feedback" isn't wiped.
      return {
        ...state,
        sections: {
          ...state.sections,
          [action.id]: { ...state.sections[action.id], status: 'approved' },
        },
      };
    case 'SET_FEEDBACK':
      return {
        ...state,
        sections: {
          ...state.sections,
          [action.id]: {
            ...state.sections[action.id],
            status: action.verdict,
            comment: action.comment,
          },
        },
      };
    case 'UNREVIEW':
      return {
        ...state,
        sections: {
          ...state.sections,
          [action.id]: {
            ...state.sections[action.id],
            status: 'unreviewed',
            comment: '',
          },
        },
      };
    case 'LOAD_PINS':
      return { ...state, pins: action.pins };
    case 'ADD_PIN':
      return { ...state, pins: [...state.pins, action.pin] };
    case 'UPDATE_PIN':
      return {
        ...state,
        pins: state.pins.map((p) => (p.id === action.id ? { ...p, note: action.note } : p)),
      };
    case 'REMOVE_PIN':
      return { ...state, pins: state.pins.filter((p) => p.id !== action.id) };
    case 'SET_MODAL':
      return { ...state, activeModalId: action.id };
    default:
      return state;
  }
}

export interface ReviewProviderProps {
  children: React.ReactNode;
  /**
   * Whether the feature is switched on for this environment. Read your env flag
   * in the consuming app and pass it in, e.g.
   * `enabled={process.env.NEXT_PUBLIC_REVIEW_ENABLED === 'true'}`.
   * Even when true, the feature only appears on an allowed host (see options).
   */
  enabled?: boolean;
  /**
   * Optional review-window end date in **MM-DD-YYYY** format (e.g. from
   * `NEXT_PUBLIC_REVIEW_UNTIL`). Treated as the end of that day in **Mountain
   * Time** (America/Denver), so the deadline is the same instant for every
   * client regardless of their timezone. A client-side timer enforces it live,
   * so an open/idle tab disables review mode and shows an "ended" notice once
   * the date passes — no refresh needed. Omit for no auto-end (flag-only).
   */
  reviewUntil?: string;
  /** Project name shown in the panel and summary email. */
  siteName?: string;
  /**
   * Pages to advertise in the panel up front (so the client sees everything to
   * review before visiting). Just `{ path, name }` each — sections are still
   * discovered from `data-review` on visit. Pages visited but not listed here
   * are added automatically.
   */
  pages?: ReviewPage[];
  /** Server action that emails the review. See the package `/server` export. */
  onSubmit: (
    data: ReviewSubmissionData[],
    additionalComments?: string,
    pins?: Pin[],
    devView?: { url: string; json: string }
  ) => Promise<{ success: boolean; message: string }>;
  options?: ReviewOptions;
}

const REVIEW_TZ = 'America/Denver'; // Mountain Time — see reviewUntil docs

/** Milliseconds to add to a UTC instant to get the wall-clock time in `tz`. */
function zoneOffsetMs(tz: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const g: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') g[p.type] = p.value;
  }
  const hour = g.hour === '24' ? 0 : Number(g.hour);
  const asUTC = Date.UTC(
    Number(g.year),
    Number(g.month) - 1,
    Number(g.day),
    hour,
    Number(g.minute),
    Number(g.second)
  );
  return asUTC - utcMs;
}

/** Parse "MM-DD-YYYY" as end-of-day (23:59:59.999) Mountain Time → UTC ms. */
function parseReviewUntil(s?: string): number | null {
  if (!s) return null;
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Desired Mountain wall time expressed naively as UTC, then shifted by the
  // zone's offset at that instant (DST-correct).
  const naive = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  return naive - zoneOffsetMs(REVIEW_TZ, naive);
}

function isHostAllowed(suffix: string, allowLocalhost: boolean): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  if (
    allowLocalhost &&
    (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local'))
  ) {
    return true;
  }
  return h.endsWith(suffix);
}

export function ReviewProvider({
  children,
  enabled = false,
  reviewUntil,
  siteName = 'this website',
  pages,
  onSubmit,
  options,
}: ReviewProviderProps) {
  const {
    allowedHostSuffix = '.crownwebdesign.com',
    allowLocalhost = true,
    storageKey = 'site-review',
    requireComplete = false,
    maxCommentLength = 500,
  } = options ?? {};

  const untilTs = useMemo(() => parseReviewUntil(reviewUntil), [reviewUntil]);

  const pathname = usePathname();
  const declaredPages = useMemo(() => pages ?? [], [pages]);

  const [mounted, setMounted] = useState(false);
  const [hostAllowed, setHostAllowed] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [visitedPages, setVisitedPages] = useState<string[]>([]);
  const [devMode, setDevMode] = useState(false);
  const [snapshotMeta, setSnapshotMeta] = useState<{ submittedAt: string } | null>(null);
  // Re-evaluated on a timer so an open tab self-expires when the window passes.
  const [windowEnded, setWindowEnded] = useState(() =>
    untilTs != null ? Date.now() >= untilTs : false
  );
  // Set synchronously (before dispatching LOAD) so persist effects never write
  // a hydrated snapshot over the reviewer's own stored data.
  const devModeRef = useRef(false);

  const [state, dispatch] = useReducer(reducer, {
    sections: {},
    pins: [],
    activeModalId: null,
  });

  const modeKey = `${storageKey}:mode`;
  const visitedKey = `${storageKey}:visited`;
  const pinsKey = `${storageKey}:pins`;
  const roleKey = `${storageKey}:role`;
  const devSnapKey = `${storageKey}:dev`;

  // Mount: resolve host, restore persisted flags + data. Reviewer access is
  // controlled entirely by the env-driven `enabled` + `reviewUntil` props —
  // there is no client-side activation.
  useEffect(() => {
    setMounted(true);
    setHostAllowed(isHostAllowed(allowedHostSuffix, allowLocalhost));

    try {
      setReviewMode(localStorage.getItem(modeKey) === '1');

      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, SectionState>;
        dispatch({ type: 'LOAD', sections: stored });
      }

      const visitedRaw = localStorage.getItem(visitedKey);
      if (visitedRaw) setVisitedPages(JSON.parse(visitedRaw) as string[]);

      const pinsRaw = localStorage.getItem(pinsKey);
      if (pinsRaw) dispatch({ type: 'LOAD_PINS', pins: JSON.parse(pinsRaw) as Pin[] });

      const hydrateDev = (snap: ReviewSnapshot) => {
        devModeRef.current = true; // guard persistence BEFORE dispatching
        dispatch({
          type: 'LOAD',
          sections: Object.fromEntries((snap.sections ?? []).map((s) => [s.id, s])),
        });
        dispatch({ type: 'LOAD_PINS', pins: snap.pins ?? [] });
        setDevMode(true);
        setSnapshotMeta({ submittedAt: snap.submittedAt });
      };

      // 1) Persisted developer role — re-enter dev view across reloads without
      //    needing the link again (the browser "is" the developer until it leaves).
      if (localStorage.getItem(roleKey) === 'dev') {
        const snapRaw = localStorage.getItem(devSnapKey);
        if (snapRaw) hydrateDev(JSON.parse(snapRaw) as ReviewSnapshot);
      }

      // 2) Developer snapshot link: #review=<compressed>&role=dev — establishes
      //    (or refreshes) the dev role, persists it, then tidies the URL.
      const hash = window.location.hash.replace(/^#/, '');
      const hp = new URLSearchParams(hash);
      if (hp.get('role') === 'dev' && hp.get('review')) {
        const decoded = LZString.decompressFromEncodedURIComponent(hp.get('review') as string);
        const snap = decoded ? (JSON.parse(decoded) as ReviewSnapshot) : null;
        if (snap) {
          localStorage.setItem(roleKey, 'dev');
          localStorage.setItem(devSnapKey, decoded as string);
          hydrateDev(snap);
          setReviewMode(true); // opening the link shows the dashboard immediately
          window.history.replaceState(
            {},
            '',
            window.location.pathname + window.location.search
          );
        }
      }
    } catch {
      // Ignore storage/URL errors — feature simply stays locked.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reviewer access is purely developer-controlled: the env flag must be on and
  // the review window must not have ended. Dev view is independent of both.
  const reviewerActive = mounted && hostAllowed && enabled && !windowEnded;
  const active = reviewerActive || (mounted && hostAllowed && devMode);

  // Live review-window timer: flip `windowEnded` the moment the deadline passes
  // so an open/idle tab self-expires without a refresh.
  useEffect(() => {
    if (untilTs == null) return;
    const check = () => setWindowEnded(Date.now() >= untilTs);
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [untilTs]);

  // When the browser is not an active reviewer (flag off or window ended) and is
  // not the developer, wipe stale reviewer state so nothing lingers between
  // reviews. Dev keys (:role, :dev) are left intact.
  useEffect(() => {
    if (!mounted || devModeRef.current) return;
    if (reviewerActive) return;
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(modeKey);
      localStorage.removeItem(visitedKey);
      localStorage.removeItem(pinsKey);
    } catch {
      // ignore
    }
  }, [mounted, reviewerActive, storageKey, modeKey, visitedKey, pinsKey]);

  // Mark the current page visited (so the panel can show its discovered count).
  useEffect(() => {
    if (!active || devMode) return;
    const key = pageKeyFromPath(pathname);
    setVisitedPages((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      try {
        localStorage.setItem(visitedKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [active, pathname, visitedKey]);

  // Persist section data whenever it changes — only for an active reviewer.
  // Never in dev view (a hydrated snapshot must not overwrite stored data) and
  // never when inactive (so it can't re-write data the wipe just cleared).
  useEffect(() => {
    if (!mounted || devModeRef.current || !reviewerActive) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.sections));
    } catch {
      // ignore
    }
  }, [state.sections, storageKey, mounted, reviewerActive]);

  // Persist pins whenever they change (active reviewer only).
  useEffect(() => {
    if (!mounted || devModeRef.current || !reviewerActive) return;
    try {
      localStorage.setItem(pinsKey, JSON.stringify(state.pins));
    } catch {
      // ignore
    }
  }, [state.pins, pinsKey, mounted, reviewerActive]);

  const toggleReviewMode = useCallback(() => {
    setReviewMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(modeKey, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, [modeKey]);

  const togglePinMode = useCallback(() => setPinMode((p) => !p), []);
  // Hide the dashboard but STAY the developer — re-entering shows dev view again.
  const exitDevView = useCallback(() => {
    setReviewMode(false);
    try {
      localStorage.setItem(modeKey, '0');
    } catch {
      // ignore
    }
  }, [modeKey]);
  // Fully drop the developer role — clear the persisted role + snapshot, reload
  // to the reviewer's normal state.
  const leaveDevView = useCallback(() => {
    try {
      localStorage.removeItem(roleKey);
      localStorage.removeItem(devSnapKey);
    } catch {
      // ignore
    }
    window.location.replace(window.location.pathname + window.location.search);
  }, [roleKey, devSnapKey]);
  const addPin = useCallback((pin: Pin) => dispatch({ type: 'ADD_PIN', pin }), []);
  const updatePin = useCallback(
    (id: string, note: string) => dispatch({ type: 'UPDATE_PIN', id, note }),
    []
  );
  const removePin = useCallback((id: string) => dispatch({ type: 'REMOVE_PIN', id }), []);

  const registerSection = useCallback(
    (reg: SectionRegistration) => dispatch({ type: 'REGISTER', reg }),
    []
  );
  const approveSection = useCallback((id: string) => dispatch({ type: 'APPROVE', id }), []);
  const saveFeedback = useCallback(
    (id: string, verdict: 'approved' | 'changes', comment: string) =>
      dispatch({ type: 'SET_FEEDBACK', id, verdict, comment }),
    []
  );
  const unreviewSection = useCallback((id: string) => dispatch({ type: 'UNREVIEW', id }), []);
  const openModal = useCallback((id: string) => dispatch({ type: 'SET_MODAL', id }), []);
  const closeModal = useCallback(() => dispatch({ type: 'SET_MODAL', id: null }), []);

  const getPageProgress = useCallback(
    (page: string) => {
      const pageSections = Object.values(state.sections).filter((s) => s.page === page);
      const reviewed = pageSections.filter((s) => s.status !== 'unreviewed').length;
      return { reviewed, total: pageSections.length };
    },
    [state.sections]
  );

  const getTotalProgress = useCallback(() => {
    const all = Object.values(state.sections);
    return {
      reviewed: all.filter((s) => s.status !== 'unreviewed').length,
      total: all.length,
    };
  }, [state.sections]);

  const isComplete = useMemo(() => {
    const all = Object.values(state.sections);
    return all.length > 0 && all.every((s) => s.status !== 'unreviewed');
  }, [state.sections]);

  const value: ReviewContextValue = {
    active,
    windowEnded,
    reviewMode,
    toggleReviewMode,
    sections: state.sections,
    registerSection,
    approveSection,
    saveFeedback,
    unreviewSection,
    activeModalId: state.activeModalId,
    openModal,
    closeModal,
    getPageProgress,
    getTotalProgress,
    declaredPages,
    visitedPages,
    pins: state.pins,
    pinMode,
    devMode,
    snapshotMeta,
    exitDevView,
    leaveDevView,
    togglePinMode,
    addPin,
    updatePin,
    removePin,
    isComplete,
    requireComplete,
    maxCommentLength,
    siteName,
    submit: onSubmit,
  };

  // Show the "ended" notice to a reviewer when the window has passed but the
  // flag is still on (and they're not the developer). Flip the flag off to
  // remove it entirely.
  const showEnded = mounted && hostAllowed && enabled && windowEnded && !devMode;

  return (
    <ReviewContext.Provider value={value}>
      {children}
      {active && <ReviewUI />}
      {showEnded && <ReviewEnded />}
    </ReviewContext.Provider>
  );
}

export function useReview() {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error('useReview must be used inside <ReviewProvider>');
  return ctx;
}
