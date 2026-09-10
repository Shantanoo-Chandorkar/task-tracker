import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * GET /api/spaces
 * Returns all spaces ordered by position.
 */
export async function GET() {
    try {
        const supabase = await createClient();

        const { data: spaces, error } = await supabase
            .from('spaces')
            .select('*')
            .order('position', { ascending: true });

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch spaces' }, { status: 500 });
        }

        return NextResponse.json(spaces || []);
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/spaces
 * Creates a new space. Appends it to the end of the space list.
 */
export async function POST(request) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { name, color } = body;

        if (!name || name.trim() === '') {
            return NextResponse.json({ error: 'Space name is required' }, { status: 400 });
        }

        const { data: existing } = await supabase
            .from('spaces')
            .select('position')
            .order('position', { ascending: false })
            .limit(1);

        const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

        const { data, error } = await supabase
            .from('spaces')
            .insert({ name: name.trim(), color: color ?? '#6b7280', position })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to create space' }, { status: 500 });
        }

        revalidateTag('spaces');
        return NextResponse.json(data, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
