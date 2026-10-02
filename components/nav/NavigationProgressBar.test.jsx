import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import NavigationProgressBar from './NavigationProgressBar';

vi.mock('@/hooks/useNavigationProgress', () => ({ useNavigationProgress: () => true }));

describe('NavigationProgressBar', () => {
    it('is decoration only, so screen readers are not told about every tick of the sweep', () => {
        const { container } = render(<NavigationProgressBar />);

        expect(container.querySelector('[role="progressbar"]')).toBeNull();
        expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
    });
});
