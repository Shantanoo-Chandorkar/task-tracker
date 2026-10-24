import { describe, expect, it } from 'vitest';
import { encodeBytesForBytea, decodeBytesFromBytea } from './credential-encoding';

describe('encodeBytesForBytea / decodeBytesFromBytea', () => {
    it('round-trips arbitrary bytes through encode and decode', () => {
        const originalBytes = new Uint8Array([0, 1, 2, 253, 254, 255, 16, 128]);
        const decoded = decodeBytesFromBytea(encodeBytesForBytea(originalBytes));
        expect(Array.from(decoded)).toEqual(Array.from(originalBytes));
    });

    it('encodes as a "\\x"-prefixed lowercase hex string', () => {
        expect(encodeBytesForBytea(new Uint8Array([0xab, 0xcd]))).toBe('\\xabcd');
    });

    it('round-trips an empty byte array', () => {
        const decoded = decodeBytesFromBytea(encodeBytesForBytea(new Uint8Array([])));
        expect(decoded.length).toBe(0);
    });
});
