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

    test('pressing a bottom nav link shrinks and fades it, and only fades it with reduced motion', async ({
        page,
        testUser,
        isMobile,
    }) => {
        test.skip(!isMobile, 'The bottom nav only exists below the lg breakpoint');
        await loginAs(page, testUser);
        const spacesLink = page
            .locator('nav.translucent-bar')
            .getByRole('link', { name: 'Spaces' });

        await spacesLink.hover();
        await page.mouse.down();
        await expect(spacesLink).toHaveCSS('transform', /^matrix\(0\.97/);
        await expect(spacesLink).toHaveCSS('opacity', '0.8');

        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect(spacesLink).toHaveCSS('transform', 'none');
        await expect(spacesLink).toHaveCSS('opacity', '0.8');

        // Release away from the link so the press is cancelled instead of navigating.
        await page.mouse.move(0, 0);
        await page.mouse.up();
    });

    test('small text is opened up slightly, large text tightened, and body text left alone', async ({
        page,
    }) => {
        await page.goto('/login');
        await page.evaluate(() => {
            for (const sizeClass of ['text-xs', 'text-base', 'text-lg', 'text-xl']) {
                const sampleText = document.createElement('p');
                sampleText.id = `sample-${sizeClass}`;
                sampleText.className = sizeClass;
                sampleText.textContent = 'Sample';
                document.body.appendChild(sampleText);
            }
        });

        await expect(page.locator('#sample-text-xs')).toHaveCSS('letter-spacing', '0.12px');
        await expect(page.locator('#sample-text-base')).toHaveCSS('letter-spacing', 'normal');
        await expect(page.locator('#sample-text-lg')).toHaveCSS('letter-spacing', '-0.09px');
        await expect(page.locator('#sample-text-xl')).toHaveCSS('letter-spacing', '-0.2px');
    });

    test('reduced motion turns slide-in movement into a plain fade', async ({ page }) => {
        await page.goto('/login');
        await page.evaluate(() => {
            const slidingBox = document.createElement('div');
            slidingBox.id = 'sliding-box';
            slidingBox.className = 'animate-in slide-in-from-bottom';
            document.body.appendChild(slidingBox);
        });
        const slidingBox = page.locator('#sliding-box');

        await expect(slidingBox).toHaveCSS('--tw-enter-translate-y', '100%');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect(slidingBox).toHaveCSS('--tw-enter-translate-y', '0');
        await expect(slidingBox).toHaveCSS('--tw-enter-opacity', '0');
    });
});
