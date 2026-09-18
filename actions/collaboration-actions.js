'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { NOT_AUTHENTICATED, SPACE_NOT_FOUND, ALREADY_MEMBER, REQUEST_NOT_FOUND } from '@/lib/error-codes';
import { sendJoinRequestEmail } from '@/lib/email/send-join-request-email';
import { sendJoinDecisionEmail } from '@/lib/email/send-join-decision-email';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Requests to join a space by ID. Always leaves a pending row for the owner to review, and
 * emails the owner -- never auto-accepts, and never lets a Brevo failure block the request.
 *
 * @param {object} fields
 * @param {string} fields.spaceId - UUID of the space to join
 * @returns {{ data: object|null, error: string|null, code: string|null }}
 */
export async function requestToJoinSpace(fields) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED };

    const spaceId = (fields.spaceId ?? '').trim();
    if (!UUID_PATTERN.test(spaceId)) {
        return { data: null, error: 'Enter a valid space ID', code: null };
    }

    try {
        const adminSupabase = createAdminClient();
        const { data: targetSpace } = await adminSupabase
            .from('spaces')
            .select('name, owner_id')
            .eq('id', spaceId)
            .maybeSingle();

        if (!targetSpace) {
            return { data: null, error: 'No space found with that ID', code: SPACE_NOT_FOUND };
        }
        if (targetSpace.owner_id === user.id) {
            return { data: null, error: 'You already own this space', code: null };
        }

        const supabase = await createClient();
        const { data: createdRequest, error } = await supabase
            .from('space_collaborators')
            .insert({ space_id: spaceId, user_id: user.id, requester_email: user.email })
            .select()
            .single();

        if (error?.code === '23505') {
            return { data: null, error: 'You already requested or joined this space', code: ALREADY_MEMBER };
        }
        if (error) {
            return { data: null, error: 'Failed to send join request', code: null };
        }

        const { data: ownerAuthUser, error: ownerLookupError } = await adminSupabase.auth.admin.getUserById(
            targetSpace.owner_id,
        );
        if (ownerAuthUser?.user?.email) {
            await sendJoinRequestEmail(ownerAuthUser.user.email, targetSpace.name, user.email);
        } else {
            console.error('[collaboration] could not resolve owner email for join-request notice', {
                spaceId,
                detail: ownerLookupError?.message,
            });
        }

        return { data: createdRequest, error: null, code: null };
    } catch {
        return { data: null, error: 'Unexpected error sending join request', code: null };
    }
}

/**
 * Approves a pending join request. RLS restricts the update to the space's own owner, so an
 * update affecting zero rows means either the request doesn't exist or the caller isn't the owner.
 *
 * @param {object} fields
 * @param {string} fields.requestId
 * @returns {{ data: object|null, error: string|null, code: string|null }}
 */
export async function approveJoinRequest(fields) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED };

    try {
        const supabase = await createClient();
        const { data: acceptedRow, error } = await supabase
            .from('space_collaborators')
            .update({ status: 'accepted' })
            .eq('id', fields.requestId)
            .eq('status', 'pending')
            .select()
            .maybeSingle();

        if (error || !acceptedRow) {
            return { data: null, error: 'Request not found', code: REQUEST_NOT_FOUND };
        }

        const { data: space, error: spaceLookupError } = await supabase
            .from('spaces')
            .select('name')
            .eq('id', acceptedRow.space_id)
            .single();
        if (space) {
            await sendJoinDecisionEmail(acceptedRow.requester_email, space.name, true);
        } else {
            console.error('[collaboration] could not resolve space name for decision notice', {
                requestId: fields.requestId,
                detail: spaceLookupError?.message,
            });
        }

        return { data: acceptedRow, error: null, code: null };
    } catch {
        return { data: null, error: 'Unexpected error approving request', code: null };
    }
}

/**
 * Rejects (deletes) a pending join request. Same owner-only RLS guarantee as approve.
 *
 * @param {object} fields
 * @param {string} fields.requestId
 * @returns {{ error: string|null, code: string|null }}
 */
export async function rejectJoinRequest(fields) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    try {
        const supabase = await createClient();
        const { data: rejectedRow, error } = await supabase
            .from('space_collaborators')
            .delete()
            .eq('id', fields.requestId)
            .eq('status', 'pending')
            .select()
            .maybeSingle();

        if (error || !rejectedRow) {
            return { error: 'Request not found', code: REQUEST_NOT_FOUND };
        }

        const { data: space, error: spaceLookupError } = await supabase
            .from('spaces')
            .select('name')
            .eq('id', rejectedRow.space_id)
            .single();
        if (space) {
            await sendJoinDecisionEmail(rejectedRow.requester_email, space.name, false);
        } else {
            console.error('[collaboration] could not resolve space name for decision notice', {
                requestId: fields.requestId,
                detail: spaceLookupError?.message,
            });
        }

        return { error: null, code: null };
    } catch {
        return { error: 'Unexpected error rejecting request', code: null };
    }
}

/**
 * Removes an accepted collaborator from a space. Owner-only via the same DELETE RLS policy.
 *
 * @param {object} fields
 * @param {string} fields.collaboratorId
 * @returns {{ error: string|null, code: string|null }}
 */
export async function removeCollaborator(fields) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    try {
        const supabase = await createClient();
        const { data: removedRow, error } = await supabase
            .from('space_collaborators')
            .delete()
            .eq('id', fields.collaboratorId)
            .eq('status', 'accepted')
            .select()
            .maybeSingle();

        if (error || !removedRow) {
            return { error: 'Collaborator not found', code: REQUEST_NOT_FOUND };
        }

        return { error: null, code: null };
    } catch {
        return { error: 'Unexpected error removing collaborator', code: null };
    }
}

/**
 * Cancels the caller's own pending request, or leaves a space they've been accepted into --
 * same DELETE RLS policy covers both since it just matches on the caller's own row.
 *
 * @param {object} fields
 * @param {string} fields.spaceId
 * @returns {{ error: string|null, code: string|null }}
 */
export async function leaveSpace(fields) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    try {
        const supabase = await createClient();
        const { data: removedRow, error } = await supabase
            .from('space_collaborators')
            .delete()
            .eq('space_id', fields.spaceId)
            .eq('user_id', user.id)
            .select()
            .maybeSingle();

        if (error || !removedRow) {
            return { error: 'You are not a member of this space', code: null };
        }

        return { error: null, code: null };
    } catch {
        return { error: 'Unexpected error leaving space', code: null };
    }
}
