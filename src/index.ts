// Client component — mount once in your root/site layout.
export { ReviewProvider } from './ReviewContext';
export type { ReviewProviderProps } from './ReviewContext';

// Types — safe to import anywhere (TypeScript strips them at runtime).
export type {
  SectionState,
  SectionStatus,
  ReviewSubmissionData,
  ReviewOptions,
  ReviewPage,
} from './types';

// Note: for the server action helper, import from '@crownwebdesign/site-review/server':
//   import { formatReviewEmail, type ReviewSubmissionData } from '@crownwebdesign/site-review/server'
