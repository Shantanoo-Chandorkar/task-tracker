'use client';

import { useState } from 'react';

const CLOSED = { open: false, prefillSpaceId: '' };

/**
 * Open state of the join-a-space dialog, which also opens by itself when the page address carries `?join=<spaceId>`.
 *
 * @returns {{
 *   joinDialog: { open: boolean, prefillSpaceId: string },
 *   openJoinDialog: () => void,
 *   closeJoinDialog: () => void,
 * }} `closeJoinDialog` also drops `?join=` from the address, so a reload does not reopen it.
 */
export function useJoinSpaceDialog() {
    // Lazy initializer only: reads the URL once, before the dialog could otherwise open, not in an effect.
    const [joinDialog, setJoinDialog] = useState(() => {
        if (typeof window === 'undefined') return CLOSED;
        const joinId = new URLSearchParams(window.location.search).get('join');
        return joinId ? { open: true, prefillSpaceId: joinId } : CLOSED;
    });

    function openJoinDialog() {
        setJoinDialog({ open: true, prefillSpaceId: '' });
    }

    function closeJoinDialog() {
        setJoinDialog(CLOSED);
        if (window.location.search.includes('join=')) {
            window.history.replaceState(null, '', '/spaces');
        }
    }

    return { joinDialog, openJoinDialog, closeJoinDialog };
}
