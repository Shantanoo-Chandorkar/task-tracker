import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeRedirectPath } from '@/lib/validation';

/**
 * GET /auth/confirm?token_hash=...&type=recovery|signup&next=...
 * Verifies the one-time token (recovery or signup confirmation) before redirecting onward.
 */
export async function GET(request) {
    const { searchParams, origin } = new URL(request.url);
    const tokenHash = searchParams.get('token_hash');
    const otpType = searchParams.get('type');
    const next = sanitizeRedirectPath(searchParams.get('next'));

    if (tokenHash && otpType) {
        const supabase = await createClient();
        const { error } = await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash });
        if (!error) {
            return NextResponse.redirect(new URL(next, origin));
        }
    }

    return NextResponse.redirect(new URL('/login', origin));
}
