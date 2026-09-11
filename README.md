# Task Tracker

**Author:** Shantanoo Chandorkar

---

## What It Does

Task Tracker is a single-user task management app with unlimited nested subtasks, inspired by the list view in ClickUp and Linear.

Key features:

- **Infinite nesting** - tasks can have subtasks, which can have their own subtasks, with no depth limit (a warning appears at 4+ levels to encourage reorganisation)
- **Status groups** - tasks are grouped by status with collapsible sections; only groups that have tasks are shown
- **Drag and drop** - reorder sibling tasks by dragging
- **Rearrangement** - promote a task to its parent's level, or move it to any valid destination in the tree via a searchable dropdown with breadcrumb paths
- **Duplicate** - clones a task and its whole subtree as a sibling right below it, with a keyboard shortcut (Ctrl+D)
- **Recurring tasks** - configure daily, weekly, monthly, or yearly recurrence with custom intervals and end conditions; a daily cron job spawns new task instances automatically
- **Settings** - create, rename, reorder, and delete statuses with custom colours
- **Light / Dark theme** - toggle from the header

---

## Tech Stack

| Concern | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | JavaScript (ES2024) |
| Styling | Tailwind CSS v4 |
| UI Components | shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Server State | TanStack Query v5 |
| Drag and Drop | @dnd-kit/sortable |
| Recurrence | rrule + date-fns |
| Testing | Vitest + Testing Library |

---

## Project Structure

```
task-tracker/
├── app/
│   ├── layout.js              # Root layout - wraps QueryProvider
│   ├── page.js                # Server Component - SSR fetch, hydrates TanStack Query
│   ├── loading.js             # Suspense skeleton shown while page.js fetches
│   ├── error.js               # Error boundary
│   ├── settings/
│   │   └── page.js            # Status management page
│   └── api/
│       ├── tasks/route.js                  # GET all tasks, POST create
│       ├── tasks/[id]/route.js             # PATCH update, DELETE
│       ├── tasks/[id]/move/route.js        # POST reparent + reposition
│       ├── statuses/route.js               # GET all, POST create
│       ├── statuses/[id]/route.js          # PATCH update, DELETE
│       └── cron/recurrence/route.js        # Daily cron - spawns recurring task instances
│
├── components/
│   ├── task-list/
│   │   ├── TaskList.jsx            # Root list container; groups tasks by status
│   │   ├── TaskRow.jsx             # Recursive row - renders itself and its children
│   │   ├── TaskRowActions.jsx      # Hover action bar: edit, delete, duplicate, move
│   │   ├── DeleteTaskDialog.jsx    # Confirmation dialog with subtask reparent option
│   │   ├── TaskRowInlineAdd.jsx    # Inline subtask creation on Enter
│   │   ├── DepthWarning.jsx        # Amber warning banner at depth 4+
│   │   └── TaskListSkeleton.jsx    # Loading shimmer
│   ├── task-form/
│   │   ├── TaskFormDialog.jsx      # Create / edit modal
│   │   └── RecurrenceBuilder.jsx   # rrule configuration UI
│   ├── status/
│   │   ├── StatusBadge.jsx         # Coloured pill badge
│   │   ├── StatusPicker.jsx        # Inline status dropdown on each row
│   │   └── StatusManager.jsx       # Settings page - full status CRUD
│   └── rearrange/
│       ├── PromoteButton.jsx       # Move task up one level
│       └── ParentDropdown.jsx      # Ancestor select dropdown
│
├── actions/
│   ├── task-actions.js         # Server Actions: create, update, delete, duplicate, reparent-delete
│   └── status-actions.js       # Server Actions: create, update, delete status
│
├── hooks/
│   └── useTaskTree.js          # TanStack Query fetch - returns flat list and nested tree
│
├── lib/
│   ├── tree.js                 # flatToTree, findAncestors, findDescendantIds, recomputeDepth
│   ├── fractional-index.js     # getPositionBetween, rebalancePositions
│   ├── recurrence.js           # rrule wrappers - computeNextOccurrence
│   └── supabase/
│       ├── client.js           # Browser Supabase client
│       ├── server.js           # Server Supabase client (Server Components, Actions, Routes)
│       └── middleware.js       # Middleware Supabase client (reserved for future auth)
│
├── providers/
│   └── QueryProvider.jsx       # TanStack Query client setup
│
└── vercel.json                 # Vercel cron schedule (daily at midnight UTC)
```

---

## Prerequisites

### 1. Supabase project

Create a free project at [supabase.com](https://supabase.com). Once created, run the following SQL in the **SQL Editor**:

```sql
-- Statuses
CREATE TABLE statuses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6b7280',
  is_default  BOOLEAN DEFAULT false,
  code        TEXT UNIQUE, -- 'todo' | 'in_progress' | 'done' for the 3 built-in, non-deletable statuses; NULL for custom ones
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO statuses (name, color, is_default, code, position) VALUES
  ('Pending',     '#6b7280', true,  NULL,           0),
  ('To Do',       '#3b82f6', false, 'todo',         1),
  ('In Progress', '#f59e0b', false, 'in_progress',  2),
  ('Done',        '#22c55e', false, 'done',         3);

-- Tasks (self-referential)
CREATE TABLE tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  description      TEXT,
  status_id        UUID REFERENCES statuses(id) ON DELETE SET NULL,
  parent_id        UUID REFERENCES tasks(id) ON DELETE CASCADE,
  position         FLOAT NOT NULL DEFAULT 0,
  depth            INTEGER NOT NULL DEFAULT 0,
  due_date         DATE,
  is_recurring     BOOLEAN DEFAULT false,
  recurrence_rule  JSONB,
  next_occurrence  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX idx_tasks_position  ON tasks(parent_id, position);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 2. Environment variables

Create a `.env.local` file at the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
CRON_SECRET=<a-random-string-you-generate>
```

> **Where to find these values:**
> - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - go to your Supabase project → **Project Settings → API**.
> - `CRON_SECRET` - any random string you choose (e.g. output of `openssl rand -hex 32`). It is used to authenticate the `/api/cron/recurrence` endpoint.

> **Note:** Supabase uses `PUBLISHABLE_KEY`, not the legacy `ANON_KEY`. Using the old name will silently fail.

---

## Running Locally

### 1. Clone and install

```bash
git clone <repo-url>
cd task-tracker
npm install
```

### 2. Add environment variables

Create `.env.local` as described in the Prerequisites section above.

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. (Optional) Run tests

```bash
npm test
```

---

## Troubleshooting

**Tasks or statuses do not load**

Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` are correct and that the Supabase tables were created with the SQL above. Open the browser console - a failed Supabase request will show the exact error.

**"Failed to fetch tasks" error on first load**

Supabase enforces Row Level Security (RLS) by default. If you enabled RLS on the `tasks` or `statuses` tables without adding policies, all reads will be blocked. Either disable RLS on both tables or add a policy that allows all operations for the anon role.

**Drag and drop does not work**

Drag reordering only works between siblings (tasks at the same level under the same parent). Dragging a task to a different parent is intentionally not supported - use the **Move to...** menu in the `···` dropdown instead.

**Recurring tasks are not spawning**

The cron job runs daily at midnight UTC via Vercel Cron. It calls `/api/cron/recurrence` with an `Authorization: Bearer <CRON_SECRET>` header. To test it locally, call that endpoint manually:

```bash
curl -X GET http://localhost:3000/api/cron/recurrence \
  -H "Authorization: Bearer <your-CRON_SECRET>"
```

**Theme toggle has no effect**

The theme toggle switches between `light` and `dark` by adding/removing the `dark` class on the `<html>` element. If the styles are not changing, check that Tailwind's dark mode variant is configured correctly in `globals.css`.

**Build fails after pulling changes**

Run `npm install` first - a dependency may have been added. Then run `npm run build` and check the output for specific errors.
