import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useJoinSpaceDialog } from './useJoinSpaceDialog';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('useJoinSpaceDialog', () => {
    it('starts closed on a plain address', () => {
        const { result: hookResult } = renderHook(() => useJoinSpaceDialog());

        expect(hookResult.current.joinDialog).toEqual({ open: false, prefillSpaceId: '' });
    });

    it('starts open with the id when the address carries ?join=', () => {
        window.history.pushState(null, '', '/spaces?join=space-abc');

        const { result: hookResult } = renderHook(() => useJoinSpaceDialog());

        expect(hookResult.current.joinDialog).toEqual({ open: true, prefillSpaceId: 'space-abc' });
    });

    it('opens with no prefilled id from the button', () => {
        const { result: hookResult } = renderHook(() => useJoinSpaceDialog());

        act(() => hookResult.current.openJoinDialog());

        expect(hookResult.current.joinDialog).toEqual({ open: true, prefillSpaceId: '' });
    });

    it('closes and drops ?join= from the address so a reload does not reopen it', () => {
        window.history.pushState(null, '', '/spaces?join=space-abc');
        const { result: hookResult } = renderHook(() => useJoinSpaceDialog());

        act(() => hookResult.current.closeJoinDialog());

        expect(hookResult.current.joinDialog.open).toBe(false);
        expect(window.location.pathname + window.location.search).toBe('/spaces');
    });

    it('leaves the address alone when it had no ?join=', () => {
        window.history.pushState(null, '', '/spaces?tab=lists');
        const { result: hookResult } = renderHook(() => useJoinSpaceDialog());

        act(() => hookResult.current.closeJoinDialog());

        expect(window.location.search).toBe('?tab=lists');
    });
});
