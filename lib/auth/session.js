import { createClient } from '@/lib/supabase/server';
import { isGuestSessionExpired } from '@/lib/guest/guest-session';

/**
 * Reads the current authenticated user from the request's session cookie, server-side.
 * An expired guest counts as logged out, so every action and API route refuses it.
 *
 * @returns {Promise<import('@supabase/supabase-js').User|null>} The current user, or null if unauthenticated.
 */
export async function getCurrentUser() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user || isGuestSessionExpired(user)) return null;
    return user;
}
