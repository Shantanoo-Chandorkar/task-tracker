import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RichTextEditor from './RichTextEditor';

// jsdom has no layout engine; ProseMirror asks for these when it scrolls the caret into view
beforeAll(() => {
    document.elementFromPoint = () => null;
    Range.prototype.getClientRects = () => [];
    Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0 });
});

afterEach(cleanup);

async function renderEditor(props = {}) {
    render(<RichTextEditor value="" onChange={vi.fn()} ariaLabel="Description" {...props} />);
    return screen.findByRole('toolbar', { name: 'Formatting' });
}

describe('RichTextEditor accessibility', () => {
    it('exposes the toolbar as a labelled toolbar', async () => {
        expect(await renderEditor()).toBeTruthy();
    });

    it('gives every toolbar button a name', async () => {
        const toolbar = await renderEditor();

        for (const name of [
            'Bold',
            'Italic',
            'Strikethrough',
            'Bulleted list',
            'Numbered list',
            'Link',
        ]) {
            expect(toolbar.querySelector(`button[aria-label="${name}"]`)).not.toBeNull();
        }
    });

    it('reports a toggle button as pressed once it is on', async () => {
        const toolbar = await renderEditor();
        const boldButton = toolbar.querySelector('button[aria-label="Bold"]');
        expect(boldButton.getAttribute('aria-pressed')).toBe('false');

        const editable = screen.getByRole('textbox', { name: 'Description' });
        editable.focus();
        fireEvent.click(boldButton);

        expect(boldButton.getAttribute('aria-pressed')).toBe('true');
    });

    it('names the editable area and marks it multiline', async () => {
        await renderEditor();

        const editable = screen.getByRole('textbox', { name: 'Description' });
        expect(editable.getAttribute('aria-multiline')).toBe('true');
    });
});
