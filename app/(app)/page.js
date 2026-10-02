import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { loadRequestUser, loadSpacesAndLists } from '@/lib/app-shell-data';
import { attachMyPermissionLevel } from '@/lib/permissions/space-permissions';
import { attachOwnerDisplayName } from '@/lib/permissions/space-owner-identity';
import { getCurrentUserProfile } from '@/lib/profile';
import SpaceListManager from '@/components/space/SpaceListManager';
import HomeView from '@/components/home/HomeView';
import HomeSkeleton from '@/components/home/HomeSkeleton';
import { loadHomeSummary } from '@/lib/home/build-home-summary';

export const metadata = { title: 'Home' };

/**
 * The Home content once its data has loaded. Shows the Home dashboard when the user has a list; with no
 * lists yet, shows the Space/List manager inline so a first-time user can create one without onboarding.
 */
async function HomeContent() {
    const supabase = await createClient();

    // Spaces and lists are the layout's own cached read, so this adds only the Home summary
    const [{ spaces, lists }, homeLoadResult] = await Promise.all([
        loadSpacesAndLists(),
        loadHomeSummary(supabase),
    ]);

    if (lists.length > 0) {
        // A failed load leaves initialHome undefined, so the client fetches it and can show a retry
        return (
            <HomeView
                initialHome={homeLoadResult.data ?? undefined}
                firstList={{ id: lists[0].id, name: lists[0].name }}
            />
        );
    }

    // Without the caller's id every space would look "shared", hiding the owner's own edit/delete/share controls.
    const user = await loadRequestUser();
    const spacesWithPermission = await attachOwnerDisplayName(
        await attachMyPermissionLevel(supabase, spaces, user?.id ?? null),
    );
    // Matches /api/profile's computation, so the client refetch never hydration-mismatches this field.
    const initialProfile = user ? await getCurrentUserProfile(supabase, user) : null;

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-xl font-semibold">Welcome to Task Tracker</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Create a space and a list to get started.
                </p>
            </div>

            <SpaceListManager
                initialSpaces={spacesWithPermission}
                initialLists={lists}
                currentUserId={user?.id ?? null}
                initialProfile={initialProfile}
            />
        </div>
    );
}

/**
 * Home page - Server Component. A thin wrapper so the Home-shaped skeleton shows while the data loads,
 * instead of the route-wide fallback.
 */
export default function Page() {
    return (
        <Suspense fallback={<HomeSkeleton />}>
            <HomeContent />
        </Suspense>
    );
}
