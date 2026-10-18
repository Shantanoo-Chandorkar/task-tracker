import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { withApiErrorHandling, requireAuthResponse, queryFailedResponse } from '@/lib/api-response';
import { TIMER_TEMPLATES_LOAD_FAILED } from '@/modules/timer/errors';

/**
 * GET /api/timer-templates
 * Returns every timer template of the signed-in caller, newest first.
 */
export const GET = withApiErrorHandling(async function GET() {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const supabase = await createClient();

    const { data: templates, error } = await supabase
        .from('timer_templates')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        return queryFailedResponse(
            '[api/timer-templates]',
            error,
            'Failed to fetch timer templates',
            TIMER_TEMPLATES_LOAD_FAILED,
        );
    }

    return NextResponse.json(templates || []);
});
