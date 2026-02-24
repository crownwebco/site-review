/**
 * Server-safe exports for use in Next.js server actions and API routes.
 *
 * Import from this path to avoid pulling client components into your server bundle:
 *   import { formatReviewEmail, type ReviewSubmissionData } from '@crownwebdesign/site-review/server'
 */
export { formatReviewEmail } from './formatEmail';
export type { ReviewSubmissionData, SectionDef, SectionStatus } from './types';
