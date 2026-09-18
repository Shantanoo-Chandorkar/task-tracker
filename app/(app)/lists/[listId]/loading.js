import TaskListSkeleton from '@/components/task-list/TaskListSkeleton';

/**
 * Streaming skeleton shown while app/page.js awaits its database queries.
 * Renders immediately via React Suspense before the server component resolves.
 */
export default function Loading() {
    return <TaskListSkeleton />;
}
