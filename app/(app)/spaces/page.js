import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { attachMyPermissionLevel } from '@/lib/permissions/space-permissions';
import { getCurrentUserProfile } from '@/lib/profile';
import SpaceListManager from '@/components/space/SpaceListManager';

/**
 * Spaces page - Server Component.
 * Fetches spaces and lists server-side to pass as initialData to
 * SpaceListManager, so the page has zero client-side waterfall on first load.
 */
export default async function SpacesPage() {
    const supabase = await createClient();
    const user = await getCurrentUser();

    const [{ data: spaces }, { data: lists }] = await Promise.all([
        supabase.from('spaces').select('*').order('position', { ascending: true }),
        supabase.from('lists').select('*').order('position', { ascending: true }),
    ]);

    const spacesWithPermission = await attachMyPermissionLevel(supabase, spaces || [], user?.id ?? null);
    // Matches /api/profile's computation, so the client refetch never hydration-mismatches this field.
    const initialProfile = user ? await getCurrentUserProfile(supabase, user) : null;

    return (
        <div className="px-4 md:px-8 py-8">
            <div className="mb-8">
                <h1 className="text-xl font-semibold">Spaces</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Organize your work into spaces and lists.
                </p>
            </div>

            <SpaceListManager
                initialSpaces={spacesWithPermission}
                initialLists={lists || []}
                currentUserId={user?.id ?? null}
                initialProfile={initialProfile}
            />
        </div>
    );
}
