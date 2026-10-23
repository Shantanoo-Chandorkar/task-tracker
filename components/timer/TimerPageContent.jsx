'use client';

import { useState } from 'react';
import { useTimeSessionsQuery } from '@/hooks/useTimeSessionsQuery';
import { isSessionStale } from '@/modules/timer/domain/session-clock';
import TimerPanel from './TimerPanel';
import StandaloneSessionForm from './StandaloneSessionForm';
import StaleSessionPrompt from './StaleSessionPrompt';
import TimerViewTabs from './TimerViewTabs';
import TimerTemplateManager from './TimerTemplateManager';
import FullscreenTimerOverlay from './FullscreenTimerOverlay';

const isStandalone = (session) => session.habit_id === null && session.task_id === null;

/**
 * The Time Tracking zone's landing page: sessions, the start form, stale prompts, templates, fullscreen.
 */
export default function TimerPageContent() {
    const [view, setView] = useState('sessions');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const { data: sessions = [] } = useTimeSessionsQuery();
    const liveSessions = sessions.filter((session) => session.status !== 'completed');
    const hasLiveStandaloneSession = liveSessions.some(isStandalone);
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

                    {!hasLiveStandaloneSession && <StandaloneSessionForm />}

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
        </div>
    );
}
