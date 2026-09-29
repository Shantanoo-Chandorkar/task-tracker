import dns from 'node:dns';
import { BlockList, isIP } from 'node:net';
import {
    WEBHOOK_DNS_FAILED,
    WEBHOOK_URL_BLOCKED,
    WEBHOOK_URL_INVALID,
    WEBHOOK_URL_NOT_HTTPS,
} from '@/lib/error-codes';

const MAX_URL_LENGTH = 2048;
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

// Every range that is not a routable public address; IPv4-mapped IPv6 is matched against the IPv4 rules by BlockList
const NON_PUBLIC_RANGES = [
    ['0.0.0.0', 8, 'ipv4'],
    ['10.0.0.0', 8, 'ipv4'],
    ['100.64.0.0', 10, 'ipv4'],
    ['127.0.0.0', 8, 'ipv4'],
    ['169.254.0.0', 16, 'ipv4'],
    ['172.16.0.0', 12, 'ipv4'],
    ['192.0.0.0', 24, 'ipv4'],
    ['192.0.2.0', 24, 'ipv4'],
    ['192.88.99.0', 24, 'ipv4'],
    ['192.168.0.0', 16, 'ipv4'],
    ['198.18.0.0', 15, 'ipv4'],
    ['198.51.100.0', 24, 'ipv4'],
    ['203.0.113.0', 24, 'ipv4'],
    ['224.0.0.0', 4, 'ipv4'],
    ['240.0.0.0', 4, 'ipv4'],
    ['::', 128, 'ipv6'],
    ['::1', 128, 'ipv6'],
    ['64:ff9b::', 96, 'ipv6'],
    ['100::', 64, 'ipv6'],
    ['2001:db8::', 32, 'ipv6'],
    ['2002::', 16, 'ipv6'],
    ['fc00::', 7, 'ipv6'],
    ['fe80::', 10, 'ipv6'],
    ['ff00::', 8, 'ipv6'],
];

const nonPublicAddresses = new BlockList();
for (const [network, prefixLength, family] of NON_PUBLIC_RANGES)
    nonPublicAddresses.addSubnet(network, prefixLength, family);

/**
 * Says whether an IP address is loopback, private, link-local, metadata, multicast or otherwise not public.
 *
 * @param {string} ipAddress - IPv4 or IPv6 literal.
 * @returns {boolean} True when the address must never be contacted. Unparseable input is treated as blocked.
 */
export function isBlockedIp(ipAddress) {
    const ipFamily = isIP(ipAddress);
    if (ipFamily === 0) return true;
    return nonPublicAddresses.check(ipAddress, ipFamily === 4 ? 'ipv4' : 'ipv6');
}

/**
 * Validates a webhook URL without touching the network: https only, default port, no credentials, no IP literal,
 * no obviously internal host name. DNS is checked separately at connect time by `guardedLookup`.
 *
 * @param {string} urlText - URL typed by the space owner.
 * @returns {{ isValid: true, url: URL } | { isValid: false, code: string }} The parsed URL, or a stable error code.
 */
export function checkWebhookUrl(urlText) {
    if (typeof urlText !== 'string' || urlText.length === 0 || urlText.length > MAX_URL_LENGTH)
        return { isValid: false, code: WEBHOOK_URL_INVALID };

    let url;
    try {
        url = new URL(urlText);
    } catch {
        return { isValid: false, code: WEBHOOK_URL_INVALID };
    }

    if (url.protocol !== 'https:') return { isValid: false, code: WEBHOOK_URL_NOT_HTTPS };
    if (url.username || url.password || url.port || url.hash)
        return { isValid: false, code: WEBHOOK_URL_INVALID };

    // URL.hostname keeps the brackets on IPv6 literals; any IP literal is refused because receivers should use a name
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const isInternalName =
        hostname === 'localhost' ||
        !hostname.includes('.') ||
        BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
    if (isInternalName || isIP(hostname.replace(/^\[|\]$/g, '')) !== 0)
        return { isValid: false, code: WEBHOOK_URL_BLOCKED };

    return { isValid: true, url };
}

/**
 * Resolves a host name and requires EVERY returned address to be public, so a mixed DNS answer cannot smuggle in
 * an internal one.
 *
 * @param {string} hostname - Host name from an already validated webhook URL.
 * @param {typeof dns.promises.lookup} [dnsLookup] - DNS lookup function, replaceable in tests.
 * @returns {Promise<object>} `{ isPublic: true, addresses }` or `{ isPublic: false, code }` with a stable error code.
 */
export async function resolvePublicAddresses(hostname, dnsLookup = dns.promises.lookup) {
    let addresses;
    try {
        addresses = await dnsLookup(hostname, { all: true, verbatim: true });
    } catch {
        return { isPublic: false, code: WEBHOOK_DNS_FAILED };
    }
    if (addresses.length === 0) return { isPublic: false, code: WEBHOOK_DNS_FAILED };
    if (addresses.some(({ address }) => isBlockedIp(address)))
        return { isPublic: false, code: WEBHOOK_URL_BLOCKED };
    return { isPublic: true, addresses };
}

/**
 * Builds a `dns.lookup`-compatible function for `https.request({ lookup })`. Validating inside the connection's own
 * lookup means the address that was checked is the address that is dialled, which closes the DNS rebinding gap.
 *
 * @param {typeof dns.promises.lookup} [dnsLookup] - DNS lookup function, replaceable in tests.
 * @returns {(hostname: string, lookupOptions: object, lookupCallback: Function) => void} Node-style lookup function.
 */
export function createGuardedLookup(dnsLookup = dns.promises.lookup) {
    return (hostname, lookupOptions, lookupCallback) => {
        resolvePublicAddresses(hostname, dnsLookup).then((resolution) => {
            if (!resolution.isPublic) {
                const blockedError = new Error(resolution.code);
                blockedError.code = resolution.code;
                lookupCallback(blockedError);
                return;
            }
            if (lookupOptions?.all) {
                lookupCallback(null, resolution.addresses);
                return;
            }
            const [firstAddress] = resolution.addresses;
            lookupCallback(null, firstAddress.address, firstAddress.family);
        });
    };
}
