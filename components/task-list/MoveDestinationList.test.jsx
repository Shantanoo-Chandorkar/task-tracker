import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MoveDestinationList from './MoveDestinationList';

const LONG_NAME = `n${'w'.repeat(80)}`;

// jsdom cannot measure layout, so this guards the rule that keeps a long unbroken sublist name inside the sheet
describe('MoveDestinationList long sublist name', () => {
    it('lets the group name and the "Move to" label wrap instead of overflowing the sheet', () => {
        render(
            <MoveDestinationList
                groups={[
                    {
                        id: 'sublist-1',
                        name: LONG_NAME,
                        color: '#112233',
                        roots: [],
                        canMoveToRoot: true,
                    },
                ]}
                onSelect={vi.fn()}
                onSelectSublist={vi.fn()}
            />,
        );

        for (const nameElement of [
            screen.getByText(LONG_NAME),
            screen.getByText(`Move to ${LONG_NAME}`),
        ]) {
            expect(nameElement.className).toContain('min-w-0');
            expect(nameElement.className).toContain('break-words');
        }
    });
});
