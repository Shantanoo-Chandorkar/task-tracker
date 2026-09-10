-- Space -> List -> Task information architecture. Spaces and Lists are flat
-- (no sub-spaces, no sub-lists) -- only tasks keep unlimited nesting.

CREATE TABLE spaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6b7280',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6b7280',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lists_space_id ON lists(space_id);

-- Every task belongs to exactly one List. NOT NULL is safe here: the table is
-- empty at migration time (confirmed clean slate), no backfill needed.
ALTER TABLE tasks ADD COLUMN list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE;
CREATE INDEX idx_tasks_list_id ON tasks(list_id);

-- Same single-user-no-auth RLS rationale as 0001_rls_policies.sql.
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full access" ON spaces
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon full access" ON lists
  FOR ALL TO anon USING (true) WITH CHECK (true);
