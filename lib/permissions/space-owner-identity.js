import { createClient as createAdminClient } from '@/lib/supabase/admin';

/**
 * Attaches each space's owner_display_name, resolved server-side via the admin client.
 * RLS blocks reading another user's profiles row directly - falls back to the owner's auth email.
 *
 * Server-only - never import this from a 'use client' file (see lib/supabase/admin.js).
 *
 * @param {object[]} spaces - Spaces to annotate, each with an owner_id
 * @returns {Promise<object[]>} The same spaces, each with owner_display_name added
 */
export async function attachOwnerDisplayName(spaces) {
    if (spaces.length === 0) return spaces;

    const adminSupabase = createAdminClient();
    const ownerIds = [...new Set(spaces.map((space) => space.owner_id))];

    const { data: profiles } = await adminSupabase
        .from('profiles')
        .select('id, display_name')
        .in('id', ownerIds);

    const displayNameByOwnerId = new Map(
        (profiles || [])
            .filter((profile) => profile.display_name)
            .map((profile) => [profile.id, profile.display_name]),
    );

    const missingOwnerIds = ownerIds.filter((ownerId) => !displayNameByOwnerId.has(ownerId));
    await Promise.all(
        missingOwnerIds.map(async (ownerId) => {
            const { data: ownerAuthUser } = await adminSupabase.auth.admin.getUserById(ownerId);
            if (ownerAuthUser?.user?.email) {
                displayNameByOwnerId.set(ownerId, ownerAuthUser.user.email);
            }
        }),
    );

    return spaces.map((space) => ({
        ...space,
        owner_display_name: displayNameByOwnerId.get(space.owner_id) ?? null,
    }));
}
