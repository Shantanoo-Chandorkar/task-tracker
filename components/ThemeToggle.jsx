'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const listeners = new Set();

function getSnapshot() {
    const stored = localStorage.getItem('theme');
    if (stored === 'light') return false;
    if (stored === 'dark') return true;
    // No stored preference — use system preference, default to dark
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Matches the `dark` class hardcoded on <html> in app/layout.js.
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

    // Keep the DOM class in sync with the resolved theme — a legitimate
    // external-system sync, not a state reset.
    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDark);
    }, [isDark]);

    function toggle() {
        setTheme(!isDark);
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
