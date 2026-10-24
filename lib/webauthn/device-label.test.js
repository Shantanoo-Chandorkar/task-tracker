import { describe, expect, it } from 'vitest';
import { deriveDeviceLabel } from './device-label';

describe('deriveDeviceLabel', () => {
    it.each([
        [
            'Chrome on Windows',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ],
        [
            'Safari on Mac',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        ],
        [
            'Safari on iPhone',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        ],
        [
            'Safari on iPad',
            'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        ],
        [
            'Chrome on Android',
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        ],
        [
            'Edge on Windows',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        ],
        [
            'Firefox on Linux',
            'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
        ],
        [
            'Chrome on iPhone',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/605.1.15',
        ],
        [
            'Firefox on iPhone',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15',
        ],
        [
            'Opera on Windows',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
        ],
    ])('labels it "%s"', (expectedLabel, userAgentString) => {
        expect(deriveDeviceLabel(userAgentString)).toBe(expectedLabel);
    });

    it('falls back to "Unknown device" for an unrecognized user agent', () => {
        expect(deriveDeviceLabel('SomeBot/1.0')).toBe('Unknown device');
    });

    it('falls back to "Unknown device" when the header is missing', () => {
        expect(deriveDeviceLabel(null)).toBe('Unknown device');
        expect(deriveDeviceLabel(undefined)).toBe('Unknown device');
        expect(deriveDeviceLabel('')).toBe('Unknown device');
    });
});
