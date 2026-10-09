import { headers } from 'next/headers';
import { Geist, Geist_Mono } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/providers/QueryProvider';
import { UIStateProvider } from '@/providers/UIStateProvider';
import { THEME_BACKGROUND_COLORS } from '@/lib/ui/theme-colors';
import NavigationProgressBar from '@/components/nav/NavigationProgressBar';
import ServiceWorkerRegister from '@/components/nav/ServiceWorkerRegister';
import './globals.css';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

export const metadata = {
    // Pages set only their own name; the template adds the app name so every tab title is distinct
    title: { default: 'Task Tracker', template: '%s - Task Tracker' },
    description: 'Nested task management',
    // 'default' keeps the iOS status bar solid, so no content ever sits under it.
    appleWebApp: { capable: true, title: 'Task Tracker', statusBarStyle: 'default' },
};

// cover makes env(safe-area-inset-*) non-zero on notched phones; without it the nav insets are always 0.
export const viewport = {
    viewportFit: 'cover',
    interactiveWidget: 'resizes-content',
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: THEME_BACKGROUND_COLORS.light },
        { media: '(prefers-color-scheme: dark)', color: THEME_BACKGROUND_COLORS.dark },
    ],
};

// Avoids a theme flash before hydration; kept in sync with ThemeToggle.jsx by hand (outside the module graph).
// Also overrides the OS-scheme theme-color tags, since the in-app theme can differ from the OS one.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var isDark = stored === 'light' ? false : stored === 'dark' ? true : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', isDark);
    var backgroundColor = ${JSON.stringify(THEME_BACKGROUND_COLORS)}[isDark ? 'dark' : 'light'];
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (themeColorTag) { themeColorTag.setAttribute('content', backgroundColor); });
  } catch {}
})();
`;

/**
 * True app root -- html/body scaffold, fonts, theme init, and providers shared by both the
 * (app) and (auth) route groups. Nav chrome lives in app/(app)/layout.js instead.
 */
export default async function RootLayout({ children }) {
    const nonce = (await headers()).get('x-nonce');

    return (
        <html
            lang="en"
            className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            suppressHydrationWarning
        >
            <head>
                <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
            </head>
            <body className="flex flex-col bg-background text-foreground">
                <NavigationProgressBar />
                <ServiceWorkerRegister />
                <QueryProvider>
                    <UIStateProvider>{children}</UIStateProvider>
                </QueryProvider>
                {/* Mobile offset matches the app layout's 5rem bottom padding, so toasts clear the nav and FAB. */}
                {/* Errors are often the only failure feedback, so toasts outlive the 4s default; hover pauses them */}
                <Toaster
                    richColors
                    duration={10000}
                    closeButton
                    position="bottom-right"
                    mobileOffset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
                />
                <SpeedInsights />
            </body>
        </html>
    );
}
