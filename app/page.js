import { createClient } from '@/lib/supabase/server';
import TaskList from '@/components/task-list/TaskList';

/**
 * Root page — Server Component.
 * Fetches the full task tree and all statuses server-side so TanStack Query
 * on the client can hydrate from initialData with zero client-side requests on first load.
 */
export default async function Page() {
    const supabase = await createClient();

    const [{ data: tasks }, { data: statuses }] = await Promise.all([
        supabase
            .from('tasks')
            .select('*, statuses(id, name, color, is_default, position)')
            .order('depth', { ascending: true })
            .order('position', { ascending: true }),
        supabase.from('statuses').select('*').order('position', { ascending: true }),
    ]);

    // Normalize nested statuses join to flat status_name / status_color fields
    // so TaskList and useTaskTree don't need to understand the join structure
    const normalizedTasks = (tasks || []).map((task) => ({
        ...task,
        status_name: task.statuses?.name ?? null,
        status_color: task.statuses?.color ?? null,
    }));

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <TaskList initialTasks={normalizedTasks} initialStatuses={statuses || []} />
        </div>
    );
}
