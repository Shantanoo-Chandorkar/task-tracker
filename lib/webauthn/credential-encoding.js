/**
 * Encodes raw credential bytes as a Postgres bytea literal - the exact textual form
 * PostgREST expects on insert and returns on select (bytea_output = hex, Postgres's default).
 *
 * @param {Uint8Array} bytes - Raw public-key bytes from @simplewebauthn/server.
 * @returns {string} A "\x"-prefixed hex string ready for a bytea column.
 */
export function encodeBytesForBytea(bytes) {
    return `\\x${Buffer.from(bytes).toString('hex')}`;
}

/**
 * Decodes a Postgres bytea column's value back into raw bytes.
 *
 * @param {string} byteaValue - The "\x"-prefixed hex string PostgREST returned.
 * @returns {Uint8Array} The original raw bytes.
 */
export function decodeBytesFromBytea(byteaValue) {
    return new Uint8Array(Buffer.from(byteaValue.slice(2), 'hex'));
}
