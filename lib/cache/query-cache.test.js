import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { removeRowFromCache, withSavedRow, withStatusDisplay } from './query-cache';

describe('removeRowFromCache', () => {
    it('removes the row from every cached list under the key prefix and leaves others alone', () => {
        const queryClient = new QueryClient();
        queryClient.setQueryData(
            ['space-collaborators', 's1', 'accepted'],
            [{ id: 'a' }, { id: 'b' }],
        );
        queryClient.setQueryData(['space-collaborators', 's1', 'pending'], [{ id: 'b' }]);
        queryClient.setQueryData(['lists'], [{ id: 'b' }]);

        removeRowFromCache(queryClient, ['space-collaborators', 's1'], 'b');

        expect(queryClient.getQueryData(['space-collaborators', 's1', 'accepted'])).toEqual([
            { id: 'a' },
        ]);
        expect(queryClient.getQueryData(['space-collaborators', 's1', 'pending'])).toEqual([]);
        expect(queryClient.getQueryData(['lists'])).toEqual([{ id: 'b' }]);
    });

    it('ignores a cache entry that is not a row list', () => {
        const queryClient = new QueryClient();
        queryClient.setQueryData(['profile'], { id: 'b' });

        removeRowFromCache(queryClient, ['profile'], 'b');

        expect(queryClient.getQueryData(['profile'])).toEqual({ id: 'b' });
    });
});

describe('withSavedRow', () => {
    const cachedRows = [{ id: 'a', name: 'Old', extra: 1 }];

    it('merges the saved row over the cached one on edit', () => {
        expect(withSavedRow(cachedRows, { id: 'a', name: 'New' }, true)).toEqual([
            { id: 'a', name: 'New', extra: 1 },
        ]);
    });

    it('appends on create only when defaults are given, and never twice', () => {
        const created = { id: 'b', name: 'Fresh' };

        expect(withSavedRow(cachedRows, created, false)).toBe(cachedRows);
        const appended = withSavedRow(cachedRows, created, false, { tags: [] });
        expect(appended).toEqual([...cachedRows, { id: 'b', name: 'Fresh', tags: [] }]);
        expect(withSavedRow(appended, created, false, { tags: [] })).toBe(appended);
    });

    it('leaves a cache that never loaded alone', () => {
        expect(withSavedRow(undefined, { id: 'a' }, true)).toBeUndefined();
    });
});

describe('withStatusDisplay', () => {
    const statuses = [{ id: 's1', name: 'Done', color: '#0f0' }];

    it('fills the status name and color from the task status', () => {
        expect(withStatusDisplay({ id: 't', status_id: 's1' }, statuses)).toEqual({
            id: 't',
            status_id: 's1',
            status_name: 'Done',
            status_color: '#0f0',
        });
    });

    it('uses nulls when the task has no known status', () => {
        const withoutStatus = withStatusDisplay({ id: 't', status_id: null }, statuses);

        expect(withoutStatus.status_name).toBeNull();
        expect(withoutStatus.status_color).toBeNull();
    });
});
