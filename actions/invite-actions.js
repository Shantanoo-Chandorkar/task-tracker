'use server';

import { headers } from 'next/headers';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { getClientIp } from '@/lib/auth/rate-limit';
import { generateInviteToken, hashInviteToken } from '@/lib/invites/invite-tokens';
import { INVITE_EXPIRY_DAYS } from '@/lib/invites/invite-config';
import { takeInviteSendSlot } from '@/lib/invites/invite-rate-limit';
import { sendSpaceInviteEmail } from '@/lib/email/notifications/send-space-invite-email';
import {
    SPACE_NOT_FOUND,
    ALREADY_MEMBER,
    REQUEST_NOT_FOUND,
    INVITE_INVALID,
    INVITE_EXPIRED,
    INVITE_EMAIL_MISMATCH,
    INVITE_RATE_LIMITED,
} from '@/lib/error-codes';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const GENERIC_INVITE_ERROR = 'This invite link is invalid or has already been used.';

/**
 * Builds the accept-invite link embedded in the invite email. No spaceId in the URL -- the
 * space is resolved server-side from the token hash, keeping the space's UUID out of an
 * unauthenticated, possibly-forwarded link.
 *
 * @param {string} rawToken - Freshly generated raw invite token.
 * @returns {string} Absolute accept-invite URL.
 */
function buildAcceptUrl(rawToken) {
    return `${process.env.SITE_URL}/invites/accept?token=${rawToken}`;
}

/**
 * Sends (or resends) a direct email invite for a space the caller owns. Redemption only ever
 * creates a normal pending join request -- this never grants access by itself.
 *
 * @param {object} fields
 * @param {string} fields.spaceId - UUID of the space to invite into.
 * @param {string} fields.email - Recipient's email address.
 * @returns {{ data: object|null, error: string|null, code: string|null }}
 */
export const sendSpaceInvite = withAuthenticatedAction(
    '[invites] send',
    'Unexpected error sending invite',
    async (user, supabase, fields) => {
        const email = (fields.email ?? '').trim().toLowerCase();
        if (!EMAIL_PATTERN.test(email)) {
            return { data: null, error: 'Enter a valid email address', code: null };
        }
        if (email === user.email.toLowerCase()) {
            return { data: null, error: "You can't invite yourself", code: null };
        }

        const ipAddress = getClientIp(await headers());
        const rateLimit = await takeInviteSendSlot(user.email, ipAddress);
        if (rateLimit.status === 'limited') {
            const retryAfterMinutes = rateLimit.retryAfterMinutes;
            return {
                data: null,
                error: `Too many invites sent. Try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`,
                code: INVITE_RATE_LIMITED,
            };
        }
        if (rateLimit.status === 'unavailable') {
            return {
                data: null,
                error: 'Could not send the invite right now. Try again shortly.',
                code: null,
            };
        }

        const spaceId = (fields.spaceId ?? '').trim();
        const adminSupabase = createAdminClient();
        const { data: space } = await adminSupabase
            .from('spaces')
            .select('name, owner_id')
            .eq('id', spaceId)
            .maybeSingle();

        if (!space || space.owner_id !== user.id) {
            return { data: null, error: 'No space found with that ID', code: SPACE_NOT_FOUND };
        }

        const { data: existingCollaborator } = await supabase
            .from('space_collaborators')
            .select('id')
            .eq('space_id', spaceId)
            .eq('status', 'accepted')
            .ilike('requester_email', email)
            .maybeSingle();
        if (existingCollaborator) {
            return {
                data: null,
                error: 'This person is already a collaborator',
                code: ALREADY_MEMBER,
            };
        }

        const { rawToken, tokenHash } = generateInviteToken();
        const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * DAY_MS).toISOString();

        const { data: existingInvite } = await supabase
            .from('space_invites')
            .select('id')
            .eq('space_id', spaceId)
            .eq('invited_email', email)
            .eq('status', 'pending')
            .maybeSingle();

        let invite;
        let writeError;
        if (existingInvite) {
            ({ data: invite, error: writeError } = await supabase
                .from('space_invites')
                .update({ token_hash: tokenHash, expires_at: expiresAt, invited_by: user.id })
                .eq('id', existingInvite.id)
                .select()
                .single());
        } else {
            ({ data: invite, error: writeError } = await supabase
                .from('space_invites')
                .insert({
                    space_id: spaceId,
                    invited_email: email,
                    invited_by: user.id,
                    token_hash: tokenHash,
                    expires_at: expiresAt,
                })
                .select()
                .single());
        }

        if (writeError) {
            return { data: null, error: 'Failed to send invite', code: null };
        }

        await sendSpaceInviteEmail(email, space.name, user.email, buildAcceptUrl(rawToken));

        return {
            data: {
                id: invite.id,
                invited_email: invite.invited_email,
                status: invite.status,
                expires_at: invite.expires_at,
            },
            error: null,
            code: null,
        };
    },
    { blockGuest: true },
);

/**
 * Revokes a not-yet-redeemed invite. Once an invite is redeemed it becomes a normal join
 * request, which the owner handles via the existing reject/remove flow instead.
 *
 * @param {object} fields
 * @param {string} fields.inviteId
 * @returns {{ error: string|null, code: string|null }}
 */
export const revokeSpaceInvite = withAuthenticatedAction(
    '[invites] revoke',
    'Unexpected error revoking invite',
    async (user, supabase, fields) => {
        const { data: revokedRow, error } = await supabase
            .from('space_invites')
            .update({ status: 'revoked' })
            .eq('id', fields.inviteId)
            .eq('status', 'pending')
            .select()
            .maybeSingle();

        if (error || !revokedRow) {
            return { error: 'Invite not found', code: REQUEST_NOT_FOUND };
        }

        return { error: null, code: null };
    },
    { blockGuest: true, hasData: false },
);

/**
 * Redeems an invite token into a normal pending join request, same as the manual flow.
 * Never grants access by itself -- the owner still has to approve the resulting request.
 *
 * @param {object} fields
 * @param {string} fields.token - Raw token from the accept-invite URL.
 * @returns {{ data: object|null, error: string|null, code: string|null }}
 */
export const redeemSpaceInvite = withAuthenticatedAction(
    '[invites] redeem',
    'Unexpected error redeeming invite',
    async (user, supabase, fields) => {
        const rawToken = (fields.token ?? '').trim();
        if (!rawToken) {
            return { data: null, error: GENERIC_INVITE_ERROR, code: INVITE_INVALID };
        }
        const tokenHash = hashInviteToken(rawToken);

        const adminSupabase = createAdminClient();
        const { data: invite } = await adminSupabase
            .from('space_invites')
            .select('id, space_id, invited_email, status, expires_at, redeemed_by')
            .eq('token_hash', tokenHash)
            .maybeSingle();

        if (!invite) {
            return { data: null, error: GENERIC_INVITE_ERROR, code: INVITE_INVALID };
        }

        // Idempotent: a double-click, or returning to a link already redeemed by this same account.
        if (invite.status === 'redeemed' && invite.redeemed_by === user.id) {
            const { data: space } = await adminSupabase
                .from('spaces')
                .select('name')
                .eq('id', invite.space_id)
                .maybeSingle();
            return {
                data: {
                    spaceId: invite.space_id,
                    spaceName: space?.name ?? null,
                    alreadySubmitted: true,
                },
                error: null,
                code: null,
            };
        }

        // Never-existed / used by someone else / revoked all collapse to one message -- enumeration resistance.
        if (invite.status !== 'pending') {
            return { data: null, error: GENERIC_INVITE_ERROR, code: INVITE_INVALID };
        }

        if (Date.parse(invite.expires_at) <= Date.now()) {
            return {
                data: null,
                error: 'This invite has expired. Ask the space owner to send a new one.',
                code: INVITE_EXPIRED,
            };
        }

        if (invite.invited_email.toLowerCase() !== user.email.toLowerCase()) {
            return {
                data: null,
                error: `This invite was sent to ${invite.invited_email}. You are signed in as ${user.email}.`,
                code: INVITE_EMAIL_MISMATCH,
            };
        }

        const { data: redeemedInvite, error: redeemError } = await supabase
            .from('space_invites')
            .update({
                status: 'redeemed',
                redeemed_at: new Date().toISOString(),
                redeemed_by: user.id,
            })
            .eq('id', invite.id)
            .eq('status', 'pending')
            .select()
            .maybeSingle();

        // Lost a race (e.g. the owner revoked it, or another tab redeemed it, between the read above and here).
        if (redeemError || !redeemedInvite) {
            return { data: null, error: GENERIC_INVITE_ERROR, code: INVITE_INVALID };
        }

        const { data: space } = await supabase
            .from('spaces')
            .select('name')
            .eq('id', invite.space_id)
            .maybeSingle();

        const { error: requestError } = await supabase
            .from('space_collaborators')
            .insert({ space_id: invite.space_id, user_id: user.id, requester_email: user.email });

        // A pre-existing pending/accepted row for this (space, user) is a harmless duplicate, not a failure.
        if (requestError && requestError.code !== '23505') {
            console.error('[invites] failed to create join request after redemption', {
                inviteId: invite.id,
                detail: requestError.message,
            });
            return { data: null, error: 'Could not submit your request. Try again.', code: null };
        }

        return {
            data: {
                spaceId: invite.space_id,
                spaceName: space?.name ?? null,
                alreadySubmitted: false,
            },
            error: null,
            code: null,
        };
    },
    { blockGuest: true },
);
