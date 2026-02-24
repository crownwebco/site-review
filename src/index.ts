// Components
export { ReviewProvider } from './ReviewContext';
export { ReviewSection } from './ReviewSection';
export { ReviewControls } from './ReviewControls';

// Types — safe to import anywhere (TypeScript strips them at runtime)
export type {
  SectionDef,
  SectionState,
  SectionStatus,
  ReviewSubmissionData,
} from './types';

export type { ReviewProviderProps } from './ReviewContext';
export type { ReviewSectionProps } from './ReviewSection';
export type { ReviewControlsProps } from './ReviewControls';

// Note: for server actions, import from '@crownwebdesign/site-review/server' instead:
//   import { formatReviewEmail, type ReviewSubmissionData } from '@crownwebdesign/site-review/server'
