import { createClient } from '@/lib/supabase/server';
import TaskDetail from '@/components/task-detail/TaskDetail';

/**
 * Task detail page — Server Component.
 * Fetches the same per-list flat task array as the list page so TaskDetail can
 * hydrate the shared `['tasks', listId]` query from initialData with no
 * client-side request on first load.
 */
export default async function TaskDetailPage({ params }) {
    const { listId, taskId } = await params;
    const supabase = await createClient();

    const { data: tasks } = await supabase
        .from('tasks')
        .select('*, statuses(id, name, color, is_default, position)')
        .eq('list_id', listId)
        .order('depth', { ascending: true })
        .order('position', { ascending: true });

    const normalizedTasks = (tasks || []).map((task) => ({
        ...task,
        status_name: task.statuses?.name ?? null,
        status_color: task.statuses?.color ?? null,
    }));

    return (
        <div className="px-4 md:px-8 py-6">
            <TaskDetail listId={listId} taskId={taskId} initialTasks={normalizedTasks} />
        </div>
    );
}
