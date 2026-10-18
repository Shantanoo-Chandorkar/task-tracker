'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/custom/Loader';
import { useTimeSessionActions } from '@/hooks/useTimeSessionActions';

/**
 * Inline label input + Start button for a new standalone session - the page's own primary
 * content, not a popup, since starting a session is the one thing this page is for.
 */
export default function StandaloneSessionForm() {
    const { start } = useTimeSessionActions();
    const [label, setLabel] = useState('');
    const [isPending, setIsPending] = useState(false);

    async function handleStart() {
        setIsPending(true);
        try {
            const didStart = await start({ label });
            if (didStart) setLabel('');
        } finally {
            setIsPending(false);
        }
    }

    return (
        <div className="flex items-center gap-2 rounded-lg border border-field p-4">
            <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="What are you working on?"
                disabled={isPending}
                aria-label="Session label"
                className="flex-1"
            />
            <Button type="button" onClick={handleStart} disabled={isPending} className="gap-1.5">
                {isPending && <Loader size="xs" />}
                Start
            </Button>
        </div>
    );
}
