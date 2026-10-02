import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ColorNameField from './ColorNameField';

afterEach(cleanup);

function renderField(props = {}) {
    const onNameChange = vi.fn();
    const onColorChange = vi.fn();
    render(
        <ColorNameField
            label="List name"
            name="Groceries"
            onNameChange={onNameChange}
            color="#ff0000"
            onColorChange={onColorChange}
            maxLength={50}
            {...props}
        />,
    );
    return { onNameChange, onColorChange };
}

describe('ColorNameField', () => {
    it('names the name input by the visible label', () => {
        renderField();

        expect(screen.getByLabelText('List name').value).toBe('Groceries');
    });

    it('gives the colour picker its own accessible name', () => {
        renderField();

        expect(screen.getByLabelText('Color').value).toBe('#ff0000');
    });

    it('reports name and colour changes', () => {
        const { onNameChange, onColorChange } = renderField();

        fireEvent.change(screen.getByLabelText('List name'), { target: { value: 'Errands' } });
        fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#00ff00' } });

        expect(onNameChange).toHaveBeenCalledWith('Errands');
        expect(onColorChange).toHaveBeenCalledWith('#00ff00');
    });

    it('announces an error and marks the name input invalid', () => {
        renderField({ error: 'Name already exists' });

        expect(screen.getByRole('alert').textContent).toBe('Name already exists');
        expect(screen.getByLabelText('List name').getAttribute('aria-invalid')).toBe('true');
    });

    it('locks both controls while saving', () => {
        renderField({ disabled: true });

        expect(screen.getByLabelText('List name').disabled).toBe(true);
        expect(screen.getByLabelText('Color').disabled).toBe(true);
    });
});
