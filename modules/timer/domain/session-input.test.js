import { describe, expect, it } from 'vitest';
import {
    checkSessionSubject,
    checkSessionLabel,
    resolveSessionCompletion,
    checkCanPause,
    checkCanResume,
    checkCanComplete,
} from './session-input';
import {
    TIME_SESSION_SUBJECT_INVALID,
    TIME_SESSION_LABEL_TOO_LONG,
    TIME_SESSION_ALREADY_COMPLETED,
    TIME_SESSION_STATUS_INVALID,
} from '../errors';

describe('checkSessionSubject', () => {
    it('resolves to no subject when neither is sent', () => {
        expect(checkSessionSubject({})).toEqual({ habitId: null, taskId: null });
    });

    it('resolves to the habit when only a habit id is sent', () => {
        expect(checkSessionSubject({ habitId: 'habit-1' })).toEqual({
            habitId: 'habit-1',
            taskId: null,
        });
    });

    it('resolves to the task when only a task id is sent', () => {
        expect(checkSessionSubject({ taskId: 'task-1' })).toEqual({
            habitId: null,
            taskId: 'task-1',
        });
    });

    it('rejects both a habit and a task being sent together', () => {
        expect(checkSessionSubject({ habitId: 'habit-1', taskId: 'task-1' })).toEqual({
            error: 'A session can be linked to a habit or a task, not both',
            code: TIME_SESSION_SUBJECT_INVALID,
        });
    });
});

describe('checkSessionLabel', () => {
    it('trims and keeps a short label', () => {
        expect(checkSessionLabel('  Deep work  ')).toEqual({ label: 'Deep work' });
    });

    it('normalizes an empty label to null', () => {
        expect(checkSessionLabel('   ')).toEqual({ label: null });
    });

    it('rejects a label over 200 characters', () => {
        const labelCheck = checkSessionLabel('a'.repeat(201));
        expect(labelCheck.error).toBeTruthy();
        expect(labelCheck.code).toBe(TIME_SESSION_LABEL_TOO_LONG);
    });
});

describe('resolveSessionCompletion', () => {
    it('deletes a standalone session instead of marking it completed', () => {
        const session = {
            habit_id: null,
            task_id: null,
            status: 'running',
            accumulated_seconds: 100,
            last_resumed_at: '2026-10-18T10:00:00.000Z',
        };
        expect(resolveSessionCompletion(session, new Date('2026-10-18T10:00:30.000Z'))).toEqual({
            action: 'delete',
        });
    });

    it('updates a habit-linked session to completed with the final elapsed time sealed', () => {
        const session = {
            habit_id: 'habit-1',
            task_id: null,
            status: 'running',
            accumulated_seconds: 100,
            last_resumed_at: '2026-10-18T10:00:00.000Z',
        };
        const now = new Date('2026-10-18T10:00:30.000Z');
        expect(resolveSessionCompletion(session, now)).toEqual({
            action: 'update',
            updates: {
                status: 'completed',
                completed_at: now.toISOString(),
                accumulated_seconds: 130,
                last_resumed_at: null,
            },
        });
    });

    it('updates a task-linked paused session, keeping its sealed time as-is', () => {
        const session = {
            habit_id: null,
            task_id: 'task-1',
            status: 'paused',
            accumulated_seconds: 100,
            last_resumed_at: null,
        };
        const now = new Date('2026-10-18T10:00:30.000Z');
        expect(resolveSessionCompletion(session, now)).toEqual({
            action: 'update',
            updates: {
                status: 'completed',
                completed_at: now.toISOString(),
                accumulated_seconds: 100,
                last_resumed_at: null,
            },
        });
    });
});

describe('checkCanPause', () => {
    it('allows pausing a running session', () => {
        expect(checkCanPause({ status: 'running' })).toBeNull();
    });

    it('refuses pausing an already-paused session', () => {
        expect(checkCanPause({ status: 'paused' })).toEqual({
            error: 'Only a running session can be paused',
            code: TIME_SESSION_STATUS_INVALID,
        });
    });

    it('refuses pausing a completed session', () => {
        expect(checkCanPause({ status: 'completed' })).toEqual({
            error: 'This session has already been completed',
            code: TIME_SESSION_ALREADY_COMPLETED,
        });
    });
});

describe('checkCanResume', () => {
    it('allows resuming a paused session', () => {
        expect(checkCanResume({ status: 'paused' })).toBeNull();
    });

    it('refuses resuming an already-running session', () => {
        expect(checkCanResume({ status: 'running' })).toEqual({
            error: 'Only a paused session can be resumed',
            code: TIME_SESSION_STATUS_INVALID,
        });
    });

    it('refuses resuming a completed session', () => {
        expect(checkCanResume({ status: 'completed' })).toEqual({
            error: 'This session has already been completed',
            code: TIME_SESSION_ALREADY_COMPLETED,
        });
    });
});

describe('checkCanComplete', () => {
    it('allows completing a running session', () => {
        expect(checkCanComplete({ status: 'running' })).toBeNull();
    });

    it('allows completing a paused session', () => {
        expect(checkCanComplete({ status: 'paused' })).toBeNull();
    });

    it('refuses completing an already-completed session', () => {
        expect(checkCanComplete({ status: 'completed' })).toEqual({
            error: 'This session has already been completed',
            code: TIME_SESSION_ALREADY_COMPLETED,
        });
    });
});
