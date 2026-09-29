// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
    checkWebhookUrl,
    createGuardedLookup,
    isBlockedIp,
    resolvePublicAddresses,
} from './webhook-url-guard';

describe('isBlockedIp', () => {
    it.each([
        '127.0.0.1',
        '10.1.2.3',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.1.1',
        '169.254.169.254',
        '100.64.0.1',
        '0.0.0.0',
        '224.0.0.1',
        '255.255.255.255',
        '::1',
        '::',
        'fe80::1',
        'fd12:3456::1',
        'ff02::1',
        '::ffff:127.0.0.1',
        '::ffff:169.254.169.254',
        '::ffff:a00:1',
        '64:ff9b::7f00:1',
        '2002:7f00:1::',
        'not-an-ip',
    ])('blocks %s', (ipAddress) => {
        expect(isBlockedIp(ipAddress)).toBe(true);
    });

    it.each([
        '8.8.8.8',
        '1.1.1.1',
        '172.15.255.255',
        '172.32.0.1',
        '93.184.216.34',
        '2606:4700:4700::1111',
    ])('allows public address %s', (ipAddress) => {
        expect(isBlockedIp(ipAddress)).toBe(false);
    });
});

describe('checkWebhookUrl', () => {
    it('accepts a plain https URL with a path and query', () => {
        const urlCheck = checkWebhookUrl('https://hooks.example.com/catch/123?token=abc');
        expect(urlCheck.isValid).toBe(true);
        expect(urlCheck.url.hostname).toBe('hooks.example.com');
    });

    it('accepts an explicit default port', () => {
        expect(checkWebhookUrl('https://hooks.example.com:443/x').isValid).toBe(true);
    });

    it.each([
        ['http://hooks.example.com/x', 'WEBHOOK_URL_NOT_HTTPS'],
        ['ftp://hooks.example.com/x', 'WEBHOOK_URL_NOT_HTTPS'],
        ['javascript:alert(1)', 'WEBHOOK_URL_NOT_HTTPS'],
        ['not a url', 'WEBHOOK_URL_INVALID'],
        ['', 'WEBHOOK_URL_INVALID'],
        ['https://user:pass@hooks.example.com/x', 'WEBHOOK_URL_INVALID'],
        ['https://hooks.example.com:8443/x', 'WEBHOOK_URL_INVALID'],
        ['https://hooks.example.com/x#frag', 'WEBHOOK_URL_INVALID'],
        [`https://hooks.example.com/${'a'.repeat(2100)}`, 'WEBHOOK_URL_INVALID'],
        ['https://localhost/x', 'WEBHOOK_URL_BLOCKED'],
        ['https://api.localhost/x', 'WEBHOOK_URL_BLOCKED'],
        ['https://intranet/x', 'WEBHOOK_URL_BLOCKED'],
        ['https://printer.local/x', 'WEBHOOK_URL_BLOCKED'],
        ['https://db.internal/x', 'WEBHOOK_URL_BLOCKED'],
        ['https://127.0.0.1/x', 'WEBHOOK_URL_BLOCKED'],
        ['https://2130706433/x', 'WEBHOOK_URL_BLOCKED'],
        ['https://0x7f.0.0.1/x', 'WEBHOOK_URL_BLOCKED'],
        ['https://[::1]/x', 'WEBHOOK_URL_BLOCKED'],
        ['https://8.8.8.8/x', 'WEBHOOK_URL_BLOCKED'],
    ])('rejects %s with %s', (urlText, expectedCode) => {
        expect(checkWebhookUrl(urlText)).toEqual({ isValid: false, code: expectedCode });
    });

    it('rejects a non-string value', () => {
        expect(checkWebhookUrl(undefined)).toEqual({ isValid: false, code: 'WEBHOOK_URL_INVALID' });
    });
});

describe('resolvePublicAddresses', () => {
    it('returns every address when all are public', async () => {
        const dnsLookup = vi.fn().mockResolvedValue([
            { address: '93.184.216.34', family: 4 },
            { address: '2606:4700:4700::1111', family: 6 },
        ]);
        const resolution = await resolvePublicAddresses('hooks.example.com', dnsLookup);
        expect(resolution.isPublic).toBe(true);
        expect(resolution.addresses).toHaveLength(2);
    });

    it('blocks the host when any one answer is internal (mixed DNS answer)', async () => {
        const dnsLookup = vi.fn().mockResolvedValue([
            { address: '93.184.216.34', family: 4 },
            { address: '169.254.169.254', family: 4 },
        ]);
        expect(await resolvePublicAddresses('rebind.example.com', dnsLookup)).toEqual({
            isPublic: false,
            code: 'WEBHOOK_URL_BLOCKED',
        });
    });

    it('blocks a name that resolves to loopback', async () => {
        const dnsLookup = vi.fn().mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
        expect((await resolvePublicAddresses('evil.example.com', dnsLookup)).isPublic).toBe(false);
    });

    it('reports a DNS failure or an empty answer with its own code', async () => {
        const failing = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
        const empty = vi.fn().mockResolvedValue([]);
        expect(await resolvePublicAddresses('gone.example.com', failing)).toEqual({
            isPublic: false,
            code: 'WEBHOOK_DNS_FAILED',
        });
        expect(await resolvePublicAddresses('gone.example.com', empty)).toEqual({
            isPublic: false,
            code: 'WEBHOOK_DNS_FAILED',
        });
    });
});

describe('createGuardedLookup', () => {
    const callLookup = (guardedLookup, lookupOptions) =>
        new Promise((resolve) => {
            guardedLookup('hooks.example.com', lookupOptions, (...callbackArguments) =>
                resolve(callbackArguments),
            );
        });

    it('hands back all addresses when Node asks for all', async () => {
        const addresses = [{ address: '93.184.216.34', family: 4 }];
        const guardedLookup = createGuardedLookup(vi.fn().mockResolvedValue(addresses));
        expect(await callLookup(guardedLookup, { all: true })).toEqual([null, addresses]);
    });

    it('hands back a single address and family otherwise', async () => {
        const guardedLookup = createGuardedLookup(
            vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
        );
        expect(await callLookup(guardedLookup, {})).toEqual([null, '93.184.216.34', 4]);
    });

    it('fails the connection with the stable code when the answer is internal (DNS rebinding)', async () => {
        const guardedLookup = createGuardedLookup(
            vi.fn().mockResolvedValue([{ address: '10.0.0.5', family: 4 }]),
        );
        const [connectionError] = await callLookup(guardedLookup, { all: true });
        expect(connectionError.code).toBe('WEBHOOK_URL_BLOCKED');
    });
});
