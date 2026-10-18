import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { withApiErrorHandling, requireAuthResponse, queryFailedResponse } from '@/lib/api-response';
import { HABIT_CATEGORIES_LOAD_FAILED } from '@/modules/habits/errors';

/**
 * GET /api/habit-categories
 * Returns every habit category of the signed-in caller, in their saved order.
 */
export const GET = withApiErrorHandling(async function GET() {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const supabase = await createClient();

    const { data: categories, error } = await supabase
        .from('habit_categories')
        .select('*')
        .order('position', { ascending: true });

    if (error) {
        return queryFailedResponse(
            '[api/habit-categories]',
            error,
            'Failed to fetch categories',
            HABIT_CATEGORIES_LOAD_FAILED,
        );
    }

    return NextResponse.json(categories || []);
});
