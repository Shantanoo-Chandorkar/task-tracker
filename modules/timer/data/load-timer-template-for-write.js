/**
 * Loads a timer template for write; RLS already scopes rows to the caller - a miss is not-found either way.
 *
 * @param {SupabaseClient} supabase - Request-scoped Supabase client.
 * @param {string} id - Template to load.
 * @param {{ error: string, code: string }} notFoundFailure - What to hand back when nothing is visible.
 * @returns {Promise<{ template: Record<string, any>, failure: null }|{ template: null, failure: Record<string, any> }>}
 */
export async function loadTimerTemplateForWrite(supabase, id, notFoundFailure) {
    const { data: template } = await supabase
        .from('timer_templates')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (!template) return { template: null, failure: notFoundFailure };
    return { template, failure: null };
}
