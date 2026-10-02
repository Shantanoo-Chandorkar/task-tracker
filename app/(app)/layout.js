import { Suspense } from 'react';
import { loadShellData } from '@/lib/app-shell-data';
import DesktopSidebar from '@/components/nav/DesktopSidebar';
import MobileTopBar from '@/components/nav/MobileTopBar';
import BottomNav from '@/components/nav/BottomNav';
import QuickCreateFab from '@/components/nav/QuickCreateFab';
import GlobalSearch from '@/components/nav/GlobalSearch';
import AuthKeepAlive from '@/components/nav/AuthKeepAlive';
import GuestBanner from '@/components/guest/GuestBanner';
import { SidebarSkeleton, TopBarSkeleton, BottomNavSkeleton } from '@/components/nav/NavSkeletons';

/**
 * Sidebar filled with the shared shell data once it has loaded.
 */
async function SidebarWithData() {
    const { initialSpaces, initialLists, initialProfile } = await loadShellData();
    return (
        <DesktopSidebar
            initialSpaces={initialSpaces}
            initialLists={initialLists}
            initialProfile={initialProfile}
        />
    );
}

/**
 * Guest banner filled with the shared shell data once it has loaded.
 */
async function GuestBannerWithData() {
    const { initialProfile } = await loadShellData();
    return <GuestBanner initialProfile={initialProfile} />;
}

/**
 * Mobile top bar filled with the shared shell data once it has loaded.
 */
async function TopBarWithData() {
    const { initialSpaces, initialLists, initialProfile } = await loadShellData();
    return (
        <MobileTopBar
            initialSpaces={initialSpaces}
            initialLists={initialLists}
            initialProfile={initialProfile}
        />
    );
}

/**
 * Bottom tab bar filled with the shared shell data once it has loaded.
 */
async function BottomNavWithData() {
    const { initialSpaces, initialLists } = await loadShellData();
    return <BottomNav initialSpaces={initialSpaces} initialLists={initialLists} />;
}

/**
 * Layout for every authenticated app route -- the nav chrome (auth) pages don't get.
 * Route protection itself happens in proxy.js, not here.
 *
 * Deliberately not async: it must not await anything, or the frame, the skeletons and the page below
 * cannot stream until the data has loaded. Each nav piece loads the shared data under its own Suspense.
 */
export default function AppLayout({ children }) {
    return (
        <>
            <AuthKeepAlive />
            <GlobalSearch />
            <div className="flex">
                <Suspense fallback={<SidebarSkeleton />}>
                    <SidebarWithData />
                </Suspense>
                {/* <body> is the real scroller for pull-to-refresh -- sidebar/top bar stay sticky/fixed. */}
                <div className="flex flex-1 flex-col min-w-0">
                    <Suspense fallback={null}>
                        <GuestBannerWithData />
                    </Suspense>
                    <Suspense fallback={<TopBarSkeleton />}>
                        <TopBarWithData />
                    </Suspense>
                    <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
                        {children}
                    </main>
                    <Suspense fallback={<BottomNavSkeleton />}>
                        <BottomNavWithData />
                    </Suspense>
                </div>
                <QuickCreateFab className="hidden lg:flex fixed bottom-10 right-6 z-30 h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg" />
            </div>
        </>
    );
}
