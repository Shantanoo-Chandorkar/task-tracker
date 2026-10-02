/**
 * Hides most of an email address so a message can hint at which account to use without revealing it.
 *
 * @param {unknown} emailAddress - The address to mask.
 * @returns {string} First letter + `***` + the domain, or `***` when the value is not an email.
 */
export function maskEmail(emailAddress) {
    if (typeof emailAddress !== 'string') return '***';
    const atIndex = emailAddress.lastIndexOf('@');
    if (atIndex < 1) return '***';

    const localPart = emailAddress.slice(0, atIndex);
    const domain = emailAddress.slice(atIndex);
    // A one-letter local part would be fully revealed by keeping its first letter
    return localPart.length === 1 ? `*${domain}` : `${localPart[0]}***${domain}`;
}
