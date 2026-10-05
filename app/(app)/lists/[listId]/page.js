import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isUuid } from '@/lib/validation';
import { throwIfQueryFailed } from '@/lib/supabase/throw-if-query-failed';
import TaskList from '@/components/task-list/TaskList';
import { attachTaskCounts } from '@/lib/list-task-counts';
import { attachMyPermissionLevel } from '@/lib/permissions/space-permissions';
import { attachOwnerDisplayName } from '@/lib/permissions/space-owner-identity';
import { loadListName } from '@/lib/page-titles';
import { fetchListTasks } from '@/lib/list-tasks';

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
    const user = await getCurrentUser();

    const [listResult, tasksResult, spacesResult, listsResult, sublistsResult] = await Promise.all([
        supabase.from('lists').select('id, space_id').eq('id', listId).maybeSingle(),
        fetchListTasks(supabase, listId),
        supabase.from('spaces').select('*').order('position', { ascending: true }),
        supabase.from('lists').select('*').order('position', { ascending: true }),
        supabase
            .from('sublists')
            .select('*')
            .eq('list_id', listId)
            .order('position', { ascending: true }),
    ]);
    throwIfQueryFailed(
        '[list-page]',
        listResult,
        tasksResult,
        spacesResult,
        listsResult,
        sublistsResult,
    );

    const { data: list } = listResult;
    // RLS returns null for a list the user cannot see, so "deleted" and "not yours" look identical here.
    if (!list) notFound();

    const { data: tasks } = tasksResult;
    const { data: spaces } = spacesResult;
    const { data: lists } = listsResult;
    const { data: sublists } = sublistsResult;

    const statusesResult = await supabase
        .from('statuses')
        .select('*')
        .eq('space_id', list.space_id)
        .order('position', { ascending: true });
    throwIfQueryFailed('[list-page]', statusesResult);
    const { data: statuses } = statusesResult;

    // Matches /api/lists' computation, so the client refetch never hydration-mismatches this field.
    const listsWithCounts = await attachTaskCounts(supabase, lists || []);
    // Matches /api/spaces' computation, so the client refetch never hydration-mismatches this field.
    const spacesWithPermission = await attachOwnerDisplayName(
        await attachMyPermissionLevel(supabase, spaces || [], user?.id ?? null),
    );

    return (
        <div className="px-4 md:px-8 py-6">
            <TaskList
                listId={listId}
                initialTasks={tasks}
                initialStatuses={statuses || []}
                initialSpaces={spacesWithPermission}
                initialLists={listsWithCounts}
                initialSublists={sublists || []}
                currentUserId={user?.id ?? null}
            />
        </div>
    );
}
