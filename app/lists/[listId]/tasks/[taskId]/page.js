import { createClient } from '@/lib/supabase/server';
import TaskDetail from '@/components/task-detail/TaskDetail';

/**
 * Task detail page — Server Component. Fetches the task list SSR to hydrate TaskDetail's query.
 */
export default async function TaskDetailPage({ params }) {
    const { listId, taskId } = await params;
    const supabase = await createClient();

    const [{ data: tasks }, { data: statuses }] = await Promise.all([
        supabase
            .from('tasks')
            .select('*, statuses(id, name, color, is_default, position)')
            .eq('list_id', listId)
            .order('depth', { ascending: true })
            .order('position', { ascending: true }),
        supabase.from('statuses').select('*').order('position', { ascending: true }),
    ]);

    const normalizedTasks = (tasks || []).map((task) => ({
        ...task,
        status_name: task.statuses?.name ?? null,
        status_color: task.statuses?.color ?? null,
    }));

    return (
        <div className="px-4 md:px-8 py-6">
            <TaskDetail
                listId={listId}
                taskId={taskId}
                initialTasks={normalizedTasks}
                initialStatuses={statuses || []}
            />
        </div>
    );
}
