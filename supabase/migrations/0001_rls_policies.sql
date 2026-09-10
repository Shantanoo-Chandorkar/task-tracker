-- Single-user app, no auth: the publishable (anon) key is the only credential that
-- ever talks to these tables, so it needs full access. RLS stays enabled (avoids
-- Supabase's "unrestricted table" security lint) with an explicit permissive policy
-- per table/action instead of disabling RLS outright.

ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full access" ON statuses
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon full access" ON tasks
  FOR ALL TO anon USING (true) WITH CHECK (true);
