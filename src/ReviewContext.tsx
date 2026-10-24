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
  /** Feature is allowed on this host AND switched on (env flag or magic-link token). */
  active: boolean;
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
  togglePinMode: () => void;
  addPin: (pin: Pin) => void;
  updatePin: (id: string, note: string) => void;
  removePin: (id: string) => void;
  isComplete: boolean;
  requireComplete: boolean;
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
   * Optional shared secret for the magic link. When set, only `?review=<token>`
   * unlocks the feature; when unset, any non-empty `?review=` value unlocks it.
   */
  token?: string;
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
  token,
  siteName = 'this website',
  pages,
  onSubmit,
  options,
}: ReviewProviderProps) {
  const {
    allowedHostSuffix = '.crownwebdesign.com',
    allowLocalhost = true,
    tokenParam = 'review',
    storageKey = 'site-review',
    requireComplete = false,
  } = options ?? {};

  const pathname = usePathname();
  const declaredPages = useMemo(() => pages ?? [], [pages]);

  const [mounted, setMounted] = useState(false);
  const [hostAllowed, setHostAllowed] = useState(false);
  const [tokenUnlocked, setTokenUnlocked] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [visitedPages, setVisitedPages] = useState<string[]>([]);
  const [devMode, setDevMode] = useState(false);
  const [snapshotMeta, setSnapshotMeta] = useState<{ submittedAt: string } | null>(null);
  // Set synchronously (before dispatching LOAD) so persist effects never write
  // a hydrated snapshot over the reviewer's own stored data.
  const devModeRef = useRef(false);

  const [state, dispatch] = useReducer(reducer, {
    sections: {},
    pins: [],
    activeModalId: null,
  });

  const unlockKey = `${storageKey}:unlocked`;
  const modeKey = `${storageKey}:mode`;
  const visitedKey = `${storageKey}:visited`;
  const pinsKey = `${storageKey}:pins`;

  // Mount: resolve host, process the magic-link token, restore persisted flags + data.
  useEffect(() => {
    setMounted(true);
    setHostAllowed(isHostAllowed(allowedHostSuffix, allowLocalhost));

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has(tokenParam)) {
        const value = params.get(tokenParam) ?? '';
        if (value === 'off') {
          localStorage.removeItem(unlockKey);
        } else if (token ? value === token : value.length > 0) {
          localStorage.setItem(unlockKey, '1');
        }
        // Tidy the URL so the token isn't left lying around.
        params.delete(tokenParam);
        const qs = params.toString();
        window.history.replaceState(
          {},
          '',
          window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
        );
      }
      setTokenUnlocked(localStorage.getItem(unlockKey) === '1');
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

      // Developer snapshot link: #review=<compressed>&role=dev
      const hash = window.location.hash.replace(/^#/, '');
      const hp = new URLSearchParams(hash);
      if (hp.get('role') === 'dev' && hp.get('review')) {
        const decoded = LZString.decompressFromEncodedURIComponent(hp.get('review') as string);
        const snap = decoded ? (JSON.parse(decoded) as ReviewSnapshot) : null;
        if (snap) {
          devModeRef.current = true; // guard persistence BEFORE dispatching
          dispatch({
            type: 'LOAD',
            sections: Object.fromEntries((snap.sections ?? []).map((s) => [s.id, s])),
          });
          dispatch({ type: 'LOAD_PINS', pins: snap.pins ?? [] });
          setDevMode(true);
          setReviewMode(true);
          setSnapshotMeta({ submittedAt: snap.submittedAt });
        }
      }
    } catch {
      // Ignore storage/URL errors — feature simply stays locked.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = mounted && hostAllowed && (enabled || tokenUnlocked || devMode);

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

  // Persist section data whenever it changes. Never in dev view — a hydrated
  // snapshot must not overwrite the reviewer's own stored data.
  useEffect(() => {
    if (!mounted || devModeRef.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.sections));
    } catch {
      // ignore
    }
  }, [state.sections, storageKey, mounted]);

  // Persist pins whenever they change (skipped in dev view).
  useEffect(() => {
    if (!mounted || devModeRef.current) return;
    try {
      localStorage.setItem(pinsKey, JSON.stringify(state.pins));
    } catch {
      // ignore
    }
  }, [state.pins, pinsKey, mounted]);

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
  const exitDevView = useCallback(() => {
    // Drop the snapshot hash and reload so normal (persisted) state returns.
    window.location.replace(window.location.pathname + window.location.search);
  }, []);
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
    togglePinMode,
    addPin,
    updatePin,
    removePin,
    isComplete,
    requireComplete,
    siteName,
    submit: onSubmit,
  };

  return (
    <ReviewContext.Provider value={value}>
      {children}
      {active && <ReviewUI />}
    </ReviewContext.Provider>
  );
}

export function useReview() {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error('useReview must be used inside <ReviewProvider>');
  return ctx;
}
