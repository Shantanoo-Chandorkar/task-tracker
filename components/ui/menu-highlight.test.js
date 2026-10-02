import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// jsdom cannot compute colours; lib/theme-contrast.test.js proves --accent differs from the menu background
function readSource(relativePath) {
    return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('highlighted menu item stays visible', () => {
    it.each(['components/ui/select.jsx', 'components/ui/dropdown-menu.jsx'])(
        '%s fills the item with the accent colour and rings it for the keyboard',
        (filePath) => {
            const fileSource = readSource(filePath);

            expect(fileSource).toContain('focus:bg-accent');
            expect(fileSource).toContain(
                'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            );
        },
    );

    it('fills the selected search result with the accent colour', () => {
        expect(readSource('components/ui/command.jsx')).toContain('data-selected:bg-accent');
    });
});
