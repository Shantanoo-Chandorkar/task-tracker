'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader } from '@/components/custom/Loader';
import { useTimeSessionActions } from '@/hooks/useTimeSessionActions';
import { useTimerTemplatesQuery } from '@/hooks/useTimerTemplatesQuery';

const NO_TEMPLATE_VALUE = 'none';

/**
 * Inline label input + optional template picker + Start button for a new standalone session -
 * the page's own primary content, not a popup, since starting a session is the one thing this
 * page is for.
 */
export default function StandaloneSessionForm() {
    const { start } = useTimeSessionActions();
    const { data: templates = [] } = useTimerTemplatesQuery();
    const [label, setLabel] = useState('');
    const [templateId, setTemplateId] = useState(NO_TEMPLATE_VALUE);
    const [isPending, setIsPending] = useState(false);

    async function handleStart() {
        setIsPending(true);
        try {
            const didStart = await start({
                label,
                templateId: templateId === NO_TEMPLATE_VALUE ? undefined : templateId,
            });
            if (didStart) {
                setLabel('');
                setTemplateId(NO_TEMPLATE_VALUE);
            }
        } finally {
            setIsPending(false);
        }
    }

    return (
        <div className="flex flex-col gap-3 rounded-lg border border-field p-5 md:flex-row md:flex-wrap md:items-center">
            <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="What are you working on?"
                disabled={isPending}
                aria-label="Session label"
                className="h-14 min-w-0 flex-1 basis-40 px-[18px] md:text-[1.0625rem]"
            />
            {templates.length > 0 && (
                <Select value={templateId} onValueChange={setTemplateId} disabled={isPending}>
                    <SelectTrigger aria-label="Template" className="w-full flex-shrink-0 md:w-40">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NO_TEMPLATE_VALUE}>No template</SelectItem>
                        {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                                {template.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
            <Button
                type="button"
                onClick={handleStart}
                disabled={isPending}
                className="h-14 w-full gap-1.5 px-7 text-base md:w-auto"
            >
                {isPending && <Loader size="xs" />}
                Start
            </Button>
        </div>
    );
}
