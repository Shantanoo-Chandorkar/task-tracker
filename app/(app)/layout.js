import AppShell from '@/components/nav/AppShell';

/**
 * Layout for every Task Tracker route - the shared chrome lives in AppShell, which is
 * zone-agnostic and reused by app/(habits)/layout.js.
 */
export default function AppLayout({ children }) {
    return <AppShell>{children}</AppShell>;
}
