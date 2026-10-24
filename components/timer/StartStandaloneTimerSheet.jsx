'use client';

import { useId, useState } from 'react';
import ModalShell from '@/components/custom/ModalShell';
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
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useTimeSessionActions } from '@/hooks/useTimeSessionActions';
import { useTimerTemplatesQuery } from '@/hooks/useTimerTemplatesQuery';

const NO_TEMPLATE_VALUE = 'none';

/**
 * Bottom sheet for starting a standalone (unattached) timer - a label plus an optional template,
 * the one sheet in this zone that's a real form rather than a picker list.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the sheet is open.
 * @param {() => void} props.onClose - Called when the sheet should close.
 */
export default function StartStandaloneTimerSheet({ open, onClose }) {
    const formId = useId();
    const isDesktop = useIsDesktop();
    const { start } = useTimeSessionActions();
    const { data: templates = [] } = useTimerTemplatesQuery();
    const [label, setLabel] = useState('');
    const [templateId, setTemplateId] = useState(NO_TEMPLATE_VALUE);
    const [isPending, setIsPending] = useState(false);

    // Clears the form on the next open, same reset-on-reopen shape every dialog in this app uses.
    const [lastOpen, setLastOpen] = useState(open);
    if (open !== lastOpen) {
        setLastOpen(open);
        if (open) {
            setLabel('');
            setTemplateId(NO_TEMPLATE_VALUE);
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (isPending) return;
        setIsPending(true);
        const didStart = await start({
            label,
            templateId: templateId === NO_TEMPLATE_VALUE ? undefined : templateId,
        });
        setIsPending(false);
        if (didStart) onClose();
    }

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={isPending}
            variant="sheet"
            side={isDesktop ? 'right' : 'bottom'}
            title="Start a standalone timer"
            contentClassName={isDesktop ? 'sm:max-w-md' : undefined}
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button type="submit" form={formId} disabled={isPending} className="gap-1.5">
                        {isPending && <Loader size="xs" />}
                        {isPending ? 'Starting...' : 'Start'}
                    </Button>
                </>
            }
        >
            <form id={formId} onSubmit={handleSubmit} inert={isPending} className="space-y-4">
                <Input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="What are you working on?"
                    disabled={isPending}
                    aria-label="Session label"
                    autoFocus
                />
                {templates.length > 0 && (
                    <Select value={templateId} onValueChange={setTemplateId} disabled={isPending}>
                        <SelectTrigger aria-label="Template" className="w-full">
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
            </form>
        </ModalShell>
    );
}
