import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SidebarSkeleton, TopBarSkeleton, BottomNavSkeleton } from './NavSkeletons';
import HomeSkeleton from '@/components/home/HomeSkeleton';

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
