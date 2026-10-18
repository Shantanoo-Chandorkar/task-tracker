import HabitListView from '@/components/habits/HabitListView';

export const metadata = { title: 'Habits' };

/**
 * The Habit Zone's landing page - habits switchable between Today/All/By Category.
 */
export default function HabitsTodayPage() {
    return (
        <div className="px-4 md:px-8 py-8 space-y-4">
            <h1 className="text-xl font-semibold">Habits</h1>
            <HabitListView />
        </div>
    );
}
