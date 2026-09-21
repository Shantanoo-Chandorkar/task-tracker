import DesktopSidebar from '@/components/nav/DesktopSidebar';
import MobileTopBar from '@/components/nav/MobileTopBar';
import BottomNav from '@/components/nav/BottomNav';
import QuickCreateFab from '@/components/nav/QuickCreateFab';
import GlobalSearch from '@/components/nav/GlobalSearch';
import AuthKeepAlive from '@/components/nav/AuthKeepAlive';

/**
 * Layout for every authenticated app route -- the nav chrome (auth) pages don't get.
 * Route protection itself happens in proxy.js, not here.
 */
export default function AppLayout({ children }) {
    return (
        <>
            <AuthKeepAlive />
            <GlobalSearch />
            <div className="flex">
                <DesktopSidebar />
                {/* <body> is the real scroller for pull-to-refresh -- sidebar/top bar stay sticky/fixed. */}
                <div className="flex flex-1 flex-col min-w-0">
                    <MobileTopBar />
                    <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
                        {children}
                    </main>
                    <BottomNav />
                </div>
                {/* bottom-20 clears the TanStack Query devtools toggle, which also docks bottom-right in dev. */}
                <QuickCreateFab className="hidden lg:flex fixed bottom-20 right-6 z-30 h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg" />
            </div>
        </>
    );
}
