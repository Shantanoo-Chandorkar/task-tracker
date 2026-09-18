import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /auth/confirm?token_hash=...&type=recovery&next=/reset-password
 * Verifies the one-time token and establishes the recovery session before redirecting to the form.
 */
export async function GET(request) {
    const { searchParams, origin } = new URL(request.url);
    const tokenHash = searchParams.get('token_hash');
    const otpType = searchParams.get('type');
    const next = searchParams.get('next') ?? '/';

    if (tokenHash && otpType) {
        const supabase = await createClient();
        const { error } = await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash });
        if (!error) {
            return NextResponse.redirect(new URL(next, origin));
        }
    }

    return NextResponse.redirect(new URL('/forgot-password', origin));
}
