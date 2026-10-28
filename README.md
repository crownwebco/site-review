# @crownwebdesign/site-review

Drop-in **client review mode** for Next.js sites. During a review window, the client can walk the site, approve sections or leave per-section feedback, and email you a tidy summary — then you switch it off.

v2 is built for the Crown Web staging workflow:

- **Staging-only by hostname.** The feature only activates on `*.crownwebdesign.com` (your staging domains) or `localhost`. The code can ship to production untouched and stays completely inert there.
- **Dev-controlled, not always-on.** You turn it on for a review period with an env flag and an optional end date; the client has no control. Open/idle tabs self-expire when the window ends.
- **Zero section config.** Mark reviewable blocks with a `data-review="Name"` attribute — no component wrapping, no config array.
- **Pin anywhere.** Beyond tagged sections, the client can drop a pin on *any* spot; each pin records the section it landed in, the page, and the element clicked.
- **Verdicts, not just comments.** Each section gets a verdict — **Approve** or **Request changes** — and a note can ride along with either (so "approve with feedback" is first-class).
- **Developer view.** The submit email includes a one-click link that re-applies the reviewer's exact state (read-only) on the staging site, so you see every verdict and pin in place.
- **Self-contained styling.** All UI is inline-styled. No Tailwind setup, no CSS import, no `transpilePackages`.

## How it works

```
[host is *.crownwebdesign.com or localhost]  AND  [enabled flag]  AND  [within review window]
                               ↓
            a "Review Mode" button appears (bottom-right)
                               ↓
   client enters review mode → every [data-review] element gets a
   border + status badge + approve/comment buttons; a docked panel
   lists every page + tracks progress; the client can also "Drop a pin"
   anywhere → "Send Review" emails you the sections + pinned comments
```

Section status (approved / commented), pins, visited pages, and review-mode on/off all persist in `localStorage`, so the client can review across multiple visits during the window.

## Install

```bash
npm install @crownwebdesign/site-review
```

Peer deps: `next >= 14`, `react >= 18`, `react-dom >= 18`.

## Setup (3 steps)

### 1. Create the submit server action

```ts
// src/lib/actions/review.ts
'use server';

import {
  formatReviewEmail,
  type ReviewSubmissionData,
  type Pin,
} from '@crownwebdesign/site-review/server';

export async function submitReview(
  data: ReviewSubmissionData[],
  additionalComments?: string,
  pins?: Pin[],
  devView?: { url: string; json: string }
): Promise<{ success: boolean; message: string }> {
  // Fail loudly if the key is missing — don't report a false success.
  if (!process.env.EMAIL_SERVICE_API_KEY) {
    return { success: false, message: 'Email is not configured on this environment.' };
  }

  const html = formatReviewEmail(data, 'Client Site', additionalComments, pins, devView);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.EMAIL_SERVICE_API_KEY}`,
    },
    body: JSON.stringify({
      from: `Website Review <${process.env.EMAIL_FROM}>`,
      to: [process.env.REVIEW_EMAIL_TO ?? 'review@crownwebdesign.com'],
      subject: 'Website Review Submitted',
      html,
    }),
  });

  return res.ok
    ? { success: true, message: 'Sent' }
    : { success: false, message: 'Failed to send' };
}
```

### 2. Mount the provider in your root/site layout

```tsx
import { ReviewProvider } from '@crownwebdesign/site-review';
import { submitReview } from '@/lib/actions/review';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <ReviewProvider
      enabled={process.env.NEXT_PUBLIC_REVIEW_ENABLED === 'true'}
      reviewUntil={process.env.NEXT_PUBLIC_REVIEW_UNTIL}
      siteName="Client Site"
      pages={[
        { path: '/', name: 'Home' },
        { path: '/about', name: 'About' },
        { path: '/contact', name: 'Contact' },
      ]}
      onSubmit={submitReview}
    >
      {children}
    </ReviewProvider>
  );
}
```

Nothing renders unless the host is allowed **and** the feature is switched on, so this is safe to leave mounted in production.

**`pages`** (optional) lets the panel show the client *every* page to review up front — unvisited pages appear as "not visited", and their sections populate once the client goes there. It's just `{ path, name }` per page (no sections — those still come from `data-review`), and it's additive: a visited page you didn't list still shows up. Omit it to fall back to listing only pages the client has visited.

### 3. Mark reviewable sections

Add `data-review="Label"` to any element. No import, no config.

```tsx
<section data-review="Hero">…</section>
<section data-review="Services">…</section>
```

Optional attributes:

| Attribute | Default | Purpose |
|-----------|---------|---------|
| `data-review` | — | Section label (required) |
| `data-review-id` | slug of `page + label` | Stable id if the label isn't unique |
| `data-review-page` | first path segment (`/` → `home`) | Group sections under a page |
| `data-review-page-name` | humanized page key | Page label in the panel/email |

## Turning it on for a review period

Reviewer access is **entirely developer-controlled** via env vars — the client can't start, extend, or end it:

- **`NEXT_PUBLIC_REVIEW_ENABLED`** — set to `"true"` in the **staging** environment to turn review mode on (needs a redeploy to flip). This is the master on/off.
- **`NEXT_PUBLIC_REVIEW_UNTIL`** — an **MM-DD-YYYY** end date (interpreted as end of that day, **Mountain Time**). A client-side timer enforces it live, so a tab left open self-disables and shows a "review period has ended" notice the moment the date passes — no refresh needed.

To run a review: set both env vars on staging, redeploy, and send the client the plain staging URL (a trailing `?review` is fine — it's inert; its only purpose is giving you a tidy link to send that lands them on a fresh tab). When the window ends, review mode disappears and the reviewer's locally-stored data is wiped. Flip `NEXT_PUBLIC_REVIEW_ENABLED=false` afterward for the hard cutoff on new loads.

There is **no client-side activation** — opening any link when the flag is off (or the date has passed) shows nothing. (The separate *developer* snapshot link below is unaffected and persists.)

## Developer view

When the client hits **Send Review**, the email includes an **"Open developer view"** link (and a raw-JSON fallback). Open it on the staging site and you get a **read-only** view of their exact submission:

- Overlays show each section's verdict with **no edit buttons**; click a badge (or hover for a tooltip) to read its note inline.
- A dashboard lists every verdict and pin. On the page you're currently viewing, dashboard items are **clickable anchors** that scroll to the section/pin; items on other pages are shown but not clickable (navigate to that page first).
- The dev session is held in memory and never written to the reviewer's section/pin storage, so it can't clobber their data. The browser *does* remember it's the **developer** (role + snapshot persisted separately), so **Hide** collapses the dashboard but keeps you in developer mode — the floating button becomes **"Developer View"** and re-opens it. **"Leave developer mode"** forgets the role and returns the browser to the reviewer experience.

> Because pins are positioned by coordinates, the developer view is faithful only while staging matches what the client reviewed — so **freeze staging deploys during the review window** and resume once they've submitted.

## Environment variables (consuming site)

Set these in the site's Vercel project (or `.env.local` for local dev):

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_REVIEW_ENABLED` | **Staging/Preview** | `"true"` turns review mode on. Read it in your layout and pass to `enabled`. |
| `NEXT_PUBLIC_REVIEW_UNTIL` | Staging/Preview (optional) | Review end date, **MM-DD-YYYY** (end of day, Mountain Time). Pass to `reviewUntil`. Open tabs self-expire when it passes. |
| `EMAIL_SERVICE_API_KEY` | **Production + Preview** | Resend API key used by your submit action. ⚠️ **Must include Preview**, or submits on staging silently fail — scope it to Production only and the key is absent on staging. |
| `EMAIL_FROM` | Production + Preview | Verified sender address for the review email. |
| `REVIEW_EMAIL_TO` | Production + Preview (optional) | Where review emails are sent (defaults to `review@crownwebdesign.com`). |

Env vars apply per-environment at **build time** and only to builds that run **after** they're set — so after changing one, redeploy. A Preview-scoped var covers every preview branch regardless of when the branch was created.

## Per-project setup checklist

1. `npm install @crownwebdesign/site-review`.
2. Create the submit server action (step 1 above) — keep the missing-key guard so failures are visible.
3. Mount `<ReviewProvider>` in your site layout with `enabled`, `onSubmit`, `siteName`, and `pages`.
4. Add `data-review="…"` to the sections you want reviewable.
5. Set the env vars above in Vercel (mind the `EMAIL_SERVICE_API_KEY` Preview scope).
6. Confirm the staging host matches `allowedHostSuffix` (default `.crownwebdesign.com`), or override it in `options`.
7. To run a review: set `NEXT_PUBLIC_REVIEW_ENABLED=true` and `NEXT_PUBLIC_REVIEW_UNTIL=MM-DD-YYYY` on staging, redeploy, and send the client the plain staging URL. Freeze staging deploys while they review; flip the flag off when done.

## API

### `<ReviewProvider>`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `enabled` | `boolean` | `false` | Your env flag. Feature still requires an allowed host. |
| `reviewUntil` | `string` | — | Review end date `MM-DD-YYYY` (end of day, Mountain Time). Open tabs self-expire past it. |
| `siteName` | `string` | `'this website'` | Shown in the panel + email. |
| `pages` | `{ path, name }[]` | — | Pages to show in the panel up front (see above). |
| `onSubmit` | `(data, additionalComments?, pins?) => Promise<{success,message}>` | — | Your server action. The 3rd arg is the pinned comments. |
| `options` | `ReviewOptions` | see below | Tunables. |

### `ReviewOptions`

| Option | Default | Purpose |
|--------|---------|---------|
| `allowedHostSuffix` | `'.crownwebdesign.com'` | Hostname suffix that activates the feature. |
| `allowLocalhost` | `true` | Also activate on localhost for dev. |
| `storageKey` | `'site-review'` | localStorage namespace. |
| `requireComplete` | `false` | Require every section reviewed before submit. |
| `maxCommentLength` | `500` | Max characters for any feedback field (section note, "anything else", pin note). |

### `ReviewSubmissionData`

Each submitted section: `{ id, page, name, status, comment, deviceType?, url?, viewport? }`. `page` is the page label; `status` is `'unreviewed' | 'approved' | 'commented'`. v2 also captures device type, URL, and viewport at submit time.

## Versioning

Semver. v2 is a breaking redesign (no more `ReviewSection`/`ReviewControls`/`SectionDef` config — use `data-review` attributes). Pin with `npm install @crownwebdesign/site-review@^2`.

- **2.1.0** — adds the `pages` prop (up-front page list in the panel) and pin-a-comment, plus always-visible approve/comment buttons, approve-as-toggle, expandable pages, and a fix for the comment box resetting while typing. Non-breaking; the `onSubmit` 3rd arg (`pins`) is optional.
- **2.2.0** — verdict model (`SectionStatus` is now `unreviewed | approved | changes`; a note can accompany an approval = "approve with feedback"); developer snapshot view (submit email carries a `#review=…&role=dev` deep link → read-only dashboard on staging); `onSubmit` gains an optional 4th arg `devView` (`{ url, json }`) to forward into `formatReviewEmail`. If you persisted `'commented'` anywhere, it's now `'changes'`.
- **2.3.0** — developer-view polish: overlay badges reveal the note inline (tooltip + click); dashboard sections/pins on the current page are clickable anchors that scroll to them. Non-breaking.
- **2.4.0** — `maxCommentLength` option (default 500) caps all feedback fields with a counter; the dev-view note bubble is wider with a scroll cap; the developer role now persists on the browser (Hide keeps it, "Leave developer mode" clears it) so you can exit/re-enter without dropping back to the reviewer view. Non-breaking.
- **2.4.1** — fix: section overlays lagged/floated during scroll and snapped back on stop. They now use document-coordinate absolute positioning (like pins) and scroll natively — no per-scroll re-render.
- **2.5.0** — reviewer activation is now fully developer-controlled via env vars; the client-side `?review` magic link is removed (`token`/`tokenParam` props gone). Adds `reviewUntil` (MM-DD-YYYY end date, Mountain Time) with a live client-side timer that expires open tabs and shows an "ended" notice; reviewer localStorage is wiped when the flag is off or the window has passed. Developer snapshot link is unchanged.

## Working on this package

```bash
npm run typecheck   # tsc --noEmit
npm run build       # emit dist/ (JS + .d.ts), preserves per-file 'use client'
```

The build uses `tsc` (not a bundler) so each client module keeps its own `'use client'` directive and Next's RSC handling works without extra config.
