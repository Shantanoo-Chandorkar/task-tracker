/**
 * Layout for the public accept-invite route - centered card, no nav chrome, same shape as (auth).
 * Not grouped under (auth): it redirects signed-in visitors away, but this page needs them signed in.
 */
export default function InvitesLayout({ children }) {
    return (
        <div className="flex min-h-screen items-center justify-center px-4 py-8">
            <div className="w-full max-w-sm">{children}</div>
        </div>
    );
}
