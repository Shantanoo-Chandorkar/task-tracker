# Task Tracker

**Author:** Shantanoo Chandorkar

---

## What It Does

Task Tracker is a mobile-first, installable task manager with nested subtasks, inspired by the list view in ClickUp and Linear. Work is organised as **spaces > lists > sublists > tasks**.

- **Home screen** - priority tasks, recent tasks, recent lists and sublists, with quick actions (new task, spaces, search)
- **Nested tasks** - subtasks up to 3 levels deep, grouped by status with collapsible sections
- **Statuses per space** - default To Do / In Progress / Done plus custom statuses with colours
- **Priority** - star a task to float it above the rest of its siblings; a starred parent carries its subtasks with it. Drag reordering works within each tier
- **Drag and drop** - reorder sibling tasks, spaces, lists and sublists
- **Rearrange** - promote a task, or move it anywhere via a searchable destination list
- **Duplicate** - clones a task and its whole subtree (Ctrl+D)
- **Recurring tasks** - daily, weekly, monthly or yearly with custom intervals; a daily cron spawns the next instance
- **Rich-text descriptions** - bold, italic, lists and links (Text + URL dialog), sanitised on the server and again on render
- **Sharing** - request to join a space by ID, the owner approves, and both sides get email notices
- **Search and export** - global search palette (Ctrl/Cmd+K); export a space, list or sublist as CSV or JSON
- **Accounts** - email sign-up with confirmation, login, password reset, and per-IP / per-email lockouts
- **Installable PWA** - offline app shell, and sessions stay signed in for 30 days
- **Guest mode** - a 30-minute, private playground with sample data, so anyone can try the app without signing up (see [Guest mode](#guest-mode))
- **Light / Dark theme**

---

## Tech Stack

| Concern | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | JavaScript (ES2024), Node 22.13+ |
| Styling / UI | Tailwind CSS v4, shadcn/ui on Radix |
| Database and auth | Supabase (PostgreSQL, Row Level Security, Supabase Auth via `@supabase/ssr`) |
| Server state | TanStack Query v5 |
| Drag and drop | @dnd-kit/sortable |
| Rich text | TipTap, sanitised with `xss` |
| Recurrence | rrule + date-fns |
| Email | Brevo SMTP through nodemailer |
| Bot check (guest button) | Cloudflare Turnstile, verified in our own server |
| Testing | Vitest |

---

## Project Structure

```
task-tracker/
├── proxy.js                    # Route gate: login redirects, session cookie refresh, ends expired guests
├── app/
│   ├── (app)/                  # Signed-in pages: Home (/), spaces, lists, tasks, settings
│   ├── (auth)/                 # login, signup, forgot-password, reset-password
│   ├── auth/confirm/route.js   # Email-link verification
│   └── api/                    # tasks, lists, sublists, spaces, statuses, search, export, home, profile,
│                               #   space-collaborators, auth/session (keep-alive), cron/recurrence
├── actions/                    # Server Actions: tasks, lists, sublists, spaces, statuses, collaboration, auth, guest
├── components/                 # ui (shadcn), home, nav, task-list, task-form, task-detail, space, status,
│                               #   auth, guest, export
├── hooks/                      # TanStack Query hooks and small UI hooks
├── lib/
│   ├── auth/                   # session, cookie options, proxy routing rules, rate limits
│   ├── guest/                  # guest config, session helpers, guards, seed data, rate limit, Turnstile check
│   ├── home/                   # Home summary builder
│   ├── supabase/               # server, proxy, admin (secret key) and browser clients
│   ├── email/                  # Brevo sender and notification templates
│   └── tree.js, recurrence.js, fractional-index.js, validation.js ...
├── providers/                  # QueryProvider, UI state
├── public/sw.js                # Service worker (offline shell, cache busting)
├── scripts/                    # verify-bucket*.mjs, verify-guest.mjs, reassign-space-owner.mjs
├── supabase/migrations/        # SQL migrations 0001-0015 (kept locally, not committed: see .gitignore)
└── vercel.json                 # Region and the daily recurrence cron
```

---

## Prerequisites

### 1. Supabase project

Create a project at [supabase.com](https://supabase.com), then run the migrations in `supabase/migrations/` **in order** in the SQL Editor. That folder is listed in `.gitignore`, so it lives on the author's machine and not in the repository.

| Migration | Adds |
|---|---|
| 0001-0004 | Base tables, RLS, spaces and lists, status codes and due dates, sublists |
| 0005-0006 | User profiles (created by a trigger on sign-up) and a backfill |
| 0007-0008 | Space ownership and per-owner RLS, statuses per space (default statuses created by a trigger) |
| 0009, 0012 | `auth_rate_limits` table for sign-in, password-reset and sign-up lockouts |
| 0010-0011 | Sharing (`space_collaborators`) and the fix for a policy recursion |
| 0013 | `tasks.is_prioritised` (the priority star) |
| 0014 | Guest service: `guest_create` rate-limit type and `purge_expired_guests()` on a 10-minute `pg_cron` schedule |
| 0015 | Guest protection: helper functions, restrictive RLS policies, cap and text-limit triggers, conversion block (run it block by block; the rollback is at the bottom of the file) |

Dashboard settings to check (Authentication):

- **Email confirmation:** on. Custom confirmation and reset emails are sent through Brevo by the app.
- **Sessions:** JWT expiry 3600 s, refresh token rotation on with a reuse interval of 10 s or more, and no short time-box or inactivity timeout. Otherwise "stay signed in" cannot work.
- **Anonymous sign-ins:** **on** (guest mode needs it).
- **CAPTCHA protection:** **off**. Supabase's captcha applies to every password login too and would break login. The guest button is protected by our own Turnstile check instead.
- **Rate limits:** lower the "anonymous users per hour per IP" limit from the default (about 10 is reasonable).
- **Extensions:** enable `pg_cron`.

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project URL and publishable key (Project Settings > API). Supabase uses `PUBLISHABLE_KEY`, not the legacy `ANON_KEY` |
| `SUPABASE_SECRET_KEY` | Server-only, bypasses RLS. Used by the admin client, rate limits, the guest seed and the cron. Never `NEXT_PUBLIC_` |
| `CRON_SECRET` | Random string; authenticates `/api/cron/recurrence` |
| `SITE_URL` | App origin for email links. Never taken from request headers |
| `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASS`, `EMAIL_FROM` | Email sending |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile for the guest button. Leave both empty to run without the check. The secret is server-only |

### 3. Cloudflare Turnstile (for the guest button)

1. Cloudflare dashboard > Application security > Turnstile > **Add widget** (manual, not the Spin wizard).
2. Hostnames: your production domain and `localhost` (bare hostnames, no port or slash). Preview deployments have different hostnames and will not show the widget unless added.
3. Widget mode **Managed**. Copy the **Site Key** and **Secret Key** into the two env vars above (Vercel too, then redeploy: `NEXT_PUBLIC_` values are baked in at build time).

---

## Running Locally

```bash
git clone <repo-url>
cd task-tracker
npm install
# create .env.local as above
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test          # unit tests (Vitest)
npm run lint      # ESLint
```

---

## Guest mode

A visitor can click **Try as guest** on the login page and get a private, pre-seeded space (lists, sublists, subtasks, starred and recurring tasks) for **30 minutes**, with no sign-up. The banner says not to enter anything sensitive, because guest data is temporary and not private in the way an account is.

**How it works.** A guest is a Supabase *anonymous user*: a real user row with `is_anonymous = true`, using the normal `authenticated` role. So the existing owner-only RLS already isolates guests from each other and from real users. The guest code lives in `lib/guest/`, `actions/guest-actions.js` and migrations 0014 and 0015; the rest of the app gets small guards that do nothing for registered users.

**Starting a session** (`startGuestSession`): already-signed-in check, then the per-IP limit (**5 attempts per hour**, every attempt counts), then a Cloudflare Turnstile check, then anonymous sign-in, then the sample space is inserted. If seeding fails the half-built guest is deleted.

**Ending a session.** The 30 minutes are fixed from the user's server-set `created_at` (never a browser value):

- the proxy signs an expired guest out and sends them to `/login?reason=guest-expired`
- `getCurrentUser` treats an expired guest as logged out, so every action and API route refuses it
- the database refuses an expired guest's reads and writes even with a still-valid token
- `pg_cron` deletes guests older than 30 minutes every 10 minutes; deleting the user cascades to all their data

**What a guest cannot do**, enforced both in the app and in the database (so calling Supabase directly does not get around it):

| Rule | App | Database (0015) |
|---|---|---|
| Use the app past 30 minutes | proxy, `getCurrentUser`, session route | restrictive RLS policy on every content table |
| Share, request to join, approve, change password | `blockGuestAction` in six server actions | restrictive policy on `space_collaborators` (also blocks requests *to* a guest's space) |
| Create more than 1 space, 3 lists, 6 sublists, 60 tasks, 8 statuses | friendly `GUEST_LIMIT_REACHED` message | `BEFORE INSERT` triggers |
| Store oversized text (names and titles over 200, descriptions over 10000, recurrence rules over 2000 bytes) | app validation | same triggers |
| Turn into a registered account (email, phone, password, identity link) | n/a | trigger on `auth.users` |
| Run the purge function | n/a | execute revoked from every API role |

Limits are defined in `lib/guest/guest-config.js` and repeated in `0015_guest_protection.sql`; the verification script fails if they drift apart.

**Known limits:** guests' data is discarded when they sign up (no migration); the per-IP counter is read-then-write, so a burst can overshoot by a few; a guest could still call Supabase's anonymous sign-in endpoint directly (bounded by Supabase's own per-IP limit, the caps and the purge); the recurrence cron uses the secret key and skips caps (guests' seeded recurring tasks start two days out, so it never spawns for them).

---

## Verification scripts

`scripts/verify-guest.mjs` proves the guest protections against the real database, using throwaway users it creates and deletes itself (no credentials needed):

```bash
node --env-file=.env.local scripts/verify-guest.mjs
node --env-file=.env.local scripts/verify-guest.mjs --with-expiry   # adds the 30-minute and purge checks
```

It checks isolation between guests and real users, every cap and text limit (filling each to the number in `guest-config.js`), sharing and conversion blocks (including the `auth.users` trigger through the admin API), function permissions, that the database session length matches the app, and that registered users are unaffected (no caps, no text limit, sharing and password change still work). `--with-expiry` prints one `UPDATE` to run in the Supabase SQL editor, since the API cannot change `auth.users.created_at`, then verifies an expired guest is locked out and that the purge removes it while leaving live guests and registered users.

The older `verify-bucket1..4.mjs` scripts check the core RLS (ownership, sharing) with real accounts passed as arguments; see the usage line at the top of each. Run them after any change to a policy.

---

## Troubleshooting

**Login says "Invalid email or password" for a correct password**

Supabase's CAPTCHA protection is switched on. It applies to every password login. Turn it off (Authentication > Attack Protection) and rely on the app's own Turnstile check for the guest button. The server log shows `captcha protection: request disallowed (no captcha_token found)`.

**"Try as guest" says too many sessions**

The per-IP limit (5 per hour) was reached. For local testing reset it: `DELETE FROM auth_rate_limits WHERE action_type = 'guest_create';`

**The Turnstile box says "Unable to connect" (error 110200)**

The hostname is not on the widget's list. Add `localhost` (bare) and your production domain in the Cloudflare widget settings.

**A code change does not show up, or an API returns an old shape**

The Next.js dev cache or the service worker is serving an old copy. Stop the dev server, delete the `.next` folder, start it again, then in the browser open DevTools > Application > Service Workers > Unregister and Clear site data (or use a fresh private window).

**Tasks or lists do not load**

Check the two `NEXT_PUBLIC_SUPABASE_*` values, that all migrations were run, and the browser console for the exact Supabase error. With RLS on, a missing policy blocks every read.

**Recurring tasks are not spawning**

The cron runs daily at midnight UTC through Vercel Cron and calls `/api/cron/recurrence` with `Authorization: Bearer <CRON_SECRET>`. Test it locally:

```bash
curl -X GET http://localhost:3000/api/cron/recurrence -H "Authorization: Bearer <your-CRON_SECRET>"
```

**Signed out again and again in the installed app**

Check the Supabase Authentication > Sessions settings from the prerequisites (no short time-box or inactivity timeout, rotation reuse interval of 10 s or more).

**Build fails after pulling changes**

Run `npm install` first (a dependency may have been added), then `npm run build` and read the first error.
