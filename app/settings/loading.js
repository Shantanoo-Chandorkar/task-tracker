import StatusManagerSkeleton from '@/components/status/StatusManagerSkeleton';

/**
 * Streaming skeleton shown while the Settings page awaits its database query.
 * Renders immediately via React Suspense before the server component resolves.
 */
export default function Loading() {
    return <StatusManagerSkeleton />;
}
