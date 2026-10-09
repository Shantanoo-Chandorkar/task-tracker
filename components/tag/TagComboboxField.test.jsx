import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TagComboboxField from './TagComboboxField';

const LONG_TAG = `n${'w'.repeat(48)}`;

// Radix and cmdk need these browser features, which jsdom does not provide
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

afterEach(cleanup);

const SUGGESTIONS = [
    { key: 'tag-1', name: 'Urgent', color: '#ff0000' },
    { key: 'tag-2', name: 'Later', color: '#00ff00' },
    { key: 'tag-3', name: 'Home', color: '#0000ff' },
];

function renderField(props = {}) {
    const handlers = { onAdd: vi.fn(), onRemove: vi.fn() };
    render(
        <TagComboboxField
            tags={[SUGGESTIONS[0]]}
            suggestions={SUGGESTIONS}
            {...handlers}
            {...props}
        />,
    );
    return handlers;
}

function openPicker() {
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }));
}

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

describe('TagComboboxField picking', () => {
    it('lists the space tags that are not on the task yet, and picks one by its key', async () => {
        const { onAdd } = renderField();
        openPicker();

        expect(screen.queryByRole('option', { name: 'Urgent' })).toBeNull();
        expect(await screen.findByRole('option', { name: 'Later' })).toBeTruthy();
        fireEvent.click(screen.getByRole('option', { name: 'Home' }));

        expect(onAdd).toHaveBeenCalledWith('tag-3');
    });

    it('narrows the list as the user types, and never offers to create a tag', async () => {
        renderField();
        openPicker();

        fireEvent.change(await screen.findByPlaceholderText('Find a tag'), {
            target: { value: 'lat' },
        });

        expect(screen.getByRole('option', { name: 'Later' })).toBeTruthy();
        expect(screen.queryByRole('option', { name: 'Home' })).toBeNull();

        fireEvent.change(screen.getByPlaceholderText('Find a tag'), {
            target: { value: 'brand new' },
        });
        expect(screen.getByText('No matching tags')).toBeTruthy();
        expect(screen.queryByText(/Create/)).toBeNull();
    });

    it('points to the space settings when the space has no tags at all', async () => {
        renderField({ tags: [], suggestions: [] });
        openPicker();

        expect(
            await screen.findByText('No tags yet. Add them in the space settings.'),
        ).toBeTruthy();
    });

    it('removes an attached tag by its key', () => {
        const { onRemove } = renderField();

        fireEvent.click(screen.getByRole('button', { name: 'Remove tag Urgent' }));

        expect(onRemove).toHaveBeenCalledWith('tag-1');
    });

    it('shows each tag with its colour', () => {
        renderField();

        const dot = screen.getByText('Urgent').parentElement.querySelector('[aria-hidden="true"]');
        expect(dot.style.backgroundColor).toBe('rgb(255, 0, 0)');
    });

    it('stops offering more once the task has ten tags', () => {
        const tenTags = Array.from({ length: 10 }, (_, index) => ({
            key: `own-${index}`,
            name: `Own ${index}`,
        }));
        renderField({ tags: tenTags });

        const trigger = screen.getByRole('button', { name: 'Tag' });
        expect(trigger.disabled).toBe(true);
        expect(trigger.getAttribute('title')).toBe('A task can have at most 10 tags');
    });

    it('shows the pills with no add or remove controls when read-only', () => {
        renderField({ isReadOnly: true });

        expect(screen.getByText('Urgent')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Tag' })).toBeNull();
        expect(screen.queryByRole('button', { name: /Remove tag/ })).toBeNull();
    });

    it('locks the trigger while an add is saving', () => {
        renderField({ addPending: true });

        expect(screen.getByRole('button', { name: /Tag/ }).disabled).toBe(true);
    });
});
