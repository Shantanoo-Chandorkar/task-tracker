import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DesktopQuickCreateFab from './DesktopQuickCreateFab';

const currentPath = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
    usePathname: () => currentPath.value,
}));
vi.mock('./QuickCreateFab', () => ({ default: () => <div>Default FAB</div> }));
vi.mock('@/components/habits/HabitQuickCreateFab', () => ({
    default: () => <div>Habit FAB</div>,
}));
vi.mock('@/components/timer/TimeTrackingQuickCreateFab', () => ({
    default: () => <div>Timer FAB</div>,
}));

describe('DesktopQuickCreateFab', () => {
    it('renders the habit FAB on a Habit Zone route', () => {
        currentPath.value = '/habits';
        render(<DesktopQuickCreateFab className="" />);
        expect(screen.getByText('Habit FAB')).toBeTruthy();
    });

    it('renders the timer FAB on a Time Tracking route', () => {
        currentPath.value = '/timer';
        render(<DesktopQuickCreateFab className="" />);
        expect(screen.getByText('Timer FAB')).toBeTruthy();
    });

    it('renders the default FAB on any other route', () => {
        currentPath.value = '/spaces';
        render(<DesktopQuickCreateFab className="" />);
        expect(screen.getByText('Default FAB')).toBeTruthy();
    });
});
