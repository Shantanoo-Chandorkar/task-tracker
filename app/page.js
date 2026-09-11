import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SpaceListManager from '@/components/space/SpaceListManager';

/**
 * Root page — Server Component.
 * Redirects to the first available list (ordered by space, then list,
 * position). With no lists yet, shows the Space/List manager inline so a
 * first-time user can create one without a separate onboarding flow.
 */
export default async function Page() {
    const supabase = await createClient();

    const [{ data: spaces }, { data: lists }] = await Promise.all([
        supabase.from('spaces').select('*').order('position', { ascending: true }),
        supabase.from('lists').select('*').order('position', { ascending: true }),
    ]);

    const firstSpaceWithList = (spaces || []).find((space) =>
        (lists || []).some((list) => list.space_id === space.id),
    );

    if (firstSpaceWithList) {
        const firstList = (lists || []).find((list) => list.space_id === firstSpaceWithList.id);
        redirect(`/lists/${firstList.id}`);
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
