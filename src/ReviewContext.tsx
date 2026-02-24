'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import type { SectionDef, SectionState, SectionStatus, ReviewSubmissionData } from './types';

export type { SectionDef, SectionState, SectionStatus, ReviewSubmissionData };

interface ReviewContextValue {
  isReviewMode: boolean;
  sections: Record<string, SectionState>;
  activeModalId: string | null;
  allPages: string[];
  toggleReviewMode: () => void;
  approveSection: (id: string) => void;
  addComment: (id: string, comment: string) => void;
  openModal: (id: string) => void;
  closeModal: () => void;
  getPageProgress: (page: string) => { reviewed: number; total: number };
  getTotalProgress: () => { reviewed: number; total: number };
  getPageName: (pageId: string) => string;
  getCurrentPage: (pathname: string) => string;
  isComplete: boolean;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

type Action =
  | { type: 'TOGGLE_REVIEW_MODE' }
  | { type: 'APPROVE'; id: string }
  | { type: 'COMMENT'; id: string; comment: string }
  | { type: 'SET_MODAL'; id: string | null }
  | { type: 'LOAD'; sections: Record<string, SectionState> };

interface State {
  isReviewMode: boolean;
  sections: Record<string, SectionState>;
  activeModalId: string | null;
}

function initSections(defs: SectionDef[]): Record<string, SectionState> {
  return Object.fromEntries(
    defs.map((d) => [d.id, { ...d, status: 'unreviewed' as SectionStatus, comment: '' }])
  );
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'TOGGLE_REVIEW_MODE':
      return { ...state, isReviewMode: !state.isReviewMode };
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
    case 'LOAD':
      return { ...state, sections: action.sections };
    default:
      return state;
  }
}

export interface ReviewProviderProps {
  children: React.ReactNode;
  /** All reviewable sections on the site. Define once and share across your layout and pages. */
  sections: SectionDef[];
  /**
   * Unique localStorage key for this project.
   * Use something like "client-name-review" to avoid collisions between projects.
   * @default 'site-review-data'
   */
  storageKey?: string;
  /**
   * The page ID used when the pathname is '/'.
   * Must match the `page` field you used for your home page sections.
   * @default 'home'
   */
  homePageId?: string;
}

export function ReviewProvider({
  children,
  sections: sectionDefs,
  storageKey = 'site-review-data',
  homePageId = 'home',
}: ReviewProviderProps) {
  const [state, dispatch] = useReducer(reducer, {
    isReviewMode: false,
    sections: initSections(sectionDefs),
    activeModalId: null,
  });

  const allPages = useMemo(
    () => [...new Set(sectionDefs.map((s) => s.page))],
    [sectionDefs]
  );

  // Load persisted statuses from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const stored = JSON.parse(raw) as Record<
        string,
        { status: SectionStatus; comment: string }
      >;
      const sections = initSections(sectionDefs);
      for (const id of Object.keys(stored)) {
        if (sections[id] && stored[id]?.status) {
          sections[id].status = stored[id].status;
          sections[id].comment = stored[id].comment ?? '';
        }
      }
      dispatch({ type: 'LOAD', sections });
    } catch {
      // Ignore storage errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist statuses to localStorage whenever they change
  useEffect(() => {
    try {
      const data = Object.fromEntries(
        Object.entries(state.sections).map(([id, s]) => [
          id,
          { status: s.status, comment: s.comment },
        ])
      );
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // Ignore storage errors
    }
  }, [state.sections, storageKey]);

  const toggleReviewMode = useCallback(() => dispatch({ type: 'TOGGLE_REVIEW_MODE' }), []);
  const approveSection = useCallback(
    (id: string) => dispatch({ type: 'APPROVE', id }),
    []
  );
  const addComment = useCallback(
    (id: string, comment: string) => dispatch({ type: 'COMMENT', id, comment }),
    []
  );
  const openModal = useCallback((id: string) => dispatch({ type: 'SET_MODAL', id }), []);
  const closeModal = useCallback(() => dispatch({ type: 'SET_MODAL', id: null }), []);

  const getPageProgress = useCallback(
    (page: string) => {
      const pageSections = sectionDefs.filter((s) => s.page === page);
      const reviewed = pageSections.filter(
        (s) => state.sections[s.id]?.status !== 'unreviewed'
      ).length;
      return { reviewed, total: pageSections.length };
    },
    [sectionDefs, state.sections]
  );

  const getTotalProgress = useCallback(() => {
    const reviewed = Object.values(state.sections).filter(
      (s) => s.status !== 'unreviewed'
    ).length;
    return { reviewed, total: sectionDefs.length };
  }, [sectionDefs, state.sections]);

  const getPageName = useCallback(
    (pageId: string) => {
      const match = sectionDefs.find((s) => s.page === pageId);
      return (
        match?.pageName ?? pageId.charAt(0).toUpperCase() + pageId.slice(1)
      );
    },
    [sectionDefs]
  );

  const getCurrentPage = useCallback(
    (pathname: string): string => {
      if (pathname === '/') return homePageId;
      const segment = pathname.replace(/^\//, '').split('/')[0];
      return allPages.includes(segment) ? segment : homePageId;
    },
    [allPages, homePageId]
  );

  const isComplete = sectionDefs.every(
    (s) => state.sections[s.id]?.status !== 'unreviewed'
  );

  return (
    <ReviewContext.Provider
      value={{
        isReviewMode: state.isReviewMode,
        sections: state.sections,
        activeModalId: state.activeModalId,
        allPages,
        toggleReviewMode,
        approveSection,
        addComment,
        openModal,
        closeModal,
        getPageProgress,
        getTotalProgress,
        getPageName,
        getCurrentPage,
        isComplete,
      }}
    >
      {children}
    </ReviewContext.Provider>
  );
}

export function useReview() {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error('useReview must be used inside <ReviewProvider>');
  return ctx;
}
