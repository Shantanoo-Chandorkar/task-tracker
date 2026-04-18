import { Geist, Geist_Mono } from 'next/font/google';
import { QueryProvider } from '@/providers/QueryProvider';
import { ClipboardProvider } from '@/providers/ClipboardProvider';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
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

export default function RootLayout({ children }) {
    return (
        <html
            lang="en"
            className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
            <body className="min-h-full flex flex-col bg-background text-foreground">
                <QueryProvider>
                    <ClipboardProvider>
                        <header className="border-b border-border px-4 py-3 flex items-center justify-between">
                            <Link
                                href="/"
                                className="text-sm font-semibold text-foreground hover:text-muted-foreground transition-colors"
                            >
                                Task Tracker
                            </Link>
                            <nav className="flex items-center gap-3">
                                <Link
                                    href="/settings"
                                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Settings
                                </Link>
                                <ThemeToggle />
                            </nav>
                        </header>
                        <main className="flex-1">{children}</main>
                    </ClipboardProvider>
                </QueryProvider>
            </body>
        </html>
    );
}
