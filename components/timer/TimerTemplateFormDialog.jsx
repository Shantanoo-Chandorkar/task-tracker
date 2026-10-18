'use client';

import { useId } from 'react';
import { useTimerTemplateForm } from '@/hooks/useTimerTemplateForm';
import ModalShell from '@/components/custom/ModalShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LabeledField from '@/components/custom/LabeledField';
import { Loader } from '@/components/custom/Loader';
import TemplateBlockEditor from './TemplateBlockEditor';
import {
    createTimerTemplate,
    updateTimerTemplate,
} from '@/modules/timer/actions/timer-template-actions';
import {
    TIMER_TEMPLATE_NAME_MAX,
    POMODORO_PRESET_NAME,
    POMODORO_PRESET_BLOCKS,
} from '@/modules/timer/timer-limits';

/**
 * Modal for creating or editing a timer template, rendered through the shared ModalShell.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open.
 * @param {() => void} props.onClose - Called when the dialog should close.
 * @param {object|null} [props.template] - Template to edit, or null for create mode.
 */
export default function TimerTemplateFormDialog({ open, onClose, template = null }) {
    const formId = useId();
    const { isEditing, name, setName, blocks, setBlocks, submitting, error, handleSubmit } =
        useTimerTemplateForm({
            open,
            template,
            create: createTimerTemplate,
            update: updateTimerTemplate,
            onClose,
        });

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={submitting}
            title={isEditing ? 'Edit template' : 'New template'}
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form={formId}
                        disabled={!name.trim() || blocks.length === 0 || submitting}
                        className="gap-1.5"
                    >
                        {submitting && <Loader size="xs" />}
                        {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create template'}
                    </Button>
                </>
            }
        >
            <form id={formId} onSubmit={handleSubmit} className="space-y-4 mt-2">
                <LabeledField label="Template name">
                    {({ controlId }) => (
                        <Input
                            id={controlId}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={TIMER_TEMPLATE_NAME_MAX}
                            disabled={submitting}
                        />
                    )}
                </LabeledField>
                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Blocks</span>
                        {blocks.length === 0 && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setName((currentName) => currentName || POMODORO_PRESET_NAME);
                                    setBlocks(POMODORO_PRESET_BLOCKS);
                                }}
                                disabled={submitting}
                            >
                                Use Pomodoro preset
                            </Button>
                        )}
                    </div>
                    <TemplateBlockEditor
                        blocks={blocks}
                        onChange={setBlocks}
                        disabled={submitting}
                    />
                </div>
            </form>
        </ModalShell>
    );
}
