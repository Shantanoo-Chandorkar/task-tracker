// Order matters - e.g. Edge's UA also contains "Chrome/" and "Safari/", so Edge must come first.
const BROWSER_PATTERNS = [
    { name: 'Edge', pattern: /Edg\// },
    { name: 'Opera', pattern: /OPR\// },
    { name: 'Chrome', pattern: /CriOS\// },
    { name: 'Firefox', pattern: /FxiOS\// },
    { name: 'Chrome', pattern: /Chrome\// },
    { name: 'Firefox', pattern: /Firefox\// },
    { name: 'Safari', pattern: /Safari\// },
];

const OS_PATTERNS = [
    { name: 'iPhone', pattern: /iPhone/ },
    { name: 'iPad', pattern: /iPad/ },
    { name: 'Android', pattern: /Android/ },
    { name: 'Mac', pattern: /Macintosh|Mac OS X/ },
    { name: 'Windows', pattern: /Windows/ },
    { name: 'Linux', pattern: /Linux/ },
];

/**
 * Builds a short, human-friendly default device label from a browser's User-Agent string.
 * Only ever returns one of a fixed set of safe labels - never echoes any part of the raw
 * string back - so this never needs separate sanitization before being stored.
 *
 * @param {string|null|undefined} userAgentString - The request's User-Agent header.
 * @returns {string} A label like "Chrome on Windows", or "Unknown device" if nothing matched.
 */
export function deriveDeviceLabel(userAgentString) {
    if (!userAgentString) return 'Unknown device';

    const browser = BROWSER_PATTERNS.find(({ pattern }) => pattern.test(userAgentString))?.name;
    const os = OS_PATTERNS.find(({ pattern }) => pattern.test(userAgentString))?.name;

    if (browser && os) return `${browser} on ${os}`;
    return browser ?? os ?? 'Unknown device';
}
