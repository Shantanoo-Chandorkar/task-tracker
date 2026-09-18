/**
 * Layout for unauthenticated routes (login, signup) - centered card, no nav chrome.
 * Route protection (redirecting an already-authenticated visitor away) happens in proxy.js.
 */
export default function AuthLayout({ children }) {
    return (
        <div className="flex min-h-screen items-center justify-center px-4 py-8">
            <div className="w-full max-w-sm">{children}</div>
        </div>
    );
}
