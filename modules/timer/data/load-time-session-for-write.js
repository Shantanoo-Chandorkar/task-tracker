/**
 * Loads a time session for write; RLS already scopes rows to the caller - a miss is not-found either way.
 *
 * @param {SupabaseClient} supabase - Request-scoped Supabase client.
 * @param {string} id - Session to load.
 * @param {{ error: string, code: string }} notFoundFailure - What to hand back when nothing is visible.
 * @returns {Promise<{ session: Record<string, any>, failure: null }|{ session: null, failure: Record<string, any> }>}
 */
export async function loadTimeSessionForWrite(supabase, id, notFoundFailure) {
    const { data: session } = await supabase
        .from('time_sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (!session) return { session: null, failure: notFoundFailure };
    return { session, failure: null };
}
