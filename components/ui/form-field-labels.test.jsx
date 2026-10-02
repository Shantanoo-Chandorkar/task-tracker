import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import LabeledField from './LabeledField';
import CharLimitField from './CharLimitField';

afterEach(cleanup);

describe('LabeledField', () => {
    it('ties the label to the control it wraps', () => {
        render(
            <LabeledField label="Due date">
                {({ controlId }) => <input id={controlId} type="date" />}
            </LabeledField>,
        );

        expect(screen.getByLabelText('Due date')).toBeTruthy();
    });

    it('gives two fields on one page different ids', () => {
        render(
            <>
                <LabeledField label="First">
                    {({ controlId }) => <input id={controlId} />}
                </LabeledField>
                <LabeledField label="Second">
                    {({ controlId }) => <input id={controlId} />}
                </LabeledField>
            </>,
        );

        expect(screen.getByLabelText('First').id).not.toBe(screen.getByLabelText('Second').id);
    });

    it('still renders plain children', () => {
        render(
            <LabeledField label="Plain">
                <span>content</span>
            </LabeledField>,
        );

        expect(screen.getByText('content')).toBeTruthy();
    });
});

describe('CharLimitField', () => {
    function renderField(props = {}) {
        render(
            <CharLimitField label="Name" currentLength={3} maxLength={50} {...props}>
                {(controlProps) => <input {...controlProps} defaultValue="abc" />}
            </CharLimitField>,
        );
        return screen.getByLabelText('Name');
    }

    it('ties the label to the input', () => {
        expect(renderField()).toBeTruthy();
    });

    it('marks the input invalid and announces the error, linked by aria-describedby', () => {
        const input = renderField({ error: 'Name already exists' });

        const alert = screen.getByRole('alert');
        expect(alert.textContent).toBe('Name already exists');
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    });

    it('announces the limit message when the cap is reached and no other error shows', () => {
        const input = renderField({ currentLength: 50 });

        expect(screen.getByRole('alert').textContent).toBe('Character limit exceeded');
        expect(input.getAttribute('aria-invalid')).toBe('true');
    });

    it('leaves the input valid and undescribed when there is no error', () => {
        const input = renderField();

        expect(screen.queryByRole('alert')).toBeNull();
        expect(input.getAttribute('aria-invalid')).toBeNull();
        expect(input.getAttribute('aria-describedby')).toBeNull();
    });

    it('hides the character counter from screen readers', () => {
        renderField();

        expect(screen.getByText('3/50').getAttribute('aria-hidden')).toBe('true');
    });
});
