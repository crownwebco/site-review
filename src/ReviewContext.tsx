'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import type {
  SectionState,
  SectionStatus,
  ReviewSubmissionData,
  ReviewOptions,
} from './types';
import { ReviewUI } from './ReviewUI';

export type { SectionState, SectionStatus, ReviewSubmissionData, ReviewOptions };

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
  approveSection: (id: string) => void;
  addComment: (id: string, comment: string) => void;
  activeModalId: string | null;
  openModal: (id: string) => void;
  closeModal: () => void;
  getPageProgress: (page: string) => { reviewed: number; total: number };
  getTotalProgress: () => { reviewed: number; total: number };
  isComplete: boolean;
  requireComplete: boolean;
  siteName: string;
  submit: (
    data: ReviewSubmissionData[],
    additionalComments?: string
  ) => Promise<{ success: boolean; message: string }>;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

type Action =
  | { type: 'LOAD'; sections: Record<string, SectionState> }
  | { type: 'REGISTER'; reg: SectionRegistration }
  | { type: 'APPROVE'; id: string }
  | { type: 'COMMENT'; id: string; comment: string }
  | { type: 'SET_MODAL'; id: string | null };

interface State {
  sections: Record<string, SectionState>;
  activeModalId: string | null;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD':
      return { ...state, sections: action.sections };
    case 'REGISTER': {
      const existing = state.sections[action.reg.id];
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
      return {
        ...state,
        sections: {
          ...state.sections,
          [action.id]: { ...state.sections[action.id], status: 'approved', comment: '' },
        },
      };
    case 'COMMENT':
      return {
        ...state,
        sections: {
          ...state.sections,
          [action.id]: {
            ...state.sections[action.id],
            status: 'commented',
            comment: action.comment,
          },
        },
      };
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
  /** Server action that emails the review. See the package `/server` export. */
  onSubmit: (
    data: ReviewSubmissionData[],
    additionalComments?: string
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

  const [mounted, setMounted] = useState(false);
  const [hostAllowed, setHostAllowed] = useState(false);
  const [tokenUnlocked, setTokenUnlocked] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);

  const [state, dispatch] = useReducer(reducer, {
    sections: {},
    activeModalId: null,
  });

  const unlockKey = `${storageKey}:unlocked`;
  const modeKey = `${storageKey}:mode`;

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
    } catch {
      // Ignore storage/URL errors — feature simply stays locked.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = mounted && hostAllowed && (enabled || tokenUnlocked);

  // Persist section data whenever it changes.
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.sections));
    } catch {
      // ignore
    }
  }, [state.sections, storageKey, mounted]);

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

  const registerSection = useCallback(
    (reg: SectionRegistration) => dispatch({ type: 'REGISTER', reg }),
    []
  );
  const approveSection = useCallback((id: string) => dispatch({ type: 'APPROVE', id }), []);
  const addComment = useCallback(
    (id: string, comment: string) => dispatch({ type: 'COMMENT', id, comment }),
    []
  );
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
    addComment,
    activeModalId: state.activeModalId,
    openModal,
    closeModal,
    getPageProgress,
    getTotalProgress,
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
