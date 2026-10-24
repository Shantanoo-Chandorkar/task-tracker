'use client';

import { useState } from 'react';
import { Plus, Clock, ListChecks, Repeat } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTimeSessionsQuery } from '@/hooks/useTimeSessionsQuery';
import { isLiveSession, isStandaloneSession } from '@/modules/timer/domain/session-clock';
import StartStandaloneTimerSheet from './StartStandaloneTimerSheet';
import StartTaskTimerSheet from './StartTaskTimerSheet';
import StartHabitTimerSheet from './StartHabitTimerSheet';

/**
 * Time Tracking zone's floating action button - speed-dial to start a standalone, task or habit timer.
 *
 * @param {object} props
 * @param {string} props.className - Positioning + sizing classes for the button itself
 */
export default function TimeTrackingQuickCreateFab({ className }) {
    const { data: sessions = [] } = useTimeSessionsQuery();
    const hasLiveStandaloneSession = sessions.filter(isLiveSession).some(isStandaloneSession);
    const [isStandaloneSheetOpen, setIsStandaloneSheetOpen] = useState(false);
    const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);
    const [isHabitSheetOpen, setIsHabitSheetOpen] = useState(false);

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button aria-label="Start a timer..." className={className}>
                        <Plus className="h-6 w-6" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                    <DropdownMenuItem
                        onClick={() => {
                            if (!hasLiveStandaloneSession) setIsStandaloneSheetOpen(true);
                        }}
                        disabled={hasLiveStandaloneSession}
                        className="gap-2"
                    >
                        <Clock className="h-3.5 w-3.5" />
                        Start Standalone Timer
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsTaskSheetOpen(true)} className="gap-2">
                        <ListChecks className="h-3.5 w-3.5" />
                        Start Task Timer
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsHabitSheetOpen(true)} className="gap-2">
                        <Repeat className="h-3.5 w-3.5" />
                        Start Habit Timer
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <StartStandaloneTimerSheet
                open={isStandaloneSheetOpen}
                onClose={() => setIsStandaloneSheetOpen(false)}
            />
            <StartTaskTimerSheet open={isTaskSheetOpen} onClose={() => setIsTaskSheetOpen(false)} />
            <StartHabitTimerSheet
                open={isHabitSheetOpen}
                onClose={() => setIsHabitSheetOpen(false)}
            />
        </>
    );
}
