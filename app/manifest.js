/**
 * Next.js native manifest route - generates and auto-links /manifest.webmanifest.
 * Colors match the locked Minimalist Charcoal palette (see plan history).
 */
export default function manifest() {
    return {
        name: 'Task Tracker',
        short_name: 'Task Tracker',
        description: 'Nested task management for spaces and lists.',
        start_url: '/',
        display: 'standalone',
        background_color: '#171717',
        theme_color: '#171717',
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
