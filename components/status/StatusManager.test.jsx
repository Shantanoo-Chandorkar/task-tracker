import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StatusManager from './StatusManager';

const statuses = [
    { id: 's1', name: 'To do', color: '#111111', position: 0, is_default: true, code: 'todo' },
    { id: 's2', name: 'Doing', color: '#222222', position: 1, is_default: false, code: null },
];

vi.mock('@/hooks/useStatusesQuery', () => ({
    useStatusesQuery: () => ({ data: statuses, isLoading: false }),
}));
vi.mock('@/actions/status-actions', () => ({ updateStatus: vi.fn(), deleteStatus: vi.fn() }));
vi.mock('./StatusFormDialog', () => ({ default: () => null }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));

afterEach(cleanup);

function renderManager() {
    return render(
        <QueryClientProvider client={new QueryClient()}>
            <StatusManager spaceId="space-1" />
        </QueryClientProvider>,
    );
}

describe('StatusManager drag handles', () => {
    it('puts the sortable semantics on each drag handle', () => {
        renderManager();

        const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
        expect(handles).toHaveLength(2);
        for (const handle of handles) {
            expect(handle.getAttribute('aria-roledescription')).toBe('sortable');
        }
    });

    it('keeps the row itself out of the tab order, since it only holds other controls', () => {
        const { container } = renderManager();

        const sortableElements = container.querySelectorAll('[aria-roledescription="sortable"]');
        expect(sortableElements).toHaveLength(2);
        for (const element of sortableElements) {
            expect(element.tagName).toBe('BUTTON');
        }
    });
});
