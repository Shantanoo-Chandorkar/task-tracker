import { createClient } from '@/lib/supabase/server';

/**
 * Reads the current authenticated user from the request's session cookie, server-side.
 * Portable across projects — depends only on the generic Supabase server client, nothing
 * space/task-specific.
 *
 * @returns {Promise<import('@supabase/supabase-js').User|null>} The current user, or null if unauthenticated.
 */
export async function getCurrentUser() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    return user ?? null;
}
