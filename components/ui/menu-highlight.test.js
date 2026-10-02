import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// jsdom cannot compute colours, so these guard the classes that make the highlighted menu item visible
function readSource(relativePath) {
    return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('highlighted menu item stays visible', () => {
    it.each(['components/ui/select.jsx', 'components/ui/dropdown-menu.jsx'])(
        '%s fills the item with a tint of the text colour and rings it for the keyboard',
        (filePath) => {
            const fileSource = readSource(filePath);

            expect(fileSource).toContain('focus:bg-foreground/10');
            expect(fileSource).toContain(
                'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            );
        },
    );

    it.each(['components/ui/select.jsx', 'components/ui/dropdown-menu.jsx'])(
        '%s does not highlight with the accent colour, which equals the menu background',
        (filePath) => {
            expect(readSource(filePath)).not.toContain('focus:bg-accent');
        },
    );

    it('fills the selected search result with the same tint', () => {
        expect(readSource('components/ui/command.jsx')).toContain('data-selected:bg-foreground/10');
    });
});
