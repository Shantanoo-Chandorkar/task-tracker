'use client';

import { useTimeSessionsQuery } from '@/hooks/useTimeSessionsQuery';
import { isSessionStale } from '@/modules/timer/domain/session-clock';
import TimerPanel from './TimerPanel';
import StandaloneSessionForm from './StandaloneSessionForm';
import StaleSessionPrompt from './StaleSessionPrompt';

const isStandalone = (session) => session.habit_id === null && session.task_id === null;

/**
 * The Time Tracking zone's landing page content: live sessions, the start form, and any stale prompt.
 */
export default function TimerPageContent() {
    const { data: sessions = [] } = useTimeSessionsQuery();
    const liveSessions = sessions.filter((session) => session.status !== 'completed');
    const hasLiveStandaloneSession = liveSessions.some(isStandalone);
    const now = new Date();
    const staleSessions = liveSessions.filter((session) => isSessionStale(session, now));

    return (
        <div className="px-4 md:px-8 py-8 space-y-4">
            <h1 className="text-xl font-semibold">Timer</h1>

            <div className="space-y-3">
                {liveSessions.map((session) => (
                    <TimerPanel key={session.id} session={session} />
                ))}
            </div>

            {!hasLiveStandaloneSession && <StandaloneSessionForm />}

            {staleSessions.map((session) => (
                <StaleSessionPrompt key={session.id} session={session} />
            ))}
        </div>
    );
}
