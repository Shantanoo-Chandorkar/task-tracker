import { NextResponse } from 'next/server';
import { NOT_AUTHENTICATED, WEBHOOK_SWEEP_FAILED } from '@/lib/error-codes';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { isSweeperRequestAuthorized } from '@/lib/webhooks/sweeper-auth';
import { runWebhookSweep } from '@/lib/webhooks/webhook-delivery-runner';

// The sweep stops itself after 45s; this is the platform ceiling on the Hobby plan
export const maxDuration = 60;

/**
 * POST /api/webhooks/deliver
 * Delivers due webhooks. Woken by the database only when work is waiting; the shared secret keeps everyone else out.
 *
 * @param {Request} request - Must carry `Authorization: Bearer <WEBHOOK_SWEEPER_SECRET>`.
 * @returns {Promise<NextResponse>} Counts by outcome; never any URL, payload or secret.
 */
export async function POST(request) {
    if (
        !isSweeperRequestAuthorized(
            request.headers.get('authorization'),
            process.env.WEBHOOK_SWEEPER_SECRET,
        )
    )
        return NextResponse.json(
            { error: 'Unauthorized', code: NOT_AUTHENTICATED },
            { status: 401 },
        );

    try {
        const sweepSummary = await runWebhookSweep({ adminClient: createAdminClient() });
        if (sweepSummary.error)
            return NextResponse.json(
                { error: 'Delivery sweep failed', code: WEBHOOK_SWEEP_FAILED },
                { status: 500 },
            );
        return NextResponse.json(sweepSummary);
    } catch (sweepError) {
        console.error('[webhooks] sweep crashed', { detail: sweepError.message });
        return NextResponse.json(
            { error: 'Delivery sweep failed', code: WEBHOOK_SWEEP_FAILED },
            { status: 500 },
        );
    }
}
