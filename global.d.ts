/**
 * Keeps checkJs scoped to modules/**.
 * lib/'s own JSDoc has never been verified, so its exports are typed `any` here, not pulled in as real types.
 */
declare module '@/lib/*';
declare module '@/actions/*';

// Global aliases so modules/** can type supabase/user params without an import() in every JSDoc tag.
type SupabaseClient = import('@supabase/supabase-js').SupabaseClient;
type AuthUser = import('@supabase/supabase-js').AuthUser;

// Overrides the '@/lib/*' shim above - without it every wrapped handler's user/supabase would be 'any'.
declare module '@/lib/auth/with-authenticated-action' {
    export function withAuthenticatedAction<Args extends any[], Result>(
        logLabel: string,
        unexpectedError: string,
        handler: (user: AuthUser, supabase: SupabaseClient, ...args: Args) => Promise<Result>,
        options?: { blockGuest?: boolean; hasData?: boolean },
    ): (...args: Args) => Promise<Result>;
}
