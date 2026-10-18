/**
 * The raw block/interval primitive behind a timer template (decision 17) - Pomodoro is a
 * particular `blocks` array, not a subclass. Wraps an already-validated blocks array; callers
 * run `checkTemplateBlocks` first, this class never re-validates.
 */
export class BlockSequence {
    /**
     * @param {Array<{ kind: 'work'|'break', label: string, durationSeconds: number }>} blocks - Validated blocks.
     */
    constructor(blocks) {
        this.blocks = blocks;
    }

    /**
     * Returns one block by its position.
     *
     * @param {number} index - Zero-based block position.
     * @returns {{ kind: 'work'|'break', label: string, durationSeconds: number }|null} The block, or null out of range.
     */
    getBlock(index) {
        return this.blocks[index] ?? null;
    }

    /**
     * @returns {number} The sequence's total block count.
     */
    totalCount() {
        return this.blocks.length;
    }

    /**
     * @param {number} index - Zero-based block position.
     * @returns {boolean} True when this index is the sequence's last block.
     */
    isLastBlock(index) {
        return index === this.blocks.length - 1;
    }

    /**
     * @param {number} index - Current block position.
     * @returns {number|null} The next block's position, or null when there is none.
     */
    nextIndex(index) {
        return this.isLastBlock(index) ? null : index + 1;
    }

    /**
     * Counts completed work blocks for a "Session N of M" style display.
     *
     * @param {number} currentIndex - The block currently in progress.
     * @returns {number} How many `work` blocks come strictly before `currentIndex`.
     */
    completedWorkBlockCount(currentIndex) {
        return this.blocks.slice(0, currentIndex).filter((block) => block.kind === 'work').length;
    }

    /**
     * @returns {number} How many `work` blocks the whole sequence has.
     */
    totalWorkBlockCount() {
        return this.blocks.filter((block) => block.kind === 'work').length;
    }
}
