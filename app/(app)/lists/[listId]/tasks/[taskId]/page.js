import { createClient } from '@/lib/supabase/server';
import TaskDetail from '@/components/task-detail/TaskDetail';

/**
 * Task detail page — Server Component. Fetches the task list SSR to hydrate TaskDetail's query.
 */
export default async function TaskDetailPage({ params }) {
    const { listId, taskId } = await params;
    const supabase = await createClient();

    const [{ data: tasks }, { data: list }] = await Promise.all([
        supabase
            .from('tasks')
            .select('*, statuses(id, name, color, is_default, position)')
            .eq('list_id', listId)
            .order('depth', { ascending: true })
            .order('position', { ascending: true }),
        supabase.from('lists').select('space_id').eq('id', listId).maybeSingle(),
    ]);

    const { data: statuses } = list
        ? await supabase
              .from('statuses')
              .select('*')
              .eq('space_id', list.space_id)
              .order('position', { ascending: true })
        : { data: [] };

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
