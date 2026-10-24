import { createClient } from '@/lib/supabase/server';
import { loadRequestUser } from '@/lib/app-shell-data';
import { getCurrentUserProfile } from '@/lib/profile';
import InstallAppCard from '@/components/nav/InstallAppCard';
import PasskeySettingsSection from '@/components/settings/PasskeySettingsSection';

export const metadata = { title: 'Settings' };

/**
 * Settings page - Server Component. Per-space settings (statuses, sharing) live on /spaces instead.
 * SSR-fetches the profile so PasskeySettingsSection never flashes its controls to a guest.
 */
export default async function SettingsPage() {
    const user = await loadRequestUser();
    const initialProfile = user ? await getCurrentUserProfile(await createClient(), user) : null;

    return (
        <div className="px-4 md:px-8 py-8 space-y-8">
            <h1 className="text-xl font-semibold">Settings</h1>
            <InstallAppCard />
            <PasskeySettingsSection initialProfile={initialProfile} />
        </div>
    );
}
