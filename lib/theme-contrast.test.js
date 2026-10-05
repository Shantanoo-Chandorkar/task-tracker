import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PILL_SURFACE_COLORS, PILL_TEXT_TARGET_COLORS, contrastRatio } from './color-contrast';

// Reads the real tokens from globals.css, so a colour change that breaks contrast fails here
const globalsCss = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

function readTokens(blockSelector) {
    const blockStart = globalsCss.indexOf(`${blockSelector} {`);
    const blockEnd = globalsCss.indexOf('\n}', blockStart);
    const block = globalsCss.slice(blockStart, blockEnd);
    return Object.fromEntries(
        [...block.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map(([, name, value]) => [
            name,
            value.trim(),
        ]),
    );
}

/**
 * Turns `oklch(L C H)` into `#rrggbb` so the destructive token can be measured like the hex ones.
 */
function oklchToHex(oklchText) {
    const [lightness, chroma, hue] = oklchText
        .match(/oklch\(([^)]+)\)/)[1]
        .split(/\s+/)
        .map(Number);
    const greenRedAxis = chroma * Math.cos((hue * Math.PI) / 180);
    const blueYellowAxis = chroma * Math.sin((hue * Math.PI) / 180);
    const longCone = (lightness + 0.3963377774 * greenRedAxis + 0.2158037573 * blueYellowAxis) ** 3;
    const mediumCone =
        (lightness - 0.1055613458 * greenRedAxis - 0.0638541728 * blueYellowAxis) ** 3;
    const shortCone = (lightness - 0.0894841775 * greenRedAxis - 1.291485548 * blueYellowAxis) ** 3;
    const linearChannels = [
        4.0767416621 * longCone - 3.3077115913 * mediumCone + 0.2309699292 * shortCone,
        -1.2684380046 * longCone + 2.6097574011 * mediumCone - 0.3413193965 * shortCone,
        -0.0041960863 * longCone - 0.7034186147 * mediumCone + 1.707614701 * shortCone,
    ];
    const channels = linearChannels.map((value) => {
        const clamped = Math.min(1, Math.max(0, value));
        const encoded =
            clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
        return Math.round(encoded * 255);
    });
    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function asHex(tokenValue) {
    return tokenValue.startsWith('oklch') ? oklchToHex(tokenValue) : tokenValue;
}

const tokensByTheme = { light: readTokens(':root'), dark: readTokens('.dark') };

describe.each(Object.entries(tokensByTheme))('%s theme tokens', (themeName, tokens) => {
    const pageColor = tokens.background;
    const cardColor = tokens.card;

    it.each([
        ['foreground', tokens.foreground, pageColor, 4.5],
        ['foreground', tokens.foreground, cardColor, 4.5],
        ['muted text', tokens['muted-foreground'], pageColor, 4.5],
        ['muted text', tokens['muted-foreground'], cardColor, 4.5],
        ['primary text', tokens.primary, pageColor, 4.5],
        ['primary text', tokens.primary, cardColor, 4.5],
        ['destructive text', asHex(tokens.destructive), pageColor, 4.5],
        ['destructive text', asHex(tokens.destructive), cardColor, 4.5],
        ['field border', tokens['field-border'], pageColor, 3],
        ['field border', tokens['field-border'], cardColor, 3],
        ['focus ring', tokens.ring, pageColor, 3],
        ['focus ring', tokens.ring, cardColor, 3],
    ])('%s reaches its ratio on %#', (_label, foreground, background, minimumRatio) => {
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(minimumRatio);
    });

    it('keeps the highlighted menu item visibly different from the menu background', () => {
        expect(contrastRatio(tokens.accent, tokens.popover)).toBeGreaterThanOrEqual(1.1);
        expect(contrastRatio(tokens['accent-foreground'], tokens.accent)).toBeGreaterThanOrEqual(
            4.5,
        );
    });

    it('matches the surfaces the status pill is measured against', () => {
        expect(PILL_SURFACE_COLORS[themeName]).toEqual([pageColor, cardColor]);
    });

    it('moves status pill text toward the foreground token', () => {
        expect(PILL_TEXT_TARGET_COLORS[themeName]).toBe(tokens.foreground);
    });
});

describe('form controls use the field border', () => {
    const fieldFiles = [
        'components/ui/input.jsx',
        'components/ui/textarea.jsx',
        'components/ui/select.jsx',
        'components/ui/checkbox.jsx',
        'components/ui/input-group.jsx',
        'components/custom/RichTextEditor.jsx',
        'components/tag/TagComboboxField.jsx',
    ];

    it('maps the token to the border-field class', () => {
        expect(globalsCss).toContain('--color-field: var(--field-border);');
    });

    it.each(fieldFiles)(
        '%s draws its border with border-field, not the soft border-input',
        (filePath) => {
            const fileSource = readFileSync(resolve(process.cwd(), filePath), 'utf8');

            expect(fileSource).toContain('border-field');
            expect(fileSource).not.toContain('border-input');
        },
    );
});

function listJsxFiles(directory) {
    return readdirSync(directory).flatMap((entryName) => {
        const entryPath = join(directory, entryName);
        if (statSync(entryPath).isDirectory()) return listJsxFiles(entryPath);
        return entryName.endsWith('.jsx') && !entryName.includes('.test.') ? [entryPath] : [];
    });
}

const appJsxFiles = ['components', 'app'].flatMap((directory) =>
    listJsxFiles(resolve(process.cwd(), directory)),
);

function filesContaining(pattern) {
    return appJsxFiles.filter((filePath) => pattern.test(readFileSync(filePath, 'utf8')));
}

describe('colour classes that failed contrast are gone', () => {
    it('has no faint /50 or /60 muted text or controls', () => {
        expect(filesContaining(/muted-foreground\/(50|60)/)).toEqual([]);
    });

    it('has no amber or blue 400 or 500 text, fill or bar in light mode (each needs a dark: pair)', () => {
        const lightModeOnlyColour =
            /(?<!dark:)(?<!dark:hover:)(text|fill|bg)-(amber|blue)-(400|500)(?![/\d])/;
        expect(filesContaining(lightModeOnlyColour)).toEqual([]);
    });

    it('lets the row drag handle and star show the keyboard focus ring', () => {
        const rowSource = readFileSync(
            resolve(process.cwd(), 'components/task-list/TaskRow.jsx'),
            'utf8',
        );

        expect(rowSource).not.toContain('focus:outline-none');
    });

    it('has one global keyboard focus outline in the ring colour', () => {
        expect(globalsCss).toMatch(/:focus-visible\s*{[^}]*outline:\s*2px solid var\(--ring\)/);
    });
});
