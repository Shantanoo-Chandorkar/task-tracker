import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StatusBadge from './StatusBadge';
import { PILL_SURFACE_COLORS, contrastRatio, mixColors } from '@/lib/color-contrast';

afterEach(cleanup);

function renderBadge(color) {
    render(<StatusBadge name="Doing" color={color} />);
    return screen.getByText('Doing');
}

describe('StatusBadge text colour', () => {
    it('makes a light colour readable on the light theme, where plain yellow text would not be', () => {
        const pill = renderBadge('#facc15');
        const lightText = pill.style.getPropertyValue('--status-text-light');

        expect(lightText).not.toBe('#facc15');
        for (const surface of PILL_SURFACE_COLORS.light) {
            expect(
                contrastRatio(lightText, mixColors('#facc15', surface, 0.15)),
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('makes a dark colour readable on the dark theme', () => {
        const pill = renderBadge('#1e3a8a');
        const darkText = pill.style.getPropertyValue('--status-text-dark');

        for (const surface of PILL_SURFACE_COLORS.dark) {
            expect(
                contrastRatio(darkText, mixColors('#1e3a8a', surface, 0.15)),
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('picks the text colour per theme with a dark: class, so no theme lookup is needed', () => {
        const pill = renderBadge('#3b82f6');

        expect(pill.className).toContain('text-[color:var(--status-text-light)]');
        expect(pill.className).toContain('dark:text-[color:var(--status-text-dark)]');
    });

    it('keeps the tint and border from the picked colour', () => {
        const pill = renderBadge('#3b82f6');

        expect(pill.style.backgroundColor).not.toBe('transparent');
        expect(pill.style.border).toContain('1px solid');
    });

    it('falls back to the default grey instead of using a colour that is not plain hex', () => {
        const pill = renderBadge('red;background:url(javascript:alert(1))');

        expect(pill.style.cssText).not.toContain('javascript');
        expect(pill.style.getPropertyValue('--status-text-light')).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('draws a plain, tint-less pill when there is no colour', () => {
        const pill = renderBadge(undefined);

        expect(pill.style.getPropertyValue('--status-text-light')).toBe('');
        expect(pill.className).not.toContain('--status-text-light');
    });

    it('renders nothing without a name', () => {
        const { container } = render(<StatusBadge name="" color="#3b82f6" />);

        expect(container.firstChild).toBeNull();
    });
});
