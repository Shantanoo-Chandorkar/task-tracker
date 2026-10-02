import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TagComboboxField from './TagComboboxField';

const LONG_TAG = `n${'w'.repeat(48)}`;

// jsdom cannot measure layout, so this guards the rule that keeps a long tag inside its dialog
describe('TagComboboxField long tag name', () => {
    it('caps the badge to its container and ellipsizes the name', () => {
        render(
            <TagComboboxField
                tags={[{ key: 'tag-1', name: LONG_TAG }]}
                suggestions={[]}
                onAdd={vi.fn()}
                onRemove={vi.fn()}
            />,
        );

        const nameElement = screen.getByText(LONG_TAG);

        expect(nameElement.className).toContain('truncate');
        expect(nameElement.closest('[data-slot="badge"]').className).toContain('max-w-full');
    });
});
