import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EditorErrorBoundary from './EditorErrorBoundary';

function BrokenEditor() {
    throw new Error('editor exploded');
}

describe('EditorErrorBoundary', () => {
    it('renders its children while they work', () => {
        render(
            <EditorErrorBoundary value="" onChange={() => {}} maxLength={100}>
                <p>working editor</p>
            </EditorErrorBoundary>,
        );
        expect(screen.getByText('working editor')).toBeTruthy();
    });

    it('falls back to a textarea that keeps the current value when the editor throws', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(
            <EditorErrorBoundary value="<p>kept text</p>" onChange={() => {}} maxLength={100}>
                <BrokenEditor />
            </EditorErrorBoundary>,
        );
        const fallbackTextarea = screen.getByRole('textbox', { name: 'Description' });
        expect(fallbackTextarea.value).toBe('<p>kept text</p>');
        expect(fallbackTextarea.maxLength).toBe(100);
    });
});
