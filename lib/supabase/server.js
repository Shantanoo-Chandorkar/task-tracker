import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { REMEMBER_ME_COOKIE, REMEMBER_ME_MAX_AGE_SECONDS } from '@/lib/auth/remember-me';

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
                    // @supabase/ssr's own 400-day cookie default only applies when "remember me" was chosen.
                    const isRemembered = cookieStore.get(REMEMBER_ME_COOKIE)?.value === '1';
                    cookiesToSet.forEach(({ name, value, options }) => {
                        const { maxAge: _maxAge, expires: _expires, ...rest } = options ?? {};
                        cookieStore.set(
                            name,
                            value,
                            isRemembered ? { ...rest, maxAge: REMEMBER_ME_MAX_AGE_SECONDS } : rest,
                        );
                    });
                } catch {
                    // Called from a Server Component — safe to ignore.
                    // Session refresh is handled by proxy.js.
                }
            },
        },
    });
}
