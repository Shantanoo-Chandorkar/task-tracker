import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/providers/QueryProvider';
import { UIStateProvider } from '@/providers/UIStateProvider';
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
    title: 'Task Tracker',
    description: 'Nested task management',
};

export const viewport = {
    themeColor: '#171717',
};

// Runs before first paint so the `dark` class is correct immediately, instead of always
// painting dark first and flipping after hydration. Mirrors ThemeToggle.jsx's `getSnapshot()` —
// kept in sync manually, since this runs outside the module graph before any bundled code does.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var isDark = stored === 'light' ? false : stored === 'dark' ? true : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', isDark);
  } catch {}
})();
`;

/**
 * True app root -- html/body scaffold, fonts, theme init, and providers shared by both the
 * (app) and (auth) route groups. Nav chrome lives in app/(app)/layout.js instead.
 */
export default function RootLayout({ children }) {
    return (
        <html
            lang="en"
            className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            suppressHydrationWarning
        >
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
            </head>
            <body className="flex flex-col bg-background text-foreground">
                <NavigationProgressBar />
                <ServiceWorkerRegister />
                <QueryProvider>
                    <UIStateProvider>{children}</UIStateProvider>
                </QueryProvider>
                <Toaster richColors position="bottom-right" />
            </body>
        </html>
    );
}
