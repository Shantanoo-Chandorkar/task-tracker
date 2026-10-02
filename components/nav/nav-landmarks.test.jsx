import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import BottomNav from './BottomNav';
import SidebarNav from './SidebarNav';

const currentPath = vi.hoisted(() => ({ value: '/' }));

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
}));
vi.mock('@/hooks/useSpacesQuery', () => ({ useSpacesQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useListsQuery', () => ({ useListsQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useCurrentUserProfileQuery', () => ({
    useCurrentUserProfileQuery: () => ({ data: null }),
}));
vi.mock('./QuickCreateFab', () => ({ default: () => null }));
vi.mock('@/components/ThemeToggle', () => ({ default: () => null }));
vi.mock('@/components/nav/LogoutButton', () => ({ default: () => null }));

afterEach(cleanup);

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
