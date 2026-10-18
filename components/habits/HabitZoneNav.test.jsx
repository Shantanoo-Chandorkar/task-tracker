import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import HabitZoneNav from './HabitZoneNav';

const currentPath = vi.hoisted(() => ({ value: '/habits' }));

vi.mock('next/link', () => ({
    default: ({ children, href, ...rest }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));
vi.mock('next/navigation', () => ({
    usePathname: () => currentPath.value,
}));
vi.mock('@/hooks/useCurrentUserProfileQuery', () => ({
    useCurrentUserProfileQuery: () => ({ data: null }),
}));
vi.mock('@/components/ThemeToggle', () => ({ default: () => null }));
vi.mock('@/components/nav/LogoutButton', () => ({ default: () => null }));

afterEach(cleanup);

function currentLinks() {
    return screen
        .getByRole('navigation', { name: 'Main' })
        .querySelectorAll('a[aria-current="page"]');
}

describe('HabitZoneNav', () => {
    it('is a labelled navigation', () => {
        render(<HabitZoneNav />);

        expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    });

    it.each([
        ['/habits', 'Habits'],
        ['/habits/categories', 'Categories'],
        ['/habits/analytics', 'Analytics'],
    ])('marks only the %s link as the current page', (path, linkName) => {
        currentPath.value = path;
        render(<HabitZoneNav />);

        const links = currentLinks();
        expect(links).toHaveLength(1);
        expect(links[0].textContent).toBe(linkName);
    });
});
