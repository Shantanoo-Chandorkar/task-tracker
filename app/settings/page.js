import { createClient } from '@/lib/supabase/server';
import StatusManager from '@/components/status/StatusManager';

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
        <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-xl font-semibold">Settings</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Configure your task tracker workspace.
                </p>
            </div>

            <StatusManager initialStatuses={statuses || []} />
        </div>
    );
}
