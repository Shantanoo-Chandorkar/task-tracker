import { createClient } from '@/lib/supabase/server';
import StatusManager from '@/components/status/StatusManager';
import InstallAppCard from '@/components/nav/InstallAppCard';

/**
 * Settings page — Server Component. Fetches every space (for the picker) and defaults to the
 * first one's statuses, both server-side, so there's zero client-side waterfall on first load.
 */
export default async function SettingsPage() {
    const supabase = await createClient();

    const { data: spaces } = await supabase.from('spaces').select('*').order('position', { ascending: true });

    const initialSpaceId = spaces?.[0]?.id ?? null;

    const { data: statuses } = initialSpaceId
        ? await supabase
              .from('statuses')
              .select('*')
              .eq('space_id', initialSpaceId)
              .order('position', { ascending: true })
        : { data: [] };

    return (
        <div className="px-4 md:px-8 py-8 space-y-8">
            <InstallAppCard />
            <StatusManager
                spaces={spaces || []}
                initialSpaceId={initialSpaceId}
                initialStatuses={statuses || []}
            />
        </div>
    );
}
