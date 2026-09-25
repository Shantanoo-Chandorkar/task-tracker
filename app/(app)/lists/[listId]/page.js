import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import TaskList from '@/components/task-list/TaskList';
import { attachTaskCounts } from '@/lib/list-task-counts';
import { attachMyPermissionLevel } from '@/lib/permissions/space-permissions';

/**
 * List task-tree page (Server Component) - fetches everything server-side for zero-waterfall hydration.
 */
export default async function ListPage({ params }) {
    const { listId } = await params;
    const supabase = await createClient();
    const user = await getCurrentUser();

    const [{ data: list }, { data: tasks }, { data: spaces }, { data: lists }, { data: sublists }] =
        await Promise.all([
            supabase.from('lists').select('id, space_id').eq('id', listId).maybeSingle(),
            supabase
                .from('tasks')
                .select(
                    '*, statuses(id, name, color, is_default, position), task_tags(tags(id, name))',
                )
                .eq('list_id', listId)
                .order('depth', { ascending: true })
                .order('position', { ascending: true }),
            supabase.from('spaces').select('*').order('position', { ascending: true }),
            supabase.from('lists').select('*').order('position', { ascending: true }),
            supabase
                .from('sublists')
                .select('*')
                .eq('list_id', listId)
                .order('position', { ascending: true }),
        ]);

    if (!list) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-24 text-center">
                <p className="text-sm text-foreground mb-1">This list doesn&apos;t exist.</p>
                <p className="text-sm text-muted-foreground mb-4">
                    It may have been deleted. Pick another list from Spaces.
                </p>
                <Link href="/spaces" className="text-sm text-foreground underline">
                    Go to Spaces
                </Link>
            </div>
        );
    }

    // Flatten the statuses join and the task_tags join so callers don't need to know either's structure.
    const normalizedTasks = (tasks || []).map((task) => ({
        ...task,
        status_name: task.statuses?.name ?? null,
        status_color: task.statuses?.color ?? null,
        tags: (task.task_tags || []).map((taskTagRow) => taskTagRow.tags),
    }));

    const { data: statuses } = await supabase
        .from('statuses')
        .select('*')
        .eq('space_id', list.space_id)
        .order('position', { ascending: true });

    // Matches /api/lists' computation, so the client refetch never hydration-mismatches this field.
    const listsWithCounts = await attachTaskCounts(supabase, lists || []);
    // Matches /api/spaces' computation, so the client refetch never hydration-mismatches this field.
    const spacesWithPermission = await attachMyPermissionLevel(
        supabase,
        spaces || [],
        user?.id ?? null,
    );

    return (
        <div className="px-4 md:px-8 py-6">
            <TaskList
                listId={listId}
                initialTasks={normalizedTasks}
                initialStatuses={statuses || []}
                initialSpaces={spacesWithPermission}
                initialLists={listsWithCounts}
                initialSublists={sublists || []}
                currentUserId={user?.id ?? null}
            />
        </div>
    );
}
