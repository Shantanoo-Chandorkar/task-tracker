'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const listeners = new Set();

function getSnapshot() {
    const stored = localStorage.getItem('theme');
    if (stored === 'light') return false;
    if (stored === 'dark') return true;
    // No stored preference - use system preference, default to dark
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// SSR default, before the blocking init script (layout.js's <head>) sets the real class.
function getServerSnapshot() {
    return true;
}

function subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

function setTheme(isDark) {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    listeners.forEach((callback) => callback());
}

/**
 * Toggles the dark/light theme by adding or removing the `dark` class on
 * the document root element. Persists the preference to localStorage so it
 * survives page refreshes. Falls back to `prefers-color-scheme` if no
 * preference has been stored. Dark is the default when nothing is stored.
 */
export default function ThemeToggle() {
    const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    // useLayoutEffect (not useEffect) so this flips synchronously inside the flushSync call below.
    useLayoutEffect(() => {
        document.documentElement.classList.toggle('dark', isDark);
    }, [isDark]);

    function toggle(clickEvent) {
        const nextIsDark = !isDark;

        // Always start a transition - CSS gates the custom reveal by prefers-reduced-motion, not this check.
        if (!document.startViewTransition) {
            setTheme(nextIsDark);
            return;
        }

        const { clientX, clientY } = clickEvent;
        const root = document.documentElement;
        const radius = Math.hypot(
            Math.max(clientX, window.innerWidth - clientX),
            Math.max(clientY, window.innerHeight - clientY),
        );
        root.style.setProperty('--theme-toggle-x', `${clientX}px`);
        root.style.setProperty('--theme-toggle-y', `${clientY}px`);
        root.style.setProperty('--theme-toggle-radius', `${radius}px`);

        // .ready rejects if the transition is skipped (e.g. backgrounded tab); setTheme still ran, so this is harmless.
        const transition = document.startViewTransition(() => flushSync(() => setTheme(nextIsDark)));
        transition.ready.catch(() => {});
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
    );
}
