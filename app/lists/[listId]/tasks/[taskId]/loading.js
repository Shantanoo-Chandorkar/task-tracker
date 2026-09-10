import TaskDetailSkeleton from '@/components/task-detail/TaskDetailSkeleton';

/**
 * Streaming skeleton shown while the task detail page awaits its database query.
 * Renders immediately via React Suspense before the server component resolves.
 */
export default function Loading() {
    return (
        <div className="px-4 md:px-8 py-6">
            <TaskDetailSkeleton />
        </div>
    );
}
