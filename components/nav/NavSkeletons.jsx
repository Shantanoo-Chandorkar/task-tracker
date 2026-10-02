/**
 * Placeholder for the desktop sidebar, same outer box as the real one so nothing shifts when it loads.
 */
export function SidebarSkeleton() {
    return (
        <aside
            aria-hidden="true"
            className="hidden lg:flex sticky top-0 h-screen w-[20%] flex-shrink-0 flex-col gap-3 border-r border-border bg-sidebar p-3"
        >
            <div className="mb-1 h-5 w-32 rounded bg-muted animate-pulse" />
            <div className="h-8 w-full rounded-md bg-muted animate-pulse" />
            {[0, 1, 2, 3].map((row) => (
                <div key={row} className="h-4 w-3/4 rounded bg-muted animate-pulse" />
            ))}
        </aside>
    );
}

/**
 * Placeholder for the mobile/tablet top bar, same outer box as the real one.
 */
export function TopBarSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="lg:hidden translucent-bar sticky top-[var(--guest-banner-height,0px)] z-20 flex items-center justify-between gap-2 border-b px-3 py-3"
        >
            <div className="h-6 w-6 rounded bg-muted animate-pulse" />
            <div className="h-4 w-28 rounded bg-muted animate-pulse" />
            <div className="h-6 w-6 rounded bg-muted animate-pulse" />
        </div>
    );
}

/**
 * Placeholder for the mobile bottom tab bar, same outer box as the real one.
 */
export function BottomNavSkeleton() {
    return (
        <nav
            aria-hidden="true"
            className="lg:hidden translucent-bar fixed bottom-0 inset-x-0 z-20 border-t pb-[env(safe-area-inset-bottom)]"
        >
            <div className="flex items-center justify-around py-3">
                {[0, 1, 2, 3].map((tab) => (
                    <div key={tab} className="h-8 w-10 rounded bg-muted animate-pulse" />
                ))}
            </div>
        </nav>
    );
}
