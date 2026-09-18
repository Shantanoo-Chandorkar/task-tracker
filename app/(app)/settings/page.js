import InstallAppCard from '@/components/nav/InstallAppCard';

/**
 * Settings page - Server Component. Per-space settings (statuses, sharing) live on /spaces
 * instead, next to the space they belong to.
 */
export default function SettingsPage() {
    return (
        <div className="px-4 md:px-8 py-8 space-y-8">
            <InstallAppCard />
        </div>
    );
}
