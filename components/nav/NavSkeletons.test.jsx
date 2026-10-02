import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SidebarSkeleton, TopBarSkeleton, BottomNavSkeleton } from './NavSkeletons';
import HomeSkeleton from '@/components/home/HomeSkeleton';
import SpaceListSkeleton from '@/components/space/SpaceListSkeleton';
import TaskDetailSkeleton from '@/components/task-detail/TaskDetailSkeleton';
import TaskListSkeleton from '@/components/task-list/TaskListSkeleton';

describe('loading skeletons', () => {
    it.each([
        ['SidebarSkeleton', SidebarSkeleton],
        ['TopBarSkeleton', TopBarSkeleton],
        ['BottomNavSkeleton', BottomNavSkeleton],
        ['HomeSkeleton', HomeSkeleton],
    ])('%s is decoration only, so assistive tech skips it', (_name, Skeleton) => {
        const { container } = render(<Skeleton />);

        expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
        expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });
});

describe('content skeletons', () => {
    it.each([
        ['HomeSkeleton', HomeSkeleton],
        ['SpaceListSkeleton', SpaceListSkeleton],
        ['TaskDetailSkeleton', TaskDetailSkeleton],
        ['TaskListSkeleton', TaskListSkeleton],
    ])('%s tells screen readers the page is loading, and hides the shimmer', (_name, Skeleton) => {
        const { container } = render(<Skeleton />);

        expect(screen.getByRole('status').textContent).toBe('Loading');
        expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
        cleanup();
    });
});
