import SpaceListSkeleton from '@/components/space/SpaceListSkeleton';

/**
 * Streaming skeleton shown while the Spaces page awaits its database queries.
 * Renders immediately via React Suspense before the server component resolves.
 */
export default function Loading() {
    return <SpaceListSkeleton />;
}
