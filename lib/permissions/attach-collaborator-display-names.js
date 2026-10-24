import { createClient as createAdminClient } from '@/lib/supabase/admin';

/**
 * Attaches each collaborator's display_name, resolved server-side via the admin client.
 * RLS blocks reading another user's profiles row directly - falls back to requester_email.
 *
 * Server-only - never import this from a 'use client' file (see lib/supabase/admin.js).
 *
 * @param {object[]} collaborators - space_collaborators rows, each with a user_id
 * @returns {Promise<object[]>} The same rows, each with a display_name added
 */
export async function attachCollaboratorDisplayNames(collaborators) {
    if (collaborators.length === 0) return collaborators;

    const adminSupabase = createAdminClient();
    const { data: profiles } = await adminSupabase
        .from('profiles')
        .select('id, display_name')
        .in(
            'id',
            collaborators.map((collaborator) => collaborator.user_id),
        );

    const displayNameByUserId = new Map(
        (profiles || []).map((profile) => [profile.id, profile.display_name]),
    );

    return collaborators.map((collaborator) => ({
        ...collaborator,
        display_name: displayNameByUserId.get(collaborator.user_id) ?? null,
    }));
}
