import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

/**
 * Secret-key Supabase client -- bypasses RLS entirely. Server-only; never import from a
 * 'use client' file. Uses the current "Secret key", not the legacy service_role key.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createClient() {
    return createSupabaseClient(supabaseUrl, secretKey);
}
