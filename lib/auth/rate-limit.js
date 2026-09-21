import { createClient } from '@/lib/supabase/admin';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

/**
 * Checks whether an email+IP pair is currently locked out for a given auth action. Uses the
 * secret-key admin client since no session exists yet for RLS to key a policy on.
 *
 * @param {'signin'|'password_reset'|'signup'} actionType
 * @param {string} email - Already trimmed/lowercased by the caller.
 * @param {string} ipAddress
 * @returns {Promise<{ isLocked: boolean, retryAfterMinutes: number|null }>}
 */
export async function checkRateLimit(actionType, email, ipAddress) {
    const supabase = createClient();
    const { data: lockoutRow, error } = await supabase
        .from('auth_rate_limits')
        .select('locked_until')
        .eq('email', email)
        .eq('ip_address', ipAddress)
        .eq('action_type', actionType)
        .maybeSingle();

    // Fails open (not locked) on a table error rather than blocking every login -- but it's logged.
    if (error) console.error('[rate-limit] check failed', { actionType, detail: error.message });

    if (!lockoutRow?.locked_until) return { isLocked: false, retryAfterMinutes: null };

    const msRemaining = new Date(lockoutRow.locked_until).getTime() - Date.now();
    if (msRemaining <= 0) return { isLocked: false, retryAfterMinutes: null };

    return { isLocked: true, retryAfterMinutes: Math.ceil(msRemaining / 60_000) };
}

/**
 * Records a failed attempt, locking the email+IP pair out for LOCKOUT_MINUTES once
 * MAX_FAILED_ATTEMPTS is reached.
 *
 * @param {'signin'|'password_reset'|'signup'} actionType
 * @param {string} email
 * @param {string} ipAddress
 * @returns {Promise<void>}
 */
export async function recordFailedAttempt(actionType, email, ipAddress) {
    const supabase = createClient();
    const { data: existing, error: readError } = await supabase
        .from('auth_rate_limits')
        .select('failed_count')
        .eq('email', email)
        .eq('ip_address', ipAddress)
        .eq('action_type', actionType)
        .maybeSingle();

    if (readError) {
        console.error('[rate-limit] read before record failed', {
            actionType,
            detail: readError.message,
        });
    }

    const failedCount = (existing?.failed_count ?? 0) + 1;
    const lockedUntil =
        failedCount >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString()
            : null;

    const { error: writeError } = await supabase.from('auth_rate_limits').upsert(
        {
            email,
            ip_address: ipAddress,
            action_type: actionType,
            failed_count: failedCount,
            locked_until: lockedUntil,
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'email,ip_address,action_type' },
    );

    if (writeError) {
        console.error('[rate-limit] record failed', { actionType, detail: writeError.message });
    }
}

/**
 * Clears any recorded attempts for an email+IP pair - called on successful auth.
 *
 * @param {'signin'|'password_reset'|'signup'} actionType
 * @param {string} email
 * @param {string} ipAddress
 * @returns {Promise<void>}
 */
export async function resetAttempts(actionType, email, ipAddress) {
    const supabase = createClient();
    const { error } = await supabase
        .from('auth_rate_limits')
        .delete()
        .eq('email', email)
        .eq('ip_address', ipAddress)
        .eq('action_type', actionType);

    if (error) console.error('[rate-limit] reset failed', { actionType, detail: error.message });
}

/**
 * Reads the caller's IP from the x-forwarded-for header Vercel sets, falling back to a
 * fixed string so a missing header shares one bucket instead of failing the request.
 *
 * @param {Headers} headers - From next/headers' headers().
 * @returns {string}
 */
export function getClientIp(headers) {
    const forwardedFor = headers.get('x-forwarded-for');
    return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}
