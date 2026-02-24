export type SectionStatus = 'unreviewed' | 'approved' | 'commented';

export interface SectionDef {
  /** Unique identifier — must match the `id` prop on the corresponding <ReviewSection> */
  id: string;
  /** URL path segment for this section's page (e.g. 'home', 'about', 'services') */
  page: string;
  /** Human-readable page name shown in the progress panel (e.g. 'Home', 'About Us') */
  pageName: string;
  /** Human-readable section name shown in badges and the summary email */
  name: string;
}

/** Runtime state for a single section — extends SectionDef with review data */
export interface SectionState extends SectionDef {
  status: SectionStatus;
  comment: string;
}

export interface ReviewSubmissionData {
  id: string;
  page: string;
  name: string;
  status: SectionStatus;
  comment: string;
  deviceType?: 'Mobile' | 'Desktop / Laptop';
}
