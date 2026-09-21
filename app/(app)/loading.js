import SpaceListSkeleton from '@/components/space/SpaceListSkeleton';

/**
 * Streaming skeleton shown while `/` loads the Home summary. Covers the gap instead
 * of a blank screen; its shape matches the onboarding empty state, not Home itself.
 */
export default function Loading() {
    return <SpaceListSkeleton />;
}
