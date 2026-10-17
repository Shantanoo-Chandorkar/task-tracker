/**
 * Loads a habit for write; RLS (decision 6) already scopes rows to the caller - a miss is not-found either way.
 *
 * @param {SupabaseClient} supabase - Request-scoped Supabase client.
 * @param {string} id - Habit to load.
 * @param {{ error: string, code: string }} notFoundFailure - What to hand back when nothing is visible.
 * @returns {Promise<{ habit: Record<string, any>, failure: null }|{ habit: null, failure: Record<string, any> }>}
 */
export async function loadHabitForWrite(supabase, id, notFoundFailure) {
    const { data: habit } = await supabase.from('habits').select('*').eq('id', id).maybeSingle();
    if (!habit) return { habit: null, failure: notFoundFailure };
    return { habit, failure: null };
}
