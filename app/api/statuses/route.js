import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * GET /api/statuses
 * Returns all statuses ordered by position.
 */
export async function GET() {
    try {
        const supabase = await createClient();

        const { data: statuses, error } = await supabase
            .from('statuses')
            .select('*')
            .order('position', { ascending: true });

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch statuses' }, { status: 500 });
        }

        return NextResponse.json(statuses || []);
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/statuses
 * Creates a new status. Appends it to the end of the status list.
 */
export async function POST(request) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { name, color } = body;

        if (!name || name.trim() === '') {
            return NextResponse.json({ error: 'Status name is required' }, { status: 400 });
        }

        // Append after the last status
        const { data: existing } = await supabase
            .from('statuses')
            .select('position')
            .order('position', { ascending: false })
            .limit(1);

        const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

        const { data, error } = await supabase
            .from('statuses')
            .insert({ name: name.trim(), color: color ?? '#6b7280', position })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to create status' }, { status: 500 });
        }

        revalidateTag('statuses');
        revalidateTag('task-tree');
        return NextResponse.json(data, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
