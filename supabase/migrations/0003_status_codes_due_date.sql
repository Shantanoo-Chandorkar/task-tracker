-- Built-in status codes identify three protected statuses ('todo',
-- 'in_progress', 'done') that the subtask-completion checkbox depends on.
-- They can be renamed but never deleted. Every other status (existing or
-- future) keeps code = NULL and stays fully editable/deletable.
ALTER TABLE statuses ADD COLUMN code TEXT UNIQUE;

UPDATE statuses SET code = 'todo'        WHERE code IS NULL AND lower(name) = 'to do';
UPDATE statuses SET code = 'in_progress' WHERE code IS NULL AND lower(name) = 'in progress';
UPDATE statuses SET code = 'done'        WHERE code IS NULL AND lower(name) IN ('done', 'completed');

-- Guarantee all three exist even if no existing status matched by name.
INSERT INTO statuses (name, color, code, position)
SELECT 'To Do', '#3b82f6', 'todo', (SELECT COALESCE(MAX(position), 0) + 1 FROM statuses)
WHERE NOT EXISTS (SELECT 1 FROM statuses WHERE code = 'todo');

INSERT INTO statuses (name, color, code, position)
SELECT 'In Progress', '#f59e0b', 'in_progress', (SELECT COALESCE(MAX(position), 0) + 1 FROM statuses)
WHERE NOT EXISTS (SELECT 1 FROM statuses WHERE code = 'in_progress');

INSERT INTO statuses (name, color, code, position)
SELECT 'Done', '#22c55e', 'done', (SELECT COALESCE(MAX(position), 0) + 1 FROM statuses)
WHERE NOT EXISTS (SELECT 1 FROM statuses WHERE code = 'done');

-- Due date: date-only, no time component.
ALTER TABLE tasks ADD COLUMN due_date DATE;
