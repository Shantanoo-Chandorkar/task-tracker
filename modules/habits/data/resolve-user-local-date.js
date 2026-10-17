import { resolveLocalDate, isValidTimeZone } from '@/modules/habits/domain/local-date';

const FALLBACK_TIME_ZONE = 'UTC';

/**
 * Resolves the caller's current local date (decision 3), not the server's own UTC clock.
 *
 * @param {SupabaseClient} supabase - Request-scoped Supabase client.
 * @param {string} userId - The caller's user id.
 * @returns {Promise<string>} 'YYYY-MM-DD' in the caller's timezone, or UTC if it was never set.
 */
export async function resolveUserTodayLocalDate(supabase, userId) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', userId)
        .maybeSingle();
    const timeZone = isValidTimeZone(profile?.timezone) ? profile.timezone : FALLBACK_TIME_ZONE;
    return resolveLocalDate(new Date(), timeZone);
}
