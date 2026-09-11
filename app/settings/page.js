import { createClient } from '@/lib/supabase/server';
import StatusManager from '@/components/status/StatusManager';
import InstallAppCard from '@/components/nav/InstallAppCard';
import SyncIssuesCard from '@/components/settings/SyncIssuesCard';

/**
 * Settings page — Server Component.
 * Fetches statuses server-side to pass as initialData to StatusManager,
 * so the settings page has zero client-side waterfall on first load.
 */
export default async function SettingsPage() {
    const supabase = await createClient();

    const { data: statuses } = await supabase
        .from('statuses')
        .select('*')
        .order('position', { ascending: true });

    return (
        <div className="px-4 md:px-8 py-8 space-y-8">
            <InstallAppCard />
            <SyncIssuesCard />
            <StatusManager initialStatuses={statuses || []} />
        </div>
    );
}
