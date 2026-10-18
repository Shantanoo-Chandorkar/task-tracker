import { BlockSequence } from './block-sequence';

/**
 * Picks what to show as a session's title: its own label, else its attached task/habit's title.
 *
 * @param {Record<string, any>} session - A session row, optionally with nested `tasks`/`habits`.
 * @returns {string|null} The label to show, or null when there is nothing to show.
 */
export function resolveSessionDisplayLabel(session) {
    return session.label ?? session.tasks?.title ?? session.habits?.title ?? null;
}

/**
 * Builds the current block's display info for a templated session, or null when there is none.
 *
 * @param {Record<string, any>} session - A session row, with a nested `timer_templates` (name, blocks).
 * @returns {{ block: { kind: string, label: string, durationSeconds: number }, blockIndex: number,
 *   total: number, isLastBlock: boolean }|null} The current block's display info, or null when the
 *   session has no template or its block index is out of range.
 */
export function resolveSessionBlockDisplay(session) {
    const template = session.timer_templates;
    if (!template || session.block_index == null) return null;

    const sequence = new BlockSequence(template.blocks);
    const block = sequence.getBlock(session.block_index);
    if (!block) return null;

    return {
        block,
        blockIndex: session.block_index,
        total: sequence.totalCount(),
        isLastBlock: sequence.isLastBlock(session.block_index),
    };
}
