import Link from 'next/link';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { hashInviteToken } from '@/lib/invites/invite-tokens';
import AcceptInviteCard from '@/components/invites/AcceptInviteCard';

export const metadata = { title: 'Accept invite - Task Tracker' };

/**
 * Server-side, side-effect-free preview of an invite by its token hash -- never redeems it, so
 * an email client or scanner auto-fetching this URL can't burn a single-use token. `state`
 * distinguishes "genuinely expired" (its own message) from "invalid" (never existed, revoked,
 * or already used by someone else -- deliberately one message for all three, enumeration
 * resistance) rather than collapsing every non-redeemable case into "expired."
 *
 * @param {string} rawToken
 * @returns {Promise<{ spaceId: string, spaceName: string|null, state: 'redeemable'|'expired'|'invalid' }|null>}
 *   `null` when the token doesn't resolve to any invite at all.
 */
async function loadInvitePreview(rawToken) {
    const adminSupabase = createAdminClient();
    const { data: invite } = await adminSupabase
        .from('space_invites')
        .select('space_id, status, expires_at, spaces(name)')
        .eq('token_hash', hashInviteToken(rawToken))
        .maybeSingle();

    if (!invite) return null;

    const spaceId = invite.space_id;
    const spaceName = invite.spaces?.name ?? null;

    if (invite.status !== 'pending') return { spaceId, spaceName, state: 'invalid' };
    if (Date.parse(invite.expires_at) <= Date.now())
        return { spaceId, spaceName, state: 'expired' };
    return { spaceId, spaceName, state: 'redeemable' };
}

/**
 * Public accept-invite page. Never grants access by itself -- redeeming still only creates a
 * normal pending join request that the space owner must approve, same as the manual flow.
 *
 * @param {object} props
 * @param {Promise<{ token?: string }>} props.searchParams
 * @returns {Promise<JSX.Element>}
 */
export default async function AcceptInvitePage({ searchParams }) {
    const { token } = await searchParams;

    if (!token) {
        return (
            <InviteMessageCard title="Invalid invite link">
                This link is missing its invite token.
            </InviteMessageCard>
        );
    }

    const preview = await loadInvitePreview(token);
    if (!preview || preview.state === 'invalid') {
        return (
            <InviteMessageCard title="Invalid invite link">
                This invite link is invalid or has already been used.
            </InviteMessageCard>
        );
    }
    if (preview.state === 'expired') {
        return (
            <InviteMessageCard title="This invite has expired">
                Ask the space owner to send a new one.
            </InviteMessageCard>
        );
    }

    const user = await getCurrentUser();
    const nextPath = `/invites/accept?token=${token}`;

    if (!user) {
        return (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
                <h1 className="text-lg font-semibold text-foreground">
                    You&apos;re invited to join &quot;{preview.spaceName ?? 'a space'}&quot;
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Log in or sign up with this invite&apos;s email address to send a request to
                    join.
                </p>
                <div className="mt-6 flex flex-col gap-2">
                    <Link
                        href={`/login?next=${encodeURIComponent(nextPath)}`}
                        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                    >
                        Log in
                    </Link>
                    <Link
                        href={`/signup?next=${encodeURIComponent(nextPath)}`}
                        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium"
                    >
                        Sign up
                    </Link>
                </div>
            </div>
        );
    }

    return <AcceptInviteCard token={token} spaceName={preview.spaceName} />;
}

/** Static centered-card message, for the invalid/expired invite states. */
function InviteMessageCard({ title, children }) {
    return (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{children}</p>
        </div>
    );
}
