import { sanitizeString, checkMaxLength } from '@/lib/validation';
import { LABEL_COLOR_INVALID } from '@/lib/error-codes';
import { LABEL_NAME_MAX } from './label-limits';

// What an <input type="color"> sends; anything else would reach a style attribute unchecked
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Cleans and checks the name of a space label (a status or a tag).
 *
 * @param {unknown} rawName - Name sent by the client
 * @param {string} noun - Capitalised kind of label for the messages, e.g. 'Status' or 'Tag'
 * @returns {{ name: string, failure: null }|{ name: null, failure: { error: string } }} The trimmed, tag-free name,
 *   or the message to return to the caller
 */
export function checkLabelName(rawName, noun) {
    const name = sanitizeString(rawName, true);
    if (!name) return { name: null, failure: { error: `${noun} name is required` } };

    const lengthFailure = checkMaxLength(name, LABEL_NAME_MAX, `${noun} name`);
    if (lengthFailure) return { name: null, failure: { error: lengthFailure.error } };

    return { name, failure: null };
}

/**
 * Checks that a colour sent by the client is a `#rrggbb` value.
 *
 * @param {unknown} color - Colour sent by the client
 * @returns {{ error: string, code: string }|null} The refusal to return to the caller, or null when it is valid
 */
export function checkLabelColor(color) {
    if (typeof color === 'string' && HEX_COLOR_PATTERN.test(color)) return null;
    return { error: 'Color must be a hex value like #6b7280', code: LABEL_COLOR_INVALID };
}
