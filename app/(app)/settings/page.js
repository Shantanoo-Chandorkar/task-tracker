import InstallAppCard from '@/components/nav/InstallAppCard';

export const metadata = { title: 'Settings' };

/**
 * Settings page - Server Component. Per-space settings (statuses, sharing) live on /spaces
 * instead, next to the space they belong to.
 */
export default function SettingsPage() {
    return (
        <div className="px-4 md:px-8 py-8 space-y-8">
            <h1 className="text-xl font-semibold">Settings</h1>
            <InstallAppCard />
        </div>
    );
}
