import { describe, expect, it } from 'vitest';
import { formatInviteExpiry } from './invite-expiry';

const NOW = Date.parse('2030-01-01T00:00:00.000Z');

describe('formatInviteExpiry', () => {
    it.each([
        ['2030-01-04T00:00:00.000Z', 'Expires in 3 days'],
        ['2030-01-02T00:00:00.000Z', 'Expires in 1 day'],
        ['2030-01-01T00:00:01.000Z', 'Expires in 1 day'],
        ['2030-01-01T00:00:00.000Z', 'Expired'],
        ['2029-12-31T00:00:00.000Z', 'Expired'],
    ])('labels an invite expiring at %s as "%s"', (expiresAt, expectedLabel) => {
        expect(formatInviteExpiry(expiresAt, NOW)).toBe(expectedLabel);
    });
});
