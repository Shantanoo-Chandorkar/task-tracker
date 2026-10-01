import { THEME_BACKGROUND_COLORS } from '@/lib/theme-colors';

/**
 * Next.js native manifest route - generates and auto-links /manifest.webmanifest.
 * Colors use the dark background, the app's default theme; a manifest can't vary by scheme.
 *
 * @returns {object} Web app manifest served at /manifest.webmanifest.
 */
export default function manifest() {
    return {
        name: 'Task Tracker',
        short_name: 'Task Tracker',
        description: 'Nested task management for spaces and lists.',
        start_url: '/',
        display: 'standalone',
        background_color: THEME_BACKGROUND_COLORS.dark,
        theme_color: THEME_BACKGROUND_COLORS.dark,
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
                src: '/icons/icon-maskable-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
    };
}
