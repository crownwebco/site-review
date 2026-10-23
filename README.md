# @crownwebdesign/site-review

Drop-in **client review mode** for Next.js sites. During a review window, the client can walk the site, approve sections or leave per-section feedback, and email you a tidy summary — then you switch it off.

v2 is built for the Crown Web staging workflow:

- **Staging-only by hostname.** The feature only activates on `*.crownwebdesign.com` (your staging domains) or `localhost`. The code can ship to production untouched and stays completely inert there.
- **Dev-triggered, not always-on.** You turn it on for a review period with an env flag and/or a magic link, and turn it off when you're done.
- **Zero section config.** Mark reviewable blocks with a `data-review="Name"` attribute — no component wrapping, no config array.
- **Self-contained styling.** All UI is inline-styled. No Tailwind setup, no CSS import, no `transpilePackages`.

## How it works

```
[host is *.crownwebdesign.com or localhost]  AND  [enabled flag OR ?review=<token>]
                               ↓
            a "Review Mode" button appears (bottom-right)
                               ↓
   client enters review mode → every [data-review] element gets a
   border + status badge + approve/comment buttons; a docked panel
   tracks progress per page → "Send Review" emails you the summary
```

Section status (approved / commented) and review-mode on/off persist in `localStorage`, so the client can review across multiple visits during the window.

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

import { formatReviewEmail, type ReviewSubmissionData } from '@crownwebdesign/site-review/server';

export async function submitReview(
  data: ReviewSubmissionData[],
  additionalComments?: string
): Promise<{ success: boolean; message: string }> {
  const html = formatReviewEmail(data, 'Client Site', additionalComments);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.EMAIL_SERVICE_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Website Review <review@crownwebdesign.com>',
      to: ['review@crownwebdesign.com'],
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
      onSubmit={submitReview}
    >
      {children}
    </ReviewProvider>
  );
}
```

Nothing renders unless the host is allowed **and** the feature is switched on, so this is safe to leave mounted in production.

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

## API

### `<ReviewProvider>`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `enabled` | `boolean` | `false` | Your env flag. Feature still requires an allowed host. |
| `token` | `string` | — | Shared secret for the `?review=` magic link. |
| `siteName` | `string` | `'this website'` | Shown in the panel + email. |
| `onSubmit` | `(data, additionalComments?) => Promise<{success,message}>` | — | Your server action. |
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

## Working on this package

```bash
npm run typecheck   # tsc --noEmit
npm run build       # emit dist/ (JS + .d.ts), preserves per-file 'use client'
```

The build uses `tsc` (not a bundler) so each client module keeps its own `'use client'` directive and Next's RSC handling works without extra config.
