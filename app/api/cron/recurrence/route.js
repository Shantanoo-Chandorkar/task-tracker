import { createClient } from '@/lib/supabase/admin';
import { computeNextOccurrence } from '@/lib/recurrence';
import { NextResponse } from 'next/server';

/**
 * POST /api/cron/recurrence
 * Daily cron job that spawns new task instances for all due recurring tasks.
 * Protected by a shared secret so only Vercel Cron can call it.
 *
 * For each overdue recurring task:
 * 1. Creates a new sibling task with the same title/description, status reset to default.
 * 2. Updates the original task's next_occurrence to the next future date.
 *
 * Returns { processed: N } with the count of tasks that were spawned.
 */
export async function GET(request) {
    // Validate cron secret to prevent unauthorized invocations
    const authHeader = request.headers.get('authorization');
    const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = await createClient();

        const { data: dueTasks, error: fetchError } = await supabase
            .from('tasks')
            .select('*')
            .eq('is_recurring', true)
            .lte('next_occurrence', new Date().toISOString());

        if (fetchError) {
            return NextResponse.json({ error: 'Failed to fetch recurring tasks' }, { status: 500 });
        }

        if (!dueTasks || dueTasks.length === 0) {
            return NextResponse.json({ processed: 0 });
        }

        // Resolve each due task's own space's default status — statuses are per-space, and
        // dueTasks can span multiple spaces, so there's no single "the" default status anymore.
        const distinctListIds = [...new Set(dueTasks.map((task) => task.list_id))];
        const { data: taskLists = [] } = await supabase
            .from('lists')
            .select('id, space_id')
            .in('id', distinctListIds);
        const spaceIdByListId = new Map(taskLists.map((list) => [list.id, list.space_id]));

        const distinctSpaceIds = [...new Set(taskLists.map((list) => list.space_id))];
        const { data: defaultStatuses = [] } = await supabase
            .from('statuses')
            .select('id, space_id')
            .eq('is_default', true)
            .in('space_id', distinctSpaceIds);
        const defaultStatusIdBySpaceId = new Map(
            defaultStatuses.map((status) => [status.space_id, status.id]),
        );

        let processed = 0;

        for (const task of dueTasks) {
            const siblingQuery = task.parent_id
                ? supabase
                      .from('tasks')
                      .select('position')
                      .eq('parent_id', task.parent_id)
                      .order('position', { ascending: false })
                      .limit(1)
                : supabase
                      .from('tasks')
                      .select('position')
                      .eq('list_id', task.list_id)
                      .is('parent_id', null)
                      .order('position', { ascending: false })
                      .limit(1);

            const { data: siblings } = await siblingQuery;
            const newPosition = siblings && siblings.length > 0 ? siblings[0].position + 1 : 1;

            const taskSpaceId = spaceIdByListId.get(task.list_id);
            const defaultStatusId = defaultStatusIdBySpaceId.get(taskSpaceId) ?? null;

            const { error: insertError } = await supabase.from('tasks').insert({
                title: task.title,
                description: task.description,
                status_id: defaultStatusId,
                parent_id: task.parent_id,
                list_id: task.list_id,
                position: newPosition,
                depth: task.depth,
                is_recurring: false, // New instances are not themselves recurring
            });

            if (insertError) {
                // Skip advancing next_occurrence so this task is retried on the next cron run
                console.error(
                    `Failed to spawn recurring task instance for task ${task.id}:`,
                    insertError.message,
                );
                continue;
            }

            const nextDate = computeNextOccurrence(task.recurrence_rule);
            if (nextDate) {
                await supabase
                    .from('tasks')
                    .update({ next_occurrence: nextDate.toISOString() })
                    .eq('id', task.id);
            } else {
                // No more future occurrences — clear the recurring flag
                await supabase
                    .from('tasks')
                    .update({ is_recurring: false, next_occurrence: null })
                    .eq('id', task.id);
            }

            processed++;
        }

        return NextResponse.json({ processed });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
