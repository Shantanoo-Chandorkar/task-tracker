import { createClient } from '@/lib/supabase/admin';
import { computeNextOccurrence } from '@/lib/tasks/recurrence';
import { NextResponse } from 'next/server';
import { apiErrorResponse, queryFailedResponse } from '@/lib/api-response';
import { CRON_UNAUTHORIZED, RECURRENCE_LOAD_FAILED, INTERNAL_ERROR } from '@/lib/error-codes';

// A daily run that falls behind catches up on the next one, instead of running past the function time limit
const MAX_TASKS_PER_RUN = 300;
export const maxDuration = 60;

/**
 * GET /api/cron/recurrence
 * Daily cron job that spawns a new task instance for each due recurring task.
 * Protected by a shared secret so only Vercel Cron can call it.
 *
 * Each task is handled by the `spawn_recurring_task` database function, which creates the copy
 * and moves the original to its next date in one transaction, so a failure never leaves a duplicate.
 *
 * Returns { processed: N, failed: M }: tasks spawned, and tasks that errored and will retry next run.
 */
export async function GET(request) {
    // Validate cron secret to prevent unauthorized invocations
    const authHeader = request.headers.get('authorization');
    const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expectedSecret) {
        return apiErrorResponse('Unauthorized', CRON_UNAUTHORIZED, 401);
    }

    try {
        const supabase = await createClient();

        const { data: dueTasks, error: fetchError } = await supabase
            .from('tasks')
            .select('id, recurrence_rule, recurrence_spawned_count')
            .eq('is_recurring', true)
            .lte('next_occurrence', new Date().toISOString())
            .order('next_occurrence', { ascending: true })
            .limit(MAX_TASKS_PER_RUN);

        if (fetchError) {
            return queryFailedResponse(
                '[cron/recurrence]',
                fetchError,
                'Failed to fetch recurring tasks',
                RECURRENCE_LOAD_FAILED,
            );
        }

        let processed = 0;
        let failed = 0;

        for (const task of dueTasks ?? []) {
            // This copy counts as spawned, so the next date is worked out for the series after it
            const nextDate = computeNextOccurrence(
                task.recurrence_rule,
                (task.recurrence_spawned_count ?? 0) + 1,
            );

            const { data: wasSpawned, error: spawnError } = await supabase.rpc(
                'spawn_recurring_task',
                { p_task_id: task.id, p_next_occurrence: nextDate ? nextDate.toISOString() : null },
            );

            if (spawnError) {
                // The database rolled everything back, so this task is still due and retries next run
                console.error('[cron/recurrence] spawn failed', {
                    taskId: task.id,
                    code: spawnError.code,
                    detail: spawnError.message,
                });
                failed++;
                continue;
            }

            if (wasSpawned) processed++;
        }

        return NextResponse.json({ processed, failed });
    } catch (thrown) {
        console.error('[cron/recurrence] unhandled error', { detail: thrown?.message });
        return apiErrorResponse('Internal server error', INTERNAL_ERROR, 500);
    }
}
