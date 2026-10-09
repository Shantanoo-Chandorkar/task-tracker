import { toast } from 'sonner';

/**
 * Copies text to the clipboard and tells the user whether it worked.
 *
 * @param {string} text - Text to copy
 * @param {string} label - What was copied, used in the toast, e.g. "Space ID"
 * @returns {Promise<void>} Resolves after the toast is shown; a refused copy shows an error toast, it never throws
 */
export async function copyToClipboard(text, label) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${label} copied`);
    } catch {
        toast.error(`Could not copy ${label.toLowerCase()}`);
    }
}
