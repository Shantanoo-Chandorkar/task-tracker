'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Toggles the dark/light theme by adding or removing the `dark` class on
 * the document root element. Persists the preference to localStorage so it
 * survives page refreshes. Falls back to `prefers-color-scheme` if no
 * preference has been stored. Dark is the default when nothing is stored.
 */
export default function ThemeToggle() {
    const [isDark, setIsDark] = useState(true);

    // Read the stored preference (or system preference) on mount
    useEffect(() => {
        const stored = localStorage.getItem('theme');
        if (stored === 'light') {
            setIsDark(false);
            document.documentElement.classList.remove('dark');
        } else if (stored === 'dark') {
            setIsDark(true);
            document.documentElement.classList.add('dark');
        } else {
            // No stored preference — use system preference, default to dark
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setIsDark(prefersDark);
            document.documentElement.classList.toggle('dark', prefersDark);
        }
    }, []);

    function toggle() {
        const newIsDark = !isDark;
        setIsDark(newIsDark);
        document.documentElement.classList.toggle('dark', newIsDark);
        localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
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
