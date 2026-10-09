import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/validation';
import { throwIfQueryFailed } from '@/lib/supabase/throw-if-query-failed';
import TaskDetail from '@/components/task-detail/TaskDetail';
import { loadListName } from '@/lib/page-titles';
import { LIST_TASK_COLUMNS } from '@/lib/tasks/list-tasks';

/**
 * Tab title: "Task in <list name>"; the task's own title would need an extra query, so it is not used.
 *
 * @param {object} props
 * @param {Promise<{ listId: string }>} props.params - Route params.
 * @returns {Promise<{ title: string }>} Page metadata.
 */
export async function generateMetadata({ params }) {
    const { listId } = await params;
    const listName = isUuid(listId) ? await loadListName(listId) : null;
    return { title: listName ? `Task in ${listName}` : 'Task' };
}

/**
 * Task detail page - Server Component. Fetches the task list SSR to hydrate TaskDetail's query.
 */
export default async function TaskDetailPage({ params }) {
    const { listId, taskId } = await params;
    // A malformed id would make Postgres error instead of returning no row, which must not look like an outage.
    if (!isUuid(listId) || !isUuid(taskId)) notFound();
    const supabase = await createClient();

    const [tasksResult, listResult] = await Promise.all([
        supabase
            .from('tasks')
            .select(LIST_TASK_COLUMNS)
            .eq('list_id', listId)
            .order('depth', { ascending: true })
            .order('position', { ascending: true }),
        supabase.from('lists').select('space_id').eq('id', listId).maybeSingle(),
    ]);
    throwIfQueryFailed('[task-detail-page]', tasksResult, listResult);

    const { data: tasks } = tasksResult;
    const { data: list } = listResult;
    // RLS returns null for a list the user cannot see, so a missing list and a foreign one look identical here.
    if (!list || !(tasks || []).some((task) => task.id === taskId)) notFound();

    const statusesResult = await supabase
        .from('statuses')
        .select('*')
        .eq('space_id', list.space_id)
        .order('position', { ascending: true });
    throwIfQueryFailed('[task-detail-page]', statusesResult);
    const { data: statuses } = statusesResult;

    const normalizedTasks = (tasks || []).map((task) => ({
        ...task,
        status_name: task.statuses?.name ?? null,
        status_color: task.statuses?.color ?? null,
        tags: (task.task_tags || []).map((taskTagRow) => taskTagRow.tags),
    }));

    return (
        <div className="px-4 md:px-8 py-6">
            <TaskDetail
                listId={listId}
                taskId={taskId}
                initialTasks={normalizedTasks}
                initialStatuses={statuses || []}
                initialLists={[{ id: listId, space_id: list.space_id }]}
            />
        </div>
    );
}
