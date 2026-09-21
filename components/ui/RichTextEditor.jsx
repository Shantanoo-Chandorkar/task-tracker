'use client';

import { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Strikethrough, List, ListOrdered, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Formatting toolbar for the rich text editor; renders nothing until the editor instance exists.
 *
 * @param {object} props
 * @param {import('@tiptap/react').Editor|null} props.editor - TipTap editor instance the buttons act on.
 */
function RichTextToolbar({ editor }) {
    const setLink = useCallback(() => {
        const previousUrl = editor.getAttributes('link').href;
        const enteredUrl = window.prompt('URL', previousUrl);

        if (enteredUrl === null) {
            return;
        }

        if (enteredUrl === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }

        editor.chain().focus().extendMarkRange('link').setLink({ href: enteredUrl }).run();
    }, [editor]);

    if (!editor) {
        return null;
    }

    return (
        <div className="flex items-center gap-1 border-b border-border p-1 overflow-x-auto">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().toggleBold().run()}
                disabled={!editor.can().chain().focus().toggleBold().run()}
                className={`h-8 w-8 p-0 ${editor.isActive('bold') ? 'bg-accent text-accent-foreground' : ''}`}
            >
                <Bold className="h-4 w-4" />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                disabled={!editor.can().chain().focus().toggleItalic().run()}
                className={`h-8 w-8 p-0 ${editor.isActive('italic') ? 'bg-accent text-accent-foreground' : ''}`}
            >
                <Italic className="h-4 w-4" />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().toggleStrike().run()}
                disabled={!editor.can().chain().focus().toggleStrike().run()}
                className={`h-8 w-8 p-0 ${editor.isActive('strike') ? 'bg-accent text-accent-foreground' : ''}`}
            >
                <Strikethrough className="h-4 w-4" />
            </Button>
            <div className="w-[1px] h-4 bg-border mx-1" />
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`h-8 w-8 p-0 ${editor.isActive('bulletList') ? 'bg-accent text-accent-foreground' : ''}`}
            >
                <List className="h-4 w-4" />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={`h-8 w-8 p-0 ${editor.isActive('orderedList') ? 'bg-accent text-accent-foreground' : ''}`}
            >
                <ListOrdered className="h-4 w-4" />
            </Button>
            <div className="w-[1px] h-4 bg-border mx-1" />
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={setLink}
                className={`h-8 w-8 p-0 ${editor.isActive('link') ? 'bg-accent text-accent-foreground' : ''}`}
            >
                <Link2 className="h-4 w-4" />
            </Button>
            {editor.isActive('link') && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().unsetLink().run()}
                    className="h-8 w-8 p-0"
                >
                    <Unlink className="h-4 w-4" />
                </Button>
            )}
        </div>
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
 */
export default function RichTextEditor({ value, onChange, maxLength = 10000, placeholder = '' }) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Headings and code blocks are out of scope for task descriptions
                heading: false,
                codeBlock: false,
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
                class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[200px] p-3 overflow-y-auto max-h-[40vh]',
                placeholder,
            },
        },
    });

    const isExceeded = value.length > maxLength;

    return (
        <div className="space-y-1">
            <div
                className={`border rounded-md ${isExceeded ? 'border-destructive' : 'border-input'} overflow-hidden bg-background`}
            >
                <RichTextToolbar editor={editor} />
                <EditorContent editor={editor} />
            </div>
            {isExceeded && <p className="text-xs text-destructive">Character limit exceeded</p>}
        </div>
    );
}
