'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { normalizeLinkUrl } from '@/lib/validation';

const LINK_TEXT_MAX_LENGTH = 300;

/**
 * Modal for adding or editing a link with separate Text and URL fields.
 * Not a <form>: it is portalled inside the task form, and React would bubble its submit into that form.
 *
 * @param {object} props
 * @param {string} props.initialText - Text prefilled from the editor selection or the link being edited.
 * @param {string} props.initialUrl - Address prefilled when editing an existing link, else ''.
 * @param {boolean} props.isEditing - True when the cursor is on an existing link, which enables Remove link.
 * @param {(link: { text: string, url: string }) => void} props.onSave - Called with the validated link.
 * @param {() => void} props.onRemove - Called when the user removes the existing link.
 * @param {() => void} props.onClose - Called when the dialog is dismissed without saving.
 */
export default function LinkDialog({
    initialText,
    initialUrl,
    isEditing,
    onSave,
    onRemove,
    onClose,
}) {
    const [linkText, setLinkText] = useState(initialText);
    const [linkUrl, setLinkUrl] = useState(initialUrl);
    const [linkUrlError, setLinkUrlError] = useState('');

    function submitLink() {
        const normalizedLink = normalizeLinkUrl(linkUrl);
        if (normalizedLink.error) {
            setLinkUrlError(normalizedLink.error);
            return;
        }
        onSave({ text: linkText.trim() || normalizedLink.url, url: normalizedLink.url });
    }

    function submitLinkOnEnterKey(keyDownEvent) {
        if (keyDownEvent.key !== 'Enter') return;
        keyDownEvent.preventDefault();
        keyDownEvent.stopPropagation();
        submitLink();
    }

    return (
        <Dialog open onOpenChange={(isDialogOpen) => !isDialogOpen && onClose()}>
            <DialogContent
                className="sm:max-w-md"
                // The editor restores its own focus after saving; Radix would otherwise focus a stale trigger
                onCloseAutoFocus={(focusEvent) => focusEvent.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Edit link' : 'Add link'}</DialogTitle>
                </DialogHeader>

                <div className="space-y-3 min-w-0">
                    <div className="space-y-1">
                        <label htmlFor="link-text" className="text-sm font-medium text-foreground">
                            Text
                        </label>
                        <Input
                            id="link-text"
                            value={linkText}
                            onChange={(changeEvent) => setLinkText(changeEvent.target.value)}
                            onKeyDown={submitLinkOnEnterKey}
                            placeholder="Text to display"
                            maxLength={LINK_TEXT_MAX_LENGTH}
                        />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="link-url" className="text-sm font-medium text-foreground">
                            URL
                        </label>
                        <Input
                            id="link-url"
                            value={linkUrl}
                            onChange={(changeEvent) => {
                                setLinkUrl(changeEvent.target.value);
                                setLinkUrlError('');
                            }}
                            onKeyDown={submitLinkOnEnterKey}
                            placeholder="https://example.com"
                            inputMode="url"
                            autoCapitalize="none"
                            autoCorrect="off"
                            aria-invalid={Boolean(linkUrlError)}
                            autoFocus
                        />
                        {linkUrlError && <p className="text-xs text-destructive">{linkUrlError}</p>}
                    </div>
                </div>

                <DialogFooter>
                    {isEditing && (
                        <Button
                            type="button"
                            variant="ghost"
                            className="sm:mr-auto"
                            onClick={onRemove}
                        >
                            Remove link
                        </Button>
                    )}
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={submitLink}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
