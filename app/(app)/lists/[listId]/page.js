import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/validation';
import { throwIfQueryFailed } from '@/lib/supabase/throw-if-query-failed';
import TaskList from '@/components/task-list/TaskList';
import { attachOwnerDisplayName } from '@/lib/permissions/space-owner-identity';
import { loadListName } from '@/lib/page-titles';
import { loadRequestUser, loadShellData } from '@/lib/app-shell-data';
import { fetchListTasks } from '@/lib/tasks/list-tasks';

/**
 * Tab title: the list's name, or a generic one when the id is malformed or the list is not visible.
 *
 * @param {object} props
 * @param {Promise<{ listId: string }>} props.params - Route params.
 * @returns {Promise<{ title: string }>} Page metadata.
 */
export async function generateMetadata({ params }) {
    const { listId } = await params;
    const listName = isUuid(listId) ? await loadListName(listId) : null;
    return { title: listName ?? 'List' };
}

/**
 * List task-tree page (Server Component) - fetches everything server-side for zero-waterfall hydration.
 */
export default async function ListPage({ params }) {
    const { listId } = await params;
    // A malformed id would make Postgres error instead of returning no row, which must not look like an outage.
    if (!isUuid(listId)) notFound();
    const supabase = await createClient();
    const user = await loadRequestUser();

    // Spaces, lists and counts are the layout's reads for this same request, so they are shared, not repeated
    const [listResult, tasksResult, sublistsResult, shellData] = await Promise.all([
        supabase.from('lists').select('id, space_id').eq('id', listId).maybeSingle(),
        fetchListTasks(supabase, listId),
        supabase
            .from('sublists')
            .select('*')
            .eq('list_id', listId)
            .order('position', { ascending: true }),
        loadShellData(),
    ]);
    throwIfQueryFailed('[list-page]', listResult, tasksResult, sublistsResult);

    const { data: list } = listResult;
    // RLS returns null for a list the user cannot see, so "deleted" and "not yours" look identical here.
    if (!list) notFound();

    const { data: tasks } = tasksResult;
    const { data: sublists } = sublistsResult;

    const statusesResult = await supabase
        .from('statuses')
        .select('*')
        .eq('space_id', list.space_id)
        .order('position', { ascending: true });
    throwIfQueryFailed('[list-page]', statusesResult);
    const { data: statuses } = statusesResult;

    // Matches /api/spaces' computation, so the client refetch never hydration-mismatches this field.
    const spacesWithPermission = await attachOwnerDisplayName(shellData.initialSpaces);

    return (
        <div className="px-4 md:px-8 py-6">
            <TaskList
                listId={listId}
                initialTasks={tasks}
                initialStatuses={statuses || []}
                initialSpaces={spacesWithPermission}
                initialLists={shellData.initialLists}
                initialSublists={sublists || []}
                currentUserId={user?.id ?? null}
            />
        </div>
    );
}
