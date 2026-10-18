import { sanitizeString, checkMaxLength } from '@/lib/validation';
import {
    TIMER_TEMPLATE_NAME_REQUIRED,
    TIMER_TEMPLATE_NAME_TOO_LONG,
    TIMER_TEMPLATE_BLOCKS_INVALID,
} from '@/modules/timer/errors';
import {
    TIMER_TEMPLATE_NAME_MAX,
    TEMPLATE_BLOCK_KINDS,
    TEMPLATE_BLOCK_LABEL_MAX,
    TEMPLATE_BLOCK_MAX_COUNT,
    TEMPLATE_BLOCK_MIN_DURATION_SECONDS,
    TEMPLATE_BLOCK_MAX_DURATION_SECONDS,
} from '@/modules/timer/timer-limits';

/** @type {Record<string, string>} */
const DEFAULT_LABEL_BY_KIND = { work: 'Work', break: 'Break' };

/**
 * Cleans and checks a timer template's name.
 *
 * @param {unknown} rawName - Name as sent by the client.
 * @returns {{ name: string, error?: undefined, code?: undefined } |
 *   { name?: undefined, error: string, code: string }} The cleaned name, or why it was rejected.
 */
export function checkTemplateName(rawName) {
    const name = sanitizeString(rawName, true);
    if (!name) {
        return { error: 'Template name is required', code: TIMER_TEMPLATE_NAME_REQUIRED };
    }
    const lengthFailure = checkMaxLength(
        name,
        TIMER_TEMPLATE_NAME_MAX,
        'Template name',
        TIMER_TEMPLATE_NAME_TOO_LONG,
    );
    if (lengthFailure) return lengthFailure;
    return { name };
}

const BLOCKS_INVALID_FAILURE = {
    error: `Blocks must be a list of 1-${TEMPLATE_BLOCK_MAX_COUNT} work/break steps, each with a duration between ${
        TEMPLATE_BLOCK_MIN_DURATION_SECONDS / 60
    } and ${TEMPLATE_BLOCK_MAX_DURATION_SECONDS / 60} minutes`,
    code: TIMER_TEMPLATE_BLOCKS_INVALID,
};

/**
 * Validates one raw block and returns its normalized shape, or null when it does not fit the shape at all.
 *
 * @param {unknown} rawBlock - One entry of the client-supplied blocks array.
 * @returns {{ kind: 'work'|'break', label: string, durationSeconds: number }|null} The normalized
 *   block, or null when the entry is invalid.
 */
function normalizeBlock(rawBlock) {
    if (typeof rawBlock !== 'object' || rawBlock === null) return null;
    /** @type {Record<string, any>} */
    const block = rawBlock;
    if (!TEMPLATE_BLOCK_KINDS.includes(block.kind)) return null;

    const durationSeconds = block.durationSeconds;
    if (
        !Number.isInteger(durationSeconds) ||
        durationSeconds < TEMPLATE_BLOCK_MIN_DURATION_SECONDS ||
        durationSeconds > TEMPLATE_BLOCK_MAX_DURATION_SECONDS
    ) {
        return null;
    }

    const sanitizedLabel = sanitizeString(block.label, true);
    if (sanitizedLabel.length > TEMPLATE_BLOCK_LABEL_MAX) return null;

    return {
        kind: block.kind,
        label: sanitizedLabel || DEFAULT_LABEL_BY_KIND[block.kind],
        durationSeconds,
    };
}

/**
 * Validates a timer template's block list - the only thing standing between client JSON and a
 * JSONB column with no shape check of its own. Never trusts the input shape.
 *
 * @param {unknown} rawBlocks - Value sent by the client.
 * @returns {{ blocks: Array<{ kind: 'work'|'break', label: string, durationSeconds: number }>,
 *   error?: undefined, code?: undefined } | { blocks?: undefined, error: string, code: string }}
 *   The normalized blocks, or why they were rejected.
 */
export function checkTemplateBlocks(rawBlocks) {
    if (
        !Array.isArray(rawBlocks) ||
        rawBlocks.length < 1 ||
        rawBlocks.length > TEMPLATE_BLOCK_MAX_COUNT
    ) {
        return BLOCKS_INVALID_FAILURE;
    }

    /** @type {Array<{ kind: 'work'|'break', label: string, durationSeconds: number }>} */
    const normalizedBlocks = [];
    for (const rawBlock of rawBlocks) {
        const normalizedBlock = normalizeBlock(rawBlock);
        if (normalizedBlock === null) return BLOCKS_INVALID_FAILURE;
        normalizedBlocks.push(normalizedBlock);
    }

    return { blocks: normalizedBlocks };
}
