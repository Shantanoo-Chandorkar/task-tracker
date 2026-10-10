import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { copyToClipboard } from './copy-to-clipboard';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('copyToClipboard', () => {
    let writeText;

    beforeEach(() => {
        vi.clearAllMocks();
        writeText = vi.fn();
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    });

    it('copies the text and confirms with the label', async () => {
        writeText.mockResolvedValue(undefined);

        await copyToClipboard('abc', 'Space ID');

        expect(writeText).toHaveBeenCalledWith('abc');
        expect(toast.success).toHaveBeenCalledWith('Space ID copied');
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('shows a lower-case error toast instead of throwing when the clipboard refuses', async () => {
        writeText.mockRejectedValue(new Error('denied'));

        await copyToClipboard('abc', 'Join link');

        expect(toast.error).toHaveBeenCalledWith('Could not copy join link');
        expect(toast.success).not.toHaveBeenCalled();
    });
});
