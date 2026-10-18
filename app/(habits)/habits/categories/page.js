import HabitCategoryManager from '@/components/habits/HabitCategoryManager';

export const metadata = { title: 'Categories' };

/**
 * Habit category management - mounts the component Bucket B2 built but left unmounted.
 */
export default function HabitCategoriesPage() {
    return (
        <div className="px-4 md:px-8 py-8">
            <HabitCategoryManager />
        </div>
    );
}
