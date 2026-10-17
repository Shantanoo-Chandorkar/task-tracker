/**
 * Works out how deep a task placed under a parent sits: one below the parent, or 0 for a root task.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string|null|undefined} parentId - Parent task, if any
 * @returns {Promise<number>} The depth the child would have
 */
export async function resolveDepthBelowParent(supabase, parentId) {
    if (!parentId) return 0;
    const { data: parent } = await supabase
        .from('tasks')
        .select('depth')
        .eq('id', parentId)
        .single();
    return parent ? parent.depth + 1 : 0;
}
