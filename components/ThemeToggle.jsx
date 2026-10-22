'use client';

import { useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { THEME_BACKGROUND_COLORS } from '@/lib/ui/theme-colors';
import { setStoredTheme, useIsDarkTheme } from '@/hooks/useIsDarkTheme';

/**
 * Toggles the dark/light theme by adding or removing the `dark` class on
 * the document root element. Persists the preference to localStorage so it
 * survives page refreshes. Falls back to `prefers-color-scheme` if no
 * preference has been stored. Dark is the default when nothing is stored.
 */
export default function ThemeToggle() {
    const isDark = useIsDarkTheme();

    // useLayoutEffect (not useEffect) so this flips synchronously inside the flushSync call below.
    useLayoutEffect(() => {
        document.documentElement.classList.toggle('dark', isDark);
        // Overrides the OS-scheme theme-color tags so the status bar follows the in-app theme.
        const backgroundColor = THEME_BACKGROUND_COLORS[isDark ? 'dark' : 'light'];
        document
            .querySelectorAll('meta[name="theme-color"]')
            .forEach((themeColorTag) => themeColorTag.setAttribute('content', backgroundColor));
    }, [isDark]);

    function toggle(clickEvent) {
        const nextIsDark = !isDark;

        // Always start a transition - CSS gates the custom reveal by prefers-reduced-motion, not this check.
        if (!document.startViewTransition) {
            setStoredTheme(nextIsDark);
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

        // .ready rejects if the transition is skipped (e.g. backgrounded tab); setStoredTheme still ran, so this is harmless.
        const transition = document.startViewTransition(() =>
            flushSync(() => setStoredTheme(nextIsDark)),
        );
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
