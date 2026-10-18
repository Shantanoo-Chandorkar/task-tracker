'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import HabitFormDialog from './HabitFormDialog';

/**
 * The Habit Zone's floating action button - opens the create-habit dialog.
 * A single action, not a speed-dial - category creation already has its own entry point on its own page.
 *
 * @param {object} props
 * @param {string} props.className - Positioning + sizing classes for the button itself
 */
export default function HabitQuickCreateFab({ className }) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    return (
        <>
            <button
                aria-label="New habit"
                onClick={() => setIsDialogOpen(true)}
                className={className}
            >
                <Plus className="h-6 w-6" />
            </button>
            <HabitFormDialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
        </>
    );
}
