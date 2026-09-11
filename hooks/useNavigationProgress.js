'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const STALLED_NAVIGATION_TIMEOUT_MS = 8000;

/**
 * Tracks whether an internal Link navigation is in flight, for the top-of-page progress bar.
 * No built-in App Router event for this, so it listens for internal link clicks instead.
 *
 * @returns {boolean} True while a navigation is in flight
 */
export function useNavigationProgress() {
    const pathname = usePathname();
    const [isLoading, setIsLoading] = useState(false);
    const [lastPathname, setLastPathname] = useState(pathname);
    const timeoutRef = useRef(null);

    if (pathname !== lastPathname) {
        setLastPathname(pathname);
        setIsLoading(false);
    }

    useEffect(() => {
        function handleClick(event) {
            if (event.defaultPrevented) return;
            if (event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const link = event.target.closest('a[href]');
            if (!link) return;
            if (link.target && link.target !== '_self') return;
            if (link.hasAttribute('download')) return;
            if (link.origin !== window.location.origin) return;

            const isSamePage =
                link.pathname === window.location.pathname &&
                link.search === window.location.search;
            if (isSamePage) return;

            setIsLoading(true);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(
                () => setIsLoading(false),
                STALLED_NAVIGATION_TIMEOUT_MS,
            );
        }

        document.addEventListener('click', handleClick);
        return () => {
            document.removeEventListener('click', handleClick);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    return isLoading;
}
