import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import BottomNav from './BottomNav';
import SidebarNav from './SidebarNav';

const currentPath = vi.hoisted(() => ({ value: '/' }));
const currentSearch = vi.hoisted(() => ({ value: '' }));

vi.mock('next/link', () => ({
    default: ({ children, href, ...rest }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));
vi.mock('next/navigation', () => ({
    usePathname: () => currentPath.value,
    useParams: () => ({}),
    useSearchParams: () => new URLSearchParams(currentSearch.value),
}));
vi.mock('@/hooks/useSpacesQuery', () => ({ useSpacesQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useListsQuery', () => ({ useListsQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useCurrentUserProfileQuery', () => ({
    useCurrentUserProfileQuery: () => ({ data: null }),
}));
vi.mock('./QuickCreateFab', () => ({ default: () => null }));
vi.mock('@/components/habits/HabitQuickCreateFab', () => ({ default: () => null }));
vi.mock('@/components/ThemeToggle', () => ({ default: () => null }));
vi.mock('@/components/nav/LogoutButton', () => ({ default: () => null }));

afterEach(() => {
    cleanup();
    currentSearch.value = '';
});

function currentLinks(navigationName) {
    return screen
        .getByRole('navigation', { name: navigationName })
        .querySelectorAll('a[aria-current="page"]');
}

describe('BottomNav', () => {
    it('is a labelled navigation, different from the sidebar one', () => {
        render(<BottomNav initialSpaces={[]} initialLists={[]} />);

        expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    });

    it.each([
        ['/', 'Home'],
        ['/lists/abc', 'Tasks'],
        ['/spaces', 'Spaces'],
        ['/settings', 'Settings'],
    ])('marks only the %s link as the current page', (path, linkName) => {
        currentPath.value = path;
        render(<BottomNav initialSpaces={[]} initialLists={[]} />);

        const links = currentLinks('Primary');
        expect(links).toHaveLength(1);
        expect(links[0].textContent).toBe(linkName);
    });
});

describe('BottomNav - Habit Zone', () => {
    it.each([
        ['/habits', 'Habits'],
        ['/habits/categories', 'Categories'],
        ['/habits/analytics', 'Analytics'],
        ['/settings', 'Settings'],
    ])('marks only the %s link as the current page', (path, linkName) => {
        currentPath.value = path;
        render(<BottomNav initialSpaces={[]} initialLists={[]} />);

        const links = currentLinks('Primary');
        expect(links).toHaveLength(1);
        expect(links[0].textContent).toBe(linkName);
    });

    it('no longer offers a Switch to Tasks tab - that moved to the hamburger drawer', () => {
        currentPath.value = '/habits';
        render(<BottomNav initialSpaces={[]} initialLists={[]} />);

        expect(screen.queryByText('Switch to Tasks')).toBeNull();
        expect(screen.getByText('Analytics')).toBeTruthy();
    });
});

describe('BottomNav - zone-aware Settings', () => {
    it('shows the default Task Tracker tabs on a bare /settings with no zone param', () => {
        currentPath.value = '/settings';
        render(<BottomNav initialSpaces={[]} initialLists={[]} />);

        expect(screen.getByText('Home')).toBeTruthy();
        expect(screen.queryByText('Categories')).toBeNull();
        expect(screen.queryByText('Timer')).toBeNull();
    });

    it('keeps the Habit Zone tabs on /settings?zone=habits', () => {
        currentPath.value = '/settings';
        currentSearch.value = 'zone=habits';
        render(<BottomNav initialSpaces={[]} initialLists={[]} />);

        expect(screen.getByText('Categories')).toBeTruthy();
        expect(screen.getByText('Analytics')).toBeTruthy();
        expect(screen.queryByText('Home')).toBeNull();
    });

    it('keeps the Time Tracking tabs on /settings?zone=timer', () => {
        currentPath.value = '/settings';
        currentSearch.value = 'zone=timer';
        render(<BottomNav initialSpaces={[]} initialLists={[]} />);

        expect(screen.getByText('Timer')).toBeTruthy();
        expect(screen.queryByText('Home')).toBeNull();
    });

    it("Habit Zone's own Settings link carries zone=habits", () => {
        currentPath.value = '/habits';
        render(<BottomNav initialSpaces={[]} initialLists={[]} />);

        expect(screen.getByText('Settings').closest('a').getAttribute('href')).toBe(
            '/settings?zone=habits',
        );
    });

    it("Time Tracking's own Settings link carries zone=timer", () => {
        currentPath.value = '/timer';
        render(<BottomNav initialSpaces={[]} initialLists={[]} />);

        expect(screen.getByText('Settings').closest('a').getAttribute('href')).toBe(
            '/settings?zone=timer',
        );
    });
});

describe('SidebarNav', () => {
    it('is a labelled navigation', () => {
        render(<SidebarNav initialSpaces={[]} initialLists={[]} />);

        expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    });

    it.each([
        ['/', 'Home'],
        ['/spaces', 'Spaces'],
        ['/settings', 'Settings'],
    ])('marks only the %s link as the current page', (path, linkName) => {
        currentPath.value = path;
        render(<SidebarNav initialSpaces={[]} initialLists={[]} />);

        const links = currentLinks('Main');
        expect(links).toHaveLength(1);
        expect(links[0].textContent).toBe(linkName);
    });
});
