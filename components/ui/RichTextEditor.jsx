'use client';

import { useState } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Strikethrough, List, ListOrdered, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LinkDialog from '@/components/ui/LinkDialog';

/**
 * Icon-only toolbar button that tells screen readers its name and, for toggles, whether it is on.
 *
 * @param {object} props
 * @param {string} props.label - Accessible name, e.g. "Bold".
 * @param {boolean} [props.isActive] - Set for toggles; omit for plain actions so no pressed state is announced.
 * @param {boolean} [props.disabled] - Disables the button.
 * @param {Function} props.onClick - Click handler.
 * @param {import('react').ReactNode} props.children - The icon.
 */
function ToolbarButton({ label, isActive, disabled, onClick, children }) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={label}
            aria-pressed={isActive === undefined ? undefined : isActive}
            onClick={onClick}
            disabled={disabled}
            className={`h-8 w-8 p-0 ${isActive ? 'bg-accent text-accent-foreground' : ''}`}
        >
            {children}
        </Button>
    );
}

/**
 * Formatting toolbar for the rich text editor; renders nothing until the editor instance exists.
 *
 * @param {object} props
 * @param {import('@tiptap/react').Editor|null} props.editor - TipTap editor instance the buttons act on.
 */
function RichTextToolbar({ editor }) {
    const [linkDialogState, setLinkDialogState] = useState(null);
    // Tiptap does not re-render on selection changes by default, so the pressed state must be subscribed to
    const formatState = useEditorState({
        editor,
        selector: ({ editor: currentEditor }) => ({
            isBold: currentEditor.isActive('bold'),
            isItalic: currentEditor.isActive('italic'),
            isStrike: currentEditor.isActive('strike'),
            isBulletList: currentEditor.isActive('bulletList'),
            isOrderedList: currentEditor.isActive('orderedList'),
            isLink: currentEditor.isActive('link'),
            canBold: currentEditor.can().chain().focus().toggleBold().run(),
            canItalic: currentEditor.can().chain().focus().toggleItalic().run(),
            canStrike: currentEditor.can().chain().focus().toggleStrike().run(),
        }),
    });

    /**
     * Opens the link dialog prefilled from the current selection or the link under the cursor.
     */
    function openLinkDialog() {
        // Editing an existing link must cover the whole link, not just the cursor position
        if (editor.isActive('link')) editor.chain().extendMarkRange('link').run();
        const { from: selectionStart, to: selectionEnd } = editor.state.selection;
        setLinkDialogState({
            selectionStart,
            selectionEnd,
            initialText: editor.state.doc.textBetween(selectionStart, selectionEnd, ' '),
            initialUrl: editor.getAttributes('link').href ?? '',
            isEditing: editor.isActive('link'),
        });
    }

    /**
     * Replaces the remembered selection with the link text carrying the link mark.
     *
     * @param {{ text: string, url: string }} link - Text to show and the validated address it points to.
     */
    function saveLink({ text: linkText, url: linkUrl }) {
        const { selectionStart, selectionEnd } = linkDialogState;
        editor
            .chain()
            .focus()
            .insertContentAt(
                { from: selectionStart, to: selectionEnd },
                {
                    type: 'text',
                    text: linkText,
                    marks: [{ type: 'link', attrs: { href: linkUrl } }],
                },
            )
            .run();
        setLinkDialogState(null);
    }

    function removeLink() {
        const { selectionStart, selectionEnd } = linkDialogState;
        editor
            .chain()
            .focus()
            .setTextSelection({ from: selectionStart, to: selectionEnd })
            .unsetLink()
            .run();
        setLinkDialogState(null);
    }

    return (
        <>
            <div
                role="toolbar"
                aria-label="Formatting"
                className="flex items-center gap-1 border-b border-border p-1 overflow-x-auto"
            >
                <ToolbarButton
                    label="Bold"
                    isActive={formatState.isBold}
                    disabled={!formatState.canBold}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                >
                    <Bold className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    label="Italic"
                    isActive={formatState.isItalic}
                    disabled={!formatState.canItalic}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                >
                    <Italic className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    label="Strikethrough"
                    isActive={formatState.isStrike}
                    disabled={!formatState.canStrike}
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                >
                    <Strikethrough className="h-4 w-4" />
                </ToolbarButton>
                <div aria-hidden="true" className="w-[1px] h-4 bg-border mx-1" />
                <ToolbarButton
                    label="Bulleted list"
                    isActive={formatState.isBulletList}
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                >
                    <List className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    label="Numbered list"
                    isActive={formatState.isOrderedList}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                >
                    <ListOrdered className="h-4 w-4" />
                </ToolbarButton>
                <div aria-hidden="true" className="w-[1px] h-4 bg-border mx-1" />
                <ToolbarButton label="Link" isActive={formatState.isLink} onClick={openLinkDialog}>
                    <Link2 className="h-4 w-4" />
                </ToolbarButton>
                {formatState.isLink && (
                    <ToolbarButton
                        label="Remove link"
                        onClick={() => editor.chain().focus().unsetLink().run()}
                    >
                        <Unlink className="h-4 w-4" />
                    </ToolbarButton>
                )}
            </div>
            {linkDialogState && (
                <LinkDialog
                    initialText={linkDialogState.initialText}
                    initialUrl={linkDialogState.initialUrl}
                    isEditing={linkDialogState.isEditing}
                    onSave={saveLink}
                    onRemove={removeLink}
                    onClose={() => setLinkDialogState(null)}
                />
            )}
        </>
    );
}

/**
 * TipTap rich text editor; images are disabled to avoid base64 bloat and XSS vectors in stored HTML.
 *
 * @param {object} props
 * @param {string} props.value - Current HTML content.
 * @param {Function} props.onChange - Called with the new HTML string on every update.
 * @param {number} [props.maxLength=10000] - Maximum HTML character limit.
 * @param {string} [props.placeholder=''] - Placeholder hint shown in the empty editor.
 * @param {string} props.ariaLabel - Accessible name of the editable area (a contenteditable cannot use a <label>).
 */
export default function RichTextEditor({
    value,
    onChange,
    maxLength = 10000,
    placeholder = '',
    ariaLabel,
}) {
    const editor = useEditor({
        // Already the default here ('use client') - set explicitly only to silence the console warning.
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                // Headings and code blocks are out of scope for task descriptions
                heading: false,
                codeBlock: false,
                // StarterKit bundles its own Link under the same name since tiptap v3 - disabled to avoid the clash.
                link: false,
            }),
            Link.configure({
                openOnClick: false,
                autolink: true,
                defaultProtocol: 'https',
                HTMLAttributes: {
                    rel: 'noopener noreferrer',
                    target: '_blank',
                },
            }),
        ],
        content: value,
        onUpdate: ({ editor }) => {
            const editorHtml = editor.getHTML();
            // An untouched editor emits '<p></p>', which must count as empty for validation
            onChange(editorHtml === '<p></p>' ? '' : editorHtml);
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[200px] p-3 overflow-y-auto max-h-[40dvh] [overflow-wrap:anywhere]',
                placeholder,
                role: 'textbox',
                'aria-label': ariaLabel,
                'aria-multiline': 'true',
            },
        },
    });

    const isExceeded = value.length > maxLength;

    return (
        <div className="space-y-1 min-w-0">
            <div
                className={`border rounded-md ${isExceeded ? 'border-destructive' : 'border-input'} overflow-hidden bg-background focus-within:ring-2 focus-within:ring-ring`}
            >
                {editor && <RichTextToolbar editor={editor} />}
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}
