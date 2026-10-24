'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTimeSessionsQuery } from '@/hooks/useTimeSessionsQuery';
import {
    isSessionStale,
    isLiveSession,
    isStandaloneSession,
} from '@/modules/timer/domain/session-clock';
import TimerPanel from './TimerPanel';
import StartStandaloneTimerSheet from './StartStandaloneTimerSheet';
import StartTaskTimerSheet from './StartTaskTimerSheet';
import StartHabitTimerSheet from './StartHabitTimerSheet';
import StaleSessionPrompt from './StaleSessionPrompt';
import TimerViewTabs from './TimerViewTabs';
import TimerTemplateManager from './TimerTemplateManager';
import FullscreenTimerOverlay from './FullscreenTimerOverlay';

/**
 * The Time Tracking zone's landing page: sessions, the start buttons, stale prompts, templates, fullscreen.
 */
export default function TimerPageContent() {
    const [view, setView] = useState('sessions');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isStandaloneSheetOpen, setIsStandaloneSheetOpen] = useState(false);
    const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);
    const [isHabitSheetOpen, setIsHabitSheetOpen] = useState(false);
    const { data: sessions = [] } = useTimeSessionsQuery();
    const liveSessions = sessions.filter(isLiveSession);
    const hasLiveStandaloneSession = liveSessions.some(isStandaloneSession);
    const now = new Date();
    const staleSessions = liveSessions.filter((session) => isSessionStale(session, now));

    // Fullscreen gates on exactly 1 live session - auto-exits on its own the moment that changes.
    const fullscreenSession = isFullscreen && liveSessions.length === 1 ? liveSessions[0] : null;
    const panelSessions = fullscreenSession
        ? liveSessions.filter((session) => session.id !== fullscreenSession.id)
        : liveSessions;

    return (
        <div className="px-4 md:px-8 py-8 space-y-4">
            <h1 className="text-xl font-semibold">Timer</h1>

            <TimerViewTabs view={view} onChange={setView} />

            {view === 'templates' ? (
                <TimerTemplateManager />
            ) : (
                <>
                    <div className="space-y-4">
                        {panelSessions.map((session) => (
                            <TimerPanel
                                key={session.id}
                                session={session}
                                onEnterFullscreen={
                                    liveSessions.length === 1
                                        ? () => setIsFullscreen(true)
                                        : undefined
                                }
                            />
                        ))}
                    </div>

                    <div className="flex flex-col items-center gap-2">
                        <div className="flex flex-col w-full gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
                            <Button
                                className="w-full sm:w-auto"
                                disabled={hasLiveStandaloneSession}
                                onClick={() => setIsStandaloneSheetOpen(true)}
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Start Standalone Timer
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full sm:w-auto"
                                onClick={() => setIsTaskSheetOpen(true)}
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Start Task Timer
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full sm:w-auto"
                                onClick={() => setIsHabitSheetOpen(true)}
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Start Habit Timer
                            </Button>
                        </div>
                        {hasLiveStandaloneSession && (
                            <p className="text-xs text-muted-foreground">
                                You already have a running timer - stop it to start a new one.
                            </p>
                        )}
                    </div>

                    {staleSessions.map((session) => (
                        <StaleSessionPrompt key={session.id} session={session} />
                    ))}
                </>
            )}

            {fullscreenSession && (
                <FullscreenTimerOverlay
                    sessions={[fullscreenSession]}
                    onExit={() => setIsFullscreen(false)}
                />
            )}

            <StartStandaloneTimerSheet
                open={isStandaloneSheetOpen}
                onClose={() => setIsStandaloneSheetOpen(false)}
            />
            <StartTaskTimerSheet open={isTaskSheetOpen} onClose={() => setIsTaskSheetOpen(false)} />
            <StartHabitTimerSheet
                open={isHabitSheetOpen}
                onClose={() => setIsHabitSheetOpen(false)}
            />
        </div>
    );
}
