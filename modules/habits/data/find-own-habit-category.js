/**
 * Looks up a habit category by id, to prove a habit's `category_id` belongs to the caller (the FK alone doesn't).
 *
 * @param {SupabaseClient} supabase - Request-scoped Supabase client.
 * @param {string} categoryId - Category id to check.
 * @returns {Promise<{ id: string }|null>} The category's id, or null when it is not the caller's own.
 */
export async function findOwnHabitCategoryById(supabase, categoryId) {
    const { data: category } = await supabase
        .from('habit_categories')
        .select('id')
        .eq('id', categoryId)
        .maybeSingle();
    return category ?? null;
}
