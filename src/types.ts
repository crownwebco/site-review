/**
 * A section's verdict. A `comment` can accompany ANY verdict — so 'approved'
 * with a note is "approve with feedback", and 'changes' is "please change this".
 */
export type SectionStatus = 'unreviewed' | 'approved' | 'changes';

/**
 * A reviewable section discovered at runtime from a `data-review` attribute.
 * v2 no longer requires a hand-authored config — sections register themselves.
 */
export interface SectionState {
  /** Stable id: `data-review-id` if present, else a slug of `page + name`. */
  id: string;
  /** Page key derived from the pathname (e.g. 'home', 'about'). */
  page: string;
  /** Human-readable page label for the panel/email (derived or `data-review-page`). */
  pageName: string;
  /** Section label from the `data-review` attribute value. */
  name: string;
  status: SectionStatus;
  comment: string;
}

export interface ReviewSubmissionData {
  id: string;
  /** Page label (grouping key in the email). */
  page: string;
  name: string;
  status: SectionStatus;
  comment: string;
  deviceType?: 'Mobile' | 'Desktop / Laptop';
  /** v2: full URL the section was reviewed on. */
  url?: string;
  /** v2: viewport size at submit time, e.g. "1440x900". */
  viewport?: string;
}

/** A freeform pin the reviewer drops anywhere on the page. */
export interface Pin {
  id: string;
  /** Page key the pin was placed on (e.g. 'home', 'about'). */
  page: string;
  /** Human-readable page label. */
  pageName: string;
  /** Document coordinates (px) where the pin was dropped. */
  x: number;
  y: number;
  /** The reviewable section the pin landed inside, if any. */
  sectionId?: string;
  sectionName?: string;
  /** Short descriptor of the clicked element, e.g. "button · Book Now". */
  target?: string;
  note: string;
}

/**
 * Full review state serialized at submit time. Compressed into the email's
 * developer deep link so the developer can re-apply the reviewer's exact state
 * (read-only) on the frozen staging site.
 */
export interface ReviewSnapshot {
  v: number;
  siteName: string;
  submittedAt: string;
  sections: SectionState[];
  pins: Pin[];
}

/** A page advertised in the panel up front, so the client sees everything to review. */
export interface ReviewPage {
  /** Route path, e.g. '/' or '/about'. */
  path: string;
  /** Display name shown in the panel, e.g. 'Home' or 'About'. */
  name: string;
}

/** Tunable behavior — all optional with sensible defaults. */
export interface ReviewOptions {
  /**
   * Hostname suffix that activates review mode. Every client's staging site is
   * `clientname.crownwebdesign.com`, so the feature stays inert on production
   * and preview hosts even though the code ships there.
   * @default '.crownwebdesign.com'
   */
  allowedHostSuffix?: string;
  /**
   * Also activate on localhost/127.0.0.1 so developers can test locally.
   * @default true
   */
  allowLocalhost?: boolean;
  /**
   * Query param for the magic link. Visiting `?<param>=<token>` unlocks the
   * feature for that browser (persisted); `?<param>=off` clears it.
   * @default 'review'
   */
  tokenParam?: string;
  /**
   * localStorage namespace for this project (section data, unlock, mode).
   * @default 'site-review'
   */
  storageKey?: string;
  /**
   * Require every discovered section to be reviewed before submit enables.
   * @default false
   */
  requireComplete?: boolean;
  /**
   * Max characters for any feedback field (section note, "anything else", pin note).
   * @default 500
   */
  maxCommentLength?: number;
}
