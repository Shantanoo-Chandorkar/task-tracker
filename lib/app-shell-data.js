import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { throwIfQueryFailed } from '@/lib/supabase/throw-if-query-failed';
import { getCurrentUserProfile } from '@/lib/profile';
import { attachTaskCounts } from '@/lib/list-task-counts';
import { attachMyPermissionLevel } from '@/lib/permissions/space-permissions';

// cache() lasts one request only, so layout pieces and the page share a read, never across users.

/**
 * Reads the signed-in user once per request, however many parts of the page ask.
 *
 * @returns {Promise<import('@supabase/supabase-js').User|null>} The current user, or null if signed out.
 */
export const loadRequestUser = cache(() => getCurrentUser());

/**
 * Reads every visible space and list once per request, in parallel.
 *
 * @returns {Promise<{ spaces: object[], lists: object[] }>} Raw rows ordered by position.
 * @throws {Error} When either query fails, so the route's error boundary shows a retry.
 */
export const loadSpacesAndLists = cache(async () => {
    const supabase = await createClient();
    const [spacesResult, listsResult] = await Promise.all([
        supabase.from('spaces').select('*').order('position', { ascending: true }),
        supabase.from('lists').select('*').order('position', { ascending: true }),
    ]);
    throwIfQueryFailed('[app-shell]', spacesResult, listsResult);
    return { spaces: spacesResult.data || [], lists: listsResult.data || [] };
});

/**
 * Loads what the always-mounted nav needs to seed its queries, once per request.
 * The shapes must match every page's own, because whichever seeds a shared query key first wins.
 *
 * @returns {Promise<{ initialSpaces: object[], initialLists: object[], initialProfile: object|null }>}
 */
export const loadShellData = cache(async () => {
    const supabase = await createClient();
    const [user, { spaces, lists }] = await Promise.all([loadRequestUser(), loadSpacesAndLists()]);

    const [initialSpaces, initialLists, initialProfile] = await Promise.all([
        attachMyPermissionLevel(supabase, spaces, user?.id ?? null),
        attachTaskCounts(supabase, lists),
        user ? getCurrentUserProfile(supabase, user) : null,
    ]);
    return { initialSpaces, initialLists, initialProfile };
});
