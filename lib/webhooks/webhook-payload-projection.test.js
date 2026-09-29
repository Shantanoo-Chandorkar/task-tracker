// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { projectEventForEndpoint } from './webhook-payload-projection';

const SECRET_TITLE = 'Buy birthday gift for Sam';
const SECRET_DESCRIPTION = 'Card number is on the fridge';

const buildEvent = (overrides = {}) => ({
    id: 'evt-1',
    event_type: 'task.updated',
    schema_version: 1,
    occurred_at: '2026-01-01T12:00:00.000Z',
    correlation_id: 'corr-1',
    space_id: 'space-1',
    actor_id: 'user-1',
    source: 'user',
    resource_type: 'task',
    resource_id: 'task-1',
    payload: {
        task: {
            id: 'task-1',
            title: SECRET_TITLE,
            description: SECRET_DESCRIPTION,
            status: { id: 'status-1', code: 'todo', name: 'To do' },
            list: { id: 'list-1', name: 'Personal errands' },
            sublist: { id: 'sublist-1', name: 'Gifts' },
            parent_id: null,
            due_date: '2026-02-01',
            is_prioritised: true,
            is_recurring: false,
            recurrence_rule: null,
            created_by: 'user-1',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T12:00:00.000Z',
        },
        changes: {
            title: { old: 'Buy gift', new: SECRET_TITLE },
            description: { old: 'x', new: SECRET_DESCRIPTION },
        },
        effects: {
            kind: 'subtree',
            count: 2,
            truncated: false,
            tasks: [{ id: 'task-2', title: 'Wrap it', parent_id: 'task-1', status_code: 'todo' }],
        },
        context: { list: { id: 'list-1', name: 'Personal errands' } },
        affected_count: 2,
    },
    ...overrides,
});

describe('projectEventForEndpoint', () => {
    it('always carries the envelope fields, whatever the payloadLevel', () => {
        for (const payloadLevel of ['minimal', 'standard', 'full']) {
            expect(projectEventForEndpoint(buildEvent(), payloadLevel)).toMatchObject({
                event_id: 'evt-1',
                event_type: 'task.updated',
                schema_version: 1,
                occurred_at: '2026-01-01T12:00:00.000Z',
                correlation_id: 'corr-1',
                space_id: 'space-1',
                actor_id: 'user-1',
                source: 'user',
                resource_type: 'task',
                resource_id: 'task-1',
            });
        }
    });

    it('minimal: ids and changed field names only, no user text anywhere in the body', () => {
        const body = projectEventForEndpoint(buildEvent(), 'minimal');
        expect(body.data.task).toEqual({
            id: 'task-1',
            parent_id: null,
            status: { id: 'status-1' },
            list: { id: 'list-1' },
            sublist: { id: 'sublist-1' },
        });
        expect(body.data.changed_fields).toEqual(['title', 'description']);
        expect(body.data.changes).toBeNull();
        expect(body.data.effects.tasks).toEqual([{ id: 'task-2' }]);
        expect(body.data.context).toEqual({ list: { id: 'list-1' } });
        const serialized = JSON.stringify(body);
        for (const secretText of [
            SECRET_TITLE,
            SECRET_DESCRIPTION,
            'Personal errands',
            'Gifts',
            'Wrap it',
            'To do',
        ])
            expect(serialized).not.toContain(secretText);
    });

    it('standard: adds titles, names and change values but never the description', () => {
        const body = projectEventForEndpoint(buildEvent(), 'standard');
        expect(body.data.task.title).toBe(SECRET_TITLE);
        expect(body.data.task.status.name).toBe('To do');
        expect(body.data.task).not.toHaveProperty('description');
        expect(body.data.changes).toEqual({ title: { old: 'Buy gift', new: SECRET_TITLE } });
        expect(body.data.changed_fields).toEqual(['title', 'description']);
        expect(body.data.effects.tasks[0].title).toBe('Wrap it');
        expect(JSON.stringify(body)).not.toContain(SECRET_DESCRIPTION);
    });

    it('full: includes the description in the task and in the changes', () => {
        const body = projectEventForEndpoint(buildEvent(), 'full');
        expect(body.data.task.description).toBe(SECRET_DESCRIPTION);
        expect(body.data.changes.description.new).toBe(SECRET_DESCRIPTION);
    });

    it('falls back to minimal for an unknown or missing payloadLevel', () => {
        for (const payloadLevel of ['everything', undefined, null, '']) {
            const serialized = JSON.stringify(projectEventForEndpoint(buildEvent(), payloadLevel));
            expect(serialized).not.toContain(SECRET_TITLE);
        }
    });

    it('handles events with no single root task and no changes (list delete)', () => {
        const event = buildEvent({
            event_type: 'task.deleted',
            payload: {
                task: null,
                changes: null,
                effects: { kind: 'list_deleted', count: 3, truncated: false, tasks: [] },
                context: null,
                affected_count: 3,
            },
        });
        for (const payloadLevel of ['minimal', 'standard', 'full']) {
            const body = projectEventForEndpoint(event, payloadLevel);
            expect(body.data.task).toBeNull();
            expect(body.data.changes).toBeNull();
            expect(body.data.changed_fields).toEqual([]);
            expect(body.data.affected_count).toBe(3);
        }
    });

    it('tolerates a missing payload without throwing', () => {
        const body = projectEventForEndpoint(buildEvent({ payload: null }), 'standard');
        expect(body.data).toEqual({
            task: null,
            changed_fields: [],
            changes: null,
            effects: null,
            context: null,
            affected_count: null,
        });
    });

    it('does not mutate the stored event', () => {
        const event = buildEvent();
        const before = JSON.stringify(event);
        projectEventForEndpoint(event, 'minimal');
        projectEventForEndpoint(event, 'standard');
        expect(JSON.stringify(event)).toBe(before);
    });

    it('keeps the duplicate context id at minimal', () => {
        const event = buildEvent({
            payload: { ...buildEvent().payload, context: { duplicated_from: 'task-9' } },
        });
        expect(projectEventForEndpoint(event, 'minimal').data.context).toEqual({
            duplicated_from: 'task-9',
        });
    });
});
