import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/validation';
import HabitAnalyticsDetail from '@/components/habits/analytics/HabitAnalyticsDetail';

export const metadata = { title: 'Habit analytics' };

/**
 * One habit's own analytics - completion rate, streaks, consistency, tracked time.
 * No server-side query: the Habit Zone's data layer is entirely client-hook-driven.
 *
 * @param {object} props
 * @param {Promise<{ habitId: string }>} props.params - Route params.
 * @returns {Promise<JSX.Element>} The page markup.
 */
export default async function HabitAnalyticsDetailPage({ params }) {
    const { habitId } = await params;
    // A malformed id can never match a real habit id, but fail fast and consistently anyway.
    if (!isUuid(habitId)) notFound();

    return (
        <div className="px-4 md:px-8 py-8 space-y-4">
            <HabitAnalyticsDetail habitId={habitId} />
        </div>
    );
}
