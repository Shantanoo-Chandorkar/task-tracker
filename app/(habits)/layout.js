import AppShell from '@/components/nav/AppShell';

/**
 * Layout for every Habit Zone route - a sibling route group to app/(app), sharing the same
 * zone-agnostic AppShell. Each nav piece inside it decides its own content from the pathname.
 */
export default function HabitsLayout({ children }) {
    return <AppShell>{children}</AppShell>;
}
