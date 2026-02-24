# @crownwebdesign/site-review

A drop-in client review tool for Next.js + Tailwind CSS websites. Let your clients enter "Review Mode" to browse the site, approve sections they're happy with, and leave feedback on anything they'd like changed. When every section has been reviewed, the complete summary is emailed directly to you.

---

## How it works

- A **"Review Mode"** button floats at the bottom-right of every page
- Clicking it reveals **colored borders** around each section:
  - Blue dashed = not yet reviewed
  - Green solid = approved
  - Amber solid = has feedback
- **Hovering over a section** shows two action buttons:
  - **Green checkmark** — marks the section as approved
  - **Amber pencil** — opens a modal to type feedback
- A **progress panel** tracks how many sections have been reviewed on each page and in total
- All progress is **saved in `localStorage`** — the client can close the tab and pick up where they left off
- Once every section is reviewed, a **"Send Review to Developer"** button activates and emails you the full summary

---

## Prerequisites

- Next.js 14 or 15
- Tailwind CSS 3.x
- TypeScript

---

## Installation

### 1. Install the package

```bash
npm install github:crownwebco/site-review
```

### 2. Tell Next.js to compile the package source

Add `transpilePackages` to your `next.config.js`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@crownwebdesign/site-review'],
  // ...rest of your config
};

module.exports = nextConfig;
```

### 3. Tell Tailwind to scan the package for class names

Add one entry to the `content` array in your `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    // Add this line:
    './node_modules/@crownwebdesign/site-review/src/**/*.tsx',
  ],
  // ...rest of your config
};

export default config;
```

---

## Setup (four steps, do this once per project)

### Step 1 — Define your sections

Create `src/config/reviewSections.ts`. Each entry maps to one `<ReviewSection>` wrapper in your pages.

```ts
import type { SectionDef } from '@crownwebdesign/site-review';

export const REVIEW_SECTIONS: SectionDef[] = [
  // Home page  (page: 'home' matches the '/' route via the homePageId prop)
  { id: 'home-hero',         page: 'home',     pageName: 'Home',     name: 'Hero' },
  { id: 'home-features',     page: 'home',     pageName: 'Home',     name: 'Features' },
  { id: 'home-cta',          page: 'home',     pageName: 'Home',     name: 'Call to Action' },

  // About page  (page: 'about' matches the '/about' route)
  { id: 'about-hero',        page: 'about',    pageName: 'About',    name: 'Hero' },
  { id: 'about-story',       page: 'about',    pageName: 'About',    name: 'Our Story' },
  { id: 'about-cta',         page: 'about',    pageName: 'About',    name: 'Call to Action' },

  // Services page
  { id: 'services-hero',     page: 'services', pageName: 'Services', name: 'Hero' },
  { id: 'services-grid',     page: 'services', pageName: 'Services', name: 'Services Grid' },
  { id: 'services-cta',      page: 'services', pageName: 'Services', name: 'Call to Action' },

  // Contact page
  { id: 'contact-hero',      page: 'contact',  pageName: 'Contact',  name: 'Hero' },
  { id: 'contact-form',      page: 'contact',  pageName: 'Contact',  name: 'Contact Form' },
];
```

**Rules:**
- `id` must be unique across all sections
- `page` must match the URL segment (`'about'` for `/about`, `'services'` for `/services`, etc.)
- Use `'home'` (or a custom string) for the `/` route — see `homePageId` prop below

### Step 2 — Create the submit server action

Create `src/lib/actions/submitReview.ts`. Copy this template and fill in your email address:

```ts
'use server';

import {
  formatReviewEmail,
  type ReviewSubmissionData,
} from '@crownwebdesign/site-review/server';

export async function submitReview(
  data: ReviewSubmissionData[]
): Promise<{ success: boolean; message: string }> {
  const reviewed = data.filter((s) => s.status !== 'unreviewed').length;
  const commented = data.filter((s) => s.status === 'commented').length;
  const subject = `Website Review — ${reviewed}/${data.length} sections reviewed, ${commented} with feedback`;

  const html = formatReviewEmail(data, 'Your Client Site Name');

  // If EMAIL_SERVICE_API_KEY isn't configured, log to console and return success
  // so the client still sees a confirmation. See Step 5 for email setup.
  if (!process.env.EMAIL_SERVICE_API_KEY) {
    console.log('=== REVIEW SUBMITTED (email not configured) ===');
    console.log(subject);
    data.forEach((s) => {
      if (s.status !== 'unreviewed') {
        console.log(`  [${s.status.toUpperCase()}] ${s.page} › ${s.name}${s.comment ? ': ' + s.comment : ''}`);
      }
    });
    return { success: true, message: 'Review recorded.' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.EMAIL_SERVICE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Website Review <onboarding@resend.dev>',
      to: ['review@crownwebdesign.com'],  // ← update this
      subject,
      html,
    }),
  });

  if (!response.ok) {
    console.error('Resend error:', await response.text());
    return { success: false, message: 'Failed to send. Please try again.' };
  }

  return { success: true, message: 'Review sent!' };
}
```

> **Note:** `from: 'onboarding@resend.dev'` works on Resend's free plan without domain verification. Once you've verified your domain in Resend, switch it to something like `from: 'Website Review <noreply@crownwebdesign.com>'`.

### Step 3 — Add the provider and controls to your layout

Wrap your root layout with `ReviewProvider` and add `ReviewControls` inside it:

```tsx
// src/app/layout.tsx
import { ReviewProvider, ReviewControls } from '@crownwebdesign/site-review';
import { REVIEW_SECTIONS } from '@/config/reviewSections';
import { submitReview } from '@/lib/actions/submitReview';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ReviewProvider
          sections={REVIEW_SECTIONS}
          storageKey="client-name-review"
          homePageId="home"
        >
          <Header />
          <main>{children}</main>
          <Footer />
          <ReviewControls
            onSubmit={submitReview}
            siteName="Client Site Name"
          />
        </ReviewProvider>
      </body>
    </html>
  );
}
```

**`ReviewProvider` props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `sections` | `SectionDef[]` | required | All reviewable sections — import from your config file |
| `storageKey` | `string` | `'site-review-data'` | localStorage key. Use something project-specific like `'acme-co-review'` to avoid conflicts |
| `homePageId` | `string` | `'home'` | The `page` value you used for your home page sections |

**`ReviewControls` props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSubmit` | `(data) => Promise<{success, message}>` | required | Your server action from Step 2 |
| `siteName` | `string` | `'this website'` | Project name shown in the submission confirmation modal |

### Step 4 — Wrap your page sections

Import `ReviewSection` and wrap each section. The `id` must exactly match one in your `REVIEW_SECTIONS` config.

```tsx
// src/app/page.tsx
import { ReviewSection } from '@crownwebdesign/site-review';

export default function HomePage() {
  return (
    <>
      <ReviewSection id="home-hero">
        <section className="...">
          {/* hero content */}
        </section>
      </ReviewSection>

      <ReviewSection id="home-features">
        <Features />
      </ReviewSection>

      <ReviewSection id="home-cta">
        <CTA />
      </ReviewSection>
    </>
  );
}
```

`ReviewSection` is a transparent pass-through when review mode is off — it renders nothing extra in production.

---

## Email setup (Resend)

The server action template uses [Resend](https://resend.com), which has a generous free tier (3,000 emails/month, no credit card required).

1. Sign up at [resend.com](https://resend.com) and copy your API key
2. Add it to `.env.local` in the project:
   ```
   EMAIL_SERVICE_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   ```
3. Without the key, reviews log to your terminal console and still show a success confirmation to the client (useful during development)

---

## Removing after the review is done

Once the client has completed their review and you've made their requested changes, removing the tool is a clean four-step process:

**1. Uninstall the package**
```bash
npm uninstall @crownwebdesign/site-review
```

**2. Update `next.config.js`** — remove the `transpilePackages` entry

**3. Update `tailwind.config.ts`** — remove the `node_modules/...` content entry

**4. Delete the three project files you added:**
```bash
rm src/config/reviewSections.ts
rm src/lib/actions/submitReview.ts
```

**5. Remove from your layout** — delete the `ReviewProvider` wrapper and `ReviewControls` from `layout.tsx`

**6. Remove `<ReviewSection>` wrappers from pages**
```bash
# Find all usages quickly:
grep -r "ReviewSection" src/
```
Each `<ReviewSection id="...">` wrapper can be deleted — just keep the children inside.

> **Tip:** Because `ReviewSection` is a transparent pass-through when review mode is off, you can leave the wrappers in place on a staging branch without any visual impact. Remove them only when merging to your final production branch.

---

## Updating the package

To pull in updates from GitHub:

```bash
npm install github:crownwebdesign/site-review
```

This always installs the latest commit on the default branch. To pin to a specific version, use a tag:

```bash
npm install github:crownwebdesign/site-review#v1.1.0
```

To create a version tag after making changes:

```bash
git tag v1.1.0
git push origin v1.1.0
```

---

## Working on this package

Since the package ships TypeScript source directly (no build step), editing it is straightforward:

```bash
cd ~/mydev/site-review
npm install    # only needed for IDE type checking
```

Your editor will provide full TypeScript autocomplete and error checking. After pushing changes to GitHub, reinstall in any consuming project:

```bash
npm install github:crownwebdesign/site-review
```

---

## File structure

```
src/
├── types.ts           Pure TypeScript types — no React, no 'use client'
├── formatEmail.ts     HTML email generator — safe to import in server actions
├── server.ts          Server-safe barrel export (use this in server actions)
├── ReviewContext.tsx  Global state, localStorage persistence, progress tracking
├── ReviewSection.tsx  Section wrapper with borders and action buttons
├── ReviewControls.tsx Floating panel, comment modal, submit modal
└── index.ts           Main barrel export for client-side usage
```

---

## Publishing to GitHub

Initial setup for a new repo:

```bash
cd ~/mydev/site-review
git init
git add .
git commit -m "Initial release"
git remote add origin git@github.com:crownwebdesign/site-review.git
git push -u origin main
```

Replace `crownwebdesign` with your actual GitHub username.
