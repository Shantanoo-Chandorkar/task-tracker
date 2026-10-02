/**
 * Placeholder for the Home screen, shaped like HomeView: heading, three quick actions, two task columns.
 */
export default function HomeSkeleton() {
    return (
        <>
            <div aria-hidden="true" className="max-w-5xl mx-auto px-4 md:px-8 py-6">
                <div className="mb-6 space-y-2">
                    <div className="h-6 w-20 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-48 rounded bg-muted animate-pulse" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-8">
                    {[0, 1, 2].map((action) => (
                        <div key={action} className="h-11 rounded-md bg-muted animate-pulse" />
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {[0, 1].map((column) => (
                        <div key={column} className="space-y-3 min-w-0">
                            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                            {[0, 1, 2].map((row) => (
                                <div key={row} className="h-12 rounded-md bg-muted animate-pulse" />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <p role="status" className="sr-only">
                Loading
            </p>
        </>
    );
}
