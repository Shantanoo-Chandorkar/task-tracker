import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { buildSessionCookieOptions } from '@/lib/auth/session-cookies';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function createClient() {
    const cookieStore = await cookies();
    return createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, buildSessionCookieOptions(options));
                    });
                } catch {
                    // Called from a Server Component - safe to ignore.
                    // Session refresh is handled by proxy.js.
                }
            },
        },
    });
}
