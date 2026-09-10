import SpaceListSkeleton from '@/components/space/SpaceListSkeleton';

/**
 * Streaming skeleton shown while `/` resolves its redirect-to-first-list
 * query. Rarely visible for long (it's usually a fast redirect), but covers
 * the brief gap instead of a blank screen, and matches the onboarding
 * empty-state's shape for when there really is a query to wait on.
 */
export default function Loading() {
    return <SpaceListSkeleton />;
}
