import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TemplateBlockEditor from './TemplateBlockEditor';

// Radix Select positions its listbox with ResizeObserver and scrollIntoView, which jsdom lacks
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

const BLOCKS = [
    { kind: 'work', label: 'Focus', durationSeconds: 1500 },
    { kind: 'break', label: 'Break', durationSeconds: 300 },
];

describe('TemplateBlockEditor', () => {
    it('renders one row per block with its label and minutes', () => {
        render(<TemplateBlockEditor blocks={BLOCKS} onChange={vi.fn()} />);

        expect(screen.getByDisplayValue('Focus')).toBeTruthy();
        expect(screen.getByLabelText('Block 1 minutes').value).toBe('25');
        expect(screen.getByLabelText('Block 2 minutes').value).toBe('5');
    });

    it('adds a new block', () => {
        const onChange = vi.fn();
        render(<TemplateBlockEditor blocks={BLOCKS} onChange={onChange} />);

        fireEvent.click(screen.getByText('+ Add block'));

        expect(onChange).toHaveBeenCalledWith([
            ...BLOCKS,
            { kind: 'work', label: '', durationSeconds: 1500 },
        ]);
    });

    it('removes a block', () => {
        const onChange = vi.fn();
        render(<TemplateBlockEditor blocks={BLOCKS} onChange={onChange} />);

        fireEvent.click(screen.getAllByLabelText('Remove block')[0]);

        expect(onChange).toHaveBeenCalledWith([BLOCKS[1]]);
    });

    it('moves a block down, and the first row cannot move further up', () => {
        const onChange = vi.fn();
        render(<TemplateBlockEditor blocks={BLOCKS} onChange={onChange} />);

        expect(screen.getAllByLabelText('Move block up')[0].disabled).toBe(true);

        fireEvent.click(screen.getAllByLabelText('Move block down')[0]);

        expect(onChange).toHaveBeenCalledWith([BLOCKS[1], BLOCKS[0]]);
    });

    it('edits a block’s label and minutes', () => {
        const onChange = vi.fn();
        render(<TemplateBlockEditor blocks={BLOCKS} onChange={onChange} />);

        fireEvent.change(screen.getByLabelText('Block 1 label'), {
            target: { value: 'Deep work' },
        });
        expect(onChange).toHaveBeenCalledWith([{ ...BLOCKS[0], label: 'Deep work' }, BLOCKS[1]]);

        fireEvent.change(screen.getByLabelText('Block 1 minutes'), { target: { value: '10' } });
        expect(onChange).toHaveBeenCalledWith([{ ...BLOCKS[0], durationSeconds: 600 }, BLOCKS[1]]);
    });

    it('disables every control when disabled', () => {
        render(<TemplateBlockEditor blocks={BLOCKS} onChange={vi.fn()} disabled />);

        expect(screen.getByLabelText('Block 1 label').disabled).toBe(true);
        expect(screen.getByText('+ Add block').closest('button').disabled).toBe(true);
    });

    it('stops adding blocks at the max count', () => {
        const maxBlocks = Array.from({ length: 20 }, () => ({
            kind: 'work',
            label: '',
            durationSeconds: 60,
        }));
        render(<TemplateBlockEditor blocks={maxBlocks} onChange={vi.fn()} />);

        expect(screen.getByText('+ Add block').closest('button').disabled).toBe(true);
    });
});
