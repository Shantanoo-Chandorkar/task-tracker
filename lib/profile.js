import { getGuestSecondsLeft, isGuestUser } from '@/lib/guest/guest-session';

/**
 * Builds the current user's profile shape (display name, email, guest status). Shared by
 * `/api/profile` and any SSR page needing it up front, so hydration never mismatches.
 *
 * @param {object} supabase - Supabase server client
 * @param {import('@supabase/supabase-js').User} user - Already-resolved current user
 * @returns {Promise<{display_name: string|null, email: string|null, is_guest: boolean, guest_seconds_left: number|null}>}
 */
export async function getCurrentUserProfile(supabase, user) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();
    const isGuest = isGuestUser(user);

    return {
        display_name: isGuest
            ? null
            : profile?.display_name || user.user_metadata?.display_name || null,
        email: user.email ?? null,
        is_guest: isGuest,
        guest_seconds_left: getGuestSecondsLeft(user),
    };
}
