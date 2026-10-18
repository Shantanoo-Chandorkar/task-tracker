'use client';

import { useState } from 'react';
import { useTimeSessionsQuery } from '@/hooks/useTimeSessionsQuery';
import { isSessionStale } from '@/modules/timer/domain/session-clock';
import TimerPanel from './TimerPanel';
import StandaloneSessionForm from './StandaloneSessionForm';
import StaleSessionPrompt from './StaleSessionPrompt';
import TimerViewTabs from './TimerViewTabs';
import TimerTemplateManager from './TimerTemplateManager';

const isStandalone = (session) => session.habit_id === null && session.task_id === null;

/**
 * The Time Tracking zone's landing page content: live sessions, the start form, any stale
 * prompt, and the template manager behind its own tab.
 */
export default function TimerPageContent() {
    const [view, setView] = useState('sessions');
    const { data: sessions = [] } = useTimeSessionsQuery();
    const liveSessions = sessions.filter((session) => session.status !== 'completed');
    const hasLiveStandaloneSession = liveSessions.some(isStandalone);
    const now = new Date();
    const staleSessions = liveSessions.filter((session) => isSessionStale(session, now));

    return (
        <div className="px-4 md:px-8 py-8 space-y-4">
            <h1 className="text-xl font-semibold">Timer</h1>

            <TimerViewTabs view={view} onChange={setView} />

            {view === 'templates' ? (
                <TimerTemplateManager />
            ) : (
                <>
                    <div className="space-y-3">
                        {liveSessions.map((session) => (
                            <TimerPanel key={session.id} session={session} />
                        ))}
                    </div>

                    {!hasLiveStandaloneSession && <StandaloneSessionForm />}

                    {staleSessions.map((session) => (
                        <StaleSessionPrompt key={session.id} session={session} />
                    ))}
                </>
            )}
        </div>
    );
}
