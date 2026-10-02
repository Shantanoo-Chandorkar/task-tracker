import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ModalShell from './modal-shell';

const isDesktop = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => isDesktop.value }));

const LONG_WORD = `n${'w'.repeat(80)}`;

// jsdom cannot measure layout, so this guards the rules that keep a long unbroken word inside the card
function renderModal({ variant = 'form', desktop = true }) {
    isDesktop.value = desktop;
    render(
        <ModalShell
            open
            onClose={vi.fn()}
            variant={variant}
            title={`Delete "${LONG_WORD}"?`}
            description={`Remove ${LONG_WORD}`}
        >
            <p>body</p>
        </ModalShell>,
    );
    return {
        title: screen.getByText(`Delete "${LONG_WORD}"?`),
        description: screen.getByText(`Remove ${LONG_WORD}`),
        content: screen.getByRole(variant === 'alert' ? 'alertdialog' : 'dialog'),
    };
}

const modalCases = [
    ['alert popup on desktop', { variant: 'alert', desktop: true }],
    ['alert popup on mobile', { variant: 'alert', desktop: false }],
    ['form dialog on desktop', { variant: 'form', desktop: true }],
    ['form bottom sheet on mobile', { variant: 'form', desktop: false }],
    ['side sheet', { variant: 'sheet', desktop: true }],
];

describe.each(modalCases)('long text in the %s', (_label, options) => {
    afterEach(cleanup);

    it('wraps a long unbroken word in the title and the description', () => {
        const { title, description } = renderModal(options);

        for (const textElement of [title, description]) {
            expect(textElement.className).toContain('[overflow-wrap:anywhere]');
            expect(textElement.className).toContain('min-w-0');
        }
    });

    it('stops any child from widening the card', () => {
        const { content } = renderModal(options);

        expect(content.className).toContain('[&>*]:min-w-0');
    });
});
