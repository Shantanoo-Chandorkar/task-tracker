import AnalyticsPageContent from '@/components/habits/analytics/AnalyticsPageContent';

export const metadata = { title: 'Analytics' };

/**
 * The Habit Zone's analytics page - completion rate, streaks, consistency, patterns, tracked time.
 */
export default function HabitAnalyticsPage() {
    return (
        <div className="px-4 md:px-8 py-8 space-y-4">
            <h1 className="text-xl font-semibold">Analytics</h1>
            <AnalyticsPageContent />
        </div>
    );
}
