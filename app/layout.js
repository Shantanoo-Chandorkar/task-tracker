import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/providers/QueryProvider';
import { ClipboardProvider } from '@/providers/ClipboardProvider';
import DesktopSidebar from '@/components/nav/DesktopSidebar';
import MobileTopBar from '@/components/nav/MobileTopBar';
import BottomNav from '@/components/nav/BottomNav';
import QuickCreateFab from '@/components/nav/QuickCreateFab';
import GlobalSearch from '@/components/nav/GlobalSearch';
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

export default function RootLayout({ children }) {
    return (
        <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} antialiased`}>
            <body className="flex flex-col bg-background text-foreground">
                <NavigationProgressBar />
                <ServiceWorkerRegister />
                <GlobalSearch />
                <QueryProvider>
                    <ClipboardProvider>
                        <div className="flex">
                            <DesktopSidebar />
                            {/* <body> is the real scrolling element (native pull-to-refresh needs
                                the document itself to scroll) — the sidebar and mobile top bar
                                stay pinned via sticky/fixed instead of trapping scroll in here. */}
                            <div className="flex flex-1 flex-col min-w-0">
                                <MobileTopBar />
                                <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
                                    {children}
                                </main>
                                <BottomNav />
                            </div>
                            {/* bottom-20 (not bottom-6) clears the TanStack Query devtools
                                toggle button, which also docks bottom-right in dev mode. */}
                            <QuickCreateFab className="hidden lg:flex fixed bottom-20 right-6 z-30 h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg" />
                        </div>
                    </ClipboardProvider>
                </QueryProvider>
                <Toaster richColors position="bottom-right" />
            </body>
        </html>
    );
}
