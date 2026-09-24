import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getCurrentUserProfile } from '@/lib/profile';
import { attachTaskCounts } from '@/lib/list-task-counts';
import { attachMyPermissionLevel } from '@/lib/permissions/space-permissions';
import DesktopSidebar from '@/components/nav/DesktopSidebar';
import MobileTopBar from '@/components/nav/MobileTopBar';
import BottomNav from '@/components/nav/BottomNav';
import QuickCreateFab from '@/components/nav/QuickCreateFab';
import GlobalSearch from '@/components/nav/GlobalSearch';
import AuthKeepAlive from '@/components/nav/AuthKeepAlive';
import GuestBanner from '@/components/guest/GuestBanner';

/**
 * Layout for every authenticated app route -- the nav chrome (auth) pages don't get.
 * Route protection itself happens in proxy.js, not here.
 *
 * Fetches spaces/lists/profile once here so every always-mounted nav component can seed initialData.
 */
export default async function AppLayout({ children }) {
    const supabase = await createClient();
    const user = await getCurrentUser();

    const [{ data: spaces }, { data: lists }] = await Promise.all([
        supabase.from('spaces').select('*').order('position', { ascending: true }),
        supabase.from('lists').select('*').order('position', { ascending: true }),
    ]);

    // Must match every page's own shape - whichever seeds the shared ['spaces'] key first wins.
    const initialSpaces = await attachMyPermissionLevel(supabase, spaces || [], user?.id ?? null);
    const initialLists = await attachTaskCounts(supabase, lists || []);
    const initialProfile = user ? await getCurrentUserProfile(supabase, user) : null;

    return (
        <>
            <AuthKeepAlive />
            <GlobalSearch />
            <div className="flex">
                <DesktopSidebar
                    initialSpaces={initialSpaces}
                    initialLists={initialLists}
                    initialProfile={initialProfile}
                />
                {/* <body> is the real scroller for pull-to-refresh -- sidebar/top bar stay sticky/fixed. */}
                <div className="flex flex-1 flex-col min-w-0">
                    <GuestBanner initialProfile={initialProfile} />
                    <MobileTopBar
                        initialSpaces={initialSpaces}
                        initialLists={initialLists}
                        initialProfile={initialProfile}
                    />
                    <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
                        {children}
                    </main>
                    <BottomNav initialSpaces={initialSpaces} initialLists={initialLists} />
                </div>
                <QuickCreateFab className="hidden lg:flex fixed bottom-10 right-6 z-30 h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg" />
            </div>
        </>
    );
}
