import { createClient } from '@/lib/supabase/server';
import SpaceListManager from '@/components/space/SpaceListManager';
import HomeView from '@/components/home/HomeView';
import { loadHomeSummary } from '@/lib/home/build-home-summary';

/**
 * Home page - Server Component.
 * Shows the Home dashboard once the user has a list. With no lists yet, shows the Space/List manager
 * inline so a first-time user can create one without a separate onboarding flow.
 */
export default async function Page() {
    const supabase = await createClient();

    const [{ data: spaces }, { data: lists }, homeLoadResult] = await Promise.all([
        supabase.from('spaces').select('*').order('position', { ascending: true }),
        supabase.from('lists').select('*').order('position', { ascending: true }),
        loadHomeSummary(supabase),
    ]);

    if ((lists || []).length > 0) {
        // A failed load leaves initialHome undefined, so the client fetches it and can show a retry
        return <HomeView initialHome={homeLoadResult.data ?? undefined} firstList={{ id: lists[0].id, name: lists[0].name }} />;
    }

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-xl font-semibold">Welcome to Task Tracker</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Create a space and a list to get started.
                </p>
            </div>

            <SpaceListManager initialSpaces={spaces || []} initialLists={lists || []} />
        </div>
    );
}
