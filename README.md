# @crownwebdesign/site-review

Drop-in **client review mode** for Next.js sites. During a review window, the client can walk the site, approve sections or leave per-section feedback, and email you a tidy summary — then you switch it off.

v2 is built for the Crown Web staging workflow:

- **Staging-only by hostname.** The feature only activates on `*.crownwebdesign.com` (your staging domains) or `localhost`. The code can ship to production untouched and stays completely inert there.
- **Dev-triggered, not always-on.** You turn it on for a review period with an env flag and/or a magic link, and turn it off when you're done.
- **Zero section config.** Mark reviewable blocks with a `data-review="Name"` attribute — no component wrapping, no config array.
- **Pin anywhere.** Beyond tagged sections, the client can drop a pin on *any* spot; each pin records the section it landed in, the page, and the element clicked.
- **Verdicts, not just comments.** Each section gets a verdict — **Approve** or **Request changes** — and a note can ride along with either (so "approve with feedback" is first-class).
- **Developer view.** The submit email includes a one-click link that re-applies the reviewer's exact state (read-only) on the staging site, so you see every verdict and pin in place.
- **Self-contained styling.** All UI is inline-styled. No Tailwind setup, no CSS import, no `transpilePackages`.

## How it works

```
[host is *.crownwebdesign.com or localhost]  AND  [enabled flag OR ?review=<token>]
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
      token={process.env.NEXT_PUBLIC_REVIEW_TOKEN}
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

Two independent switches — either one (combined with an allowed host) activates it:

- **Env flag** — set `NEXT_PUBLIC_REVIEW_ENABLED=true` in the **staging** environment (e.g. Vercel → Staging env). On for every visitor until you set it back / remove it (needs a redeploy to flip).
- **Magic link** — send the client `https://client.crownwebdesign.com/?review=<token>`. It unlocks on that browser and persists until `?review=off`. If you set the `token` prop, the value must match; otherwise any non-empty value works. The param is stripped from the URL after it's read.

## Developer view

When the client hits **Send Review**, the email includes an **"Open developer view"** link (and a raw-JSON fallback). Open it on the staging site and you get a **read-only** view of their exact submission:

- Overlays show each section's verdict with **no edit buttons**; click a badge (or hover for a tooltip) to read its note inline.
- A dashboard lists every verdict and pin. On the page you're currently viewing, dashboard items are **clickable anchors** that scroll to the section/pin; items on other pages are shown but not clickable (navigate to that page first).
- It's **ephemeral** — hydrated from the link into memory, never written to the visitor's storage, so it can't clobber anyone's data. **Exit** returns to normal.

> Because pins are positioned by coordinates, the developer view is faithful only while staging matches what the client reviewed — so **freeze staging deploys during the review window** and resume once they've submitted.

## Environment variables (consuming site)

Set these in the site's Vercel project (or `.env.local` for local dev):

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_REVIEW_ENABLED` | **Staging/Preview** | `"true"` turns the feature on. Read it in your layout and pass to `enabled`. |
| `NEXT_PUBLIC_REVIEW_TOKEN` | Staging/Preview (optional) | Secret for the `?review=<token>` magic link. Pass to `token`. |
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
7. Flip `NEXT_PUBLIC_REVIEW_ENABLED=true` on staging for the review window; freeze staging deploys while the client reviews.

## API

### `<ReviewProvider>`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `enabled` | `boolean` | `false` | Your env flag. Feature still requires an allowed host. |
| `token` | `string` | — | Shared secret for the `?review=` magic link. |
| `siteName` | `string` | `'this website'` | Shown in the panel + email. |
| `pages` | `{ path, name }[]` | — | Pages to show in the panel up front (see above). |
| `onSubmit` | `(data, additionalComments?, pins?) => Promise<{success,message}>` | — | Your server action. The 3rd arg is the pinned comments. |
| `options` | `ReviewOptions` | see below | Tunables. |

### `ReviewOptions`

| Option | Default | Purpose |
|--------|---------|---------|
| `allowedHostSuffix` | `'.crownwebdesign.com'` | Hostname suffix that activates the feature. |
| `allowLocalhost` | `true` | Also activate on localhost for dev. |
| `tokenParam` | `'review'` | Query param for the magic link. |
| `storageKey` | `'site-review'` | localStorage namespace. |
| `requireComplete` | `false` | Require every section reviewed before submit. |

### `ReviewSubmissionData`

Each submitted section: `{ id, page, name, status, comment, deviceType?, url?, viewport? }`. `page` is the page label; `status` is `'unreviewed' | 'approved' | 'commented'`. v2 also captures device type, URL, and viewport at submit time.

## Versioning

Semver. v2 is a breaking redesign (no more `ReviewSection`/`ReviewControls`/`SectionDef` config — use `data-review` attributes). Pin with `npm install @crownwebdesign/site-review@^2`.

- **2.1.0** — adds the `pages` prop (up-front page list in the panel) and pin-a-comment, plus always-visible approve/comment buttons, approve-as-toggle, expandable pages, and a fix for the comment box resetting while typing. Non-breaking; the `onSubmit` 3rd arg (`pins`) is optional.
- **2.2.0** — verdict model (`SectionStatus` is now `unreviewed | approved | changes`; a note can accompany an approval = "approve with feedback"); developer snapshot view (submit email carries a `#review=…&role=dev` deep link → read-only dashboard on staging); `onSubmit` gains an optional 4th arg `devView` (`{ url, json }`) to forward into `formatReviewEmail`. If you persisted `'commented'` anywhere, it's now `'changes'`.
- **2.3.0** — developer-view polish: overlay badges reveal the note inline (tooltip + click); dashboard sections/pins on the current page are clickable anchors that scroll to them. Non-breaking.

## Working on this package

```bash
npm run typecheck   # tsc --noEmit
npm run build       # emit dist/ (JS + .d.ts), preserves per-file 'use client'
```

The build uses `tsc` (not a bundler) so each client module keeps its own `'use client'` directive and Next's RSC handling works without extra config.
