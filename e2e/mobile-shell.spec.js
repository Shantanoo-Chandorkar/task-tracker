import { test, expect, loginAs } from './fixtures/test.js';

const LIGHT_BACKGROUND = '#fdfbf7';
const DARK_BACKGROUND = '#141210';

test.describe('mobile shell', () => {
    test('the viewport meta lets the page draw under the notch so safe-area insets are real', async ({
        page,
    }) => {
        await page.goto('/login');
        await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
            'content',
            /viewport-fit=cover/,
        );
    });

    for (const [storedTheme, expectedColor] of [
        ['light', LIGHT_BACKGROUND],
        ['dark', DARK_BACKGROUND],
    ]) {
        test(`the status bar color follows the in-app "${storedTheme}" theme, not the OS scheme`, async ({
            page,
        }) => {
            // The OS says the opposite of the stored theme, so only the in-app preference can produce a match.
            await page.emulateMedia({ colorScheme: storedTheme === 'light' ? 'dark' : 'light' });
            await page.addInitScript((theme) => localStorage.setItem('theme', theme), storedTheme);
            await page.goto('/login');

            // Next appends a third, unchanged tag a moment after load; browsers use the first matching one.
            const themeColorTags = page.locator('meta[name="theme-color"]');
            await expect(themeColorTags.nth(0)).toHaveAttribute('content', expectedColor);
            await expect(themeColorTags.nth(1)).toHaveAttribute('content', expectedColor);
        });
    }

    test('taps give no gray flash or delay, and long-pressing a button cannot select its label', async ({
        page,
    }) => {
        await page.goto('/login');
        const firstButton = page.getByRole('button').first();

        await expect(page.locator('html')).toHaveCSS(
            '-webkit-tap-highlight-color',
            'rgba(0, 0, 0, 0)',
        );
        await expect(firstButton).toHaveCSS('touch-action', 'manipulation');
        await expect(firstButton).toHaveCSS('user-select', 'none');
    });

    test('a scrolling box does not pass its scroll on to the page behind it', async ({ page }) => {
        await page.goto('/login');
        // Uses a class the app already ships, so Tailwind has emitted its CSS.
        await page.evaluate(() => {
            const scrollingBox = document.createElement('div');
            scrollingBox.id = 'scrolling-box';
            scrollingBox.className = 'overflow-y-auto';
            document.body.appendChild(scrollingBox);
        });

        await expect(page.locator('#scrolling-box')).toHaveCSS('overscroll-behavior-y', 'contain');
    });

    test('a small-text field is raised to 16px on touch screens only, so iPhones do not zoom', async ({
        page,
        isMobile,
    }) => {
        await page.goto('/login');
        await page.evaluate(() => {
            const smallTextField = document.createElement('input');
            smallTextField.id = 'small-text-field';
            smallTextField.className = 'text-sm';
            document.body.appendChild(smallTextField);
        });

        await expect(page.locator('#small-text-field')).toHaveCSS(
            'font-size',
            isMobile ? '16px' : '14px',
        );
    });

    test('the bottom nav is frosted glass, and goes solid when high contrast is on', async ({
        page,
        testUser,
        isMobile,
    }) => {
        test.skip(!isMobile, 'The bottom nav only exists below the lg breakpoint');
        await loginAs(page, testUser);
        const bottomNav = page.locator('nav.translucent-bar');

        await expect(bottomNav).toHaveCSS('backdrop-filter', /blur/);
        await page.emulateMedia({ contrast: 'more' });
        await expect(bottomNav).toHaveCSS('backdrop-filter', 'none');
    });
});
