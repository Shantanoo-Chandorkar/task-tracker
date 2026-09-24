const MAILPIT_API_URL = process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:2526';

/**
 * Polls Mailpit's REST API until a message to `toEmail` arrives, then returns its full body.
 *
 * Throws instead of returning null, so "not yet" and "never" can't be confused.
 *
 * @param {string} toEmail - Recipient address to search for.
 * @param {object} [options]
 * @param {number} [options.timeoutMs] - How long to keep polling before giving up.
 * @param {number} [options.pollIntervalMs] - Delay between polls.
 * @returns {Promise<{Subject: string, Text: string, HTML: string}>} The most recent matching message.
 */
export async function waitForEmailTo(toEmail, { timeoutMs = 20_000, pollIntervalMs = 500 } = {}) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const searchResponse = await fetch(
            `${MAILPIT_API_URL}/api/v1/search?query=${encodeURIComponent(`to:${toEmail}`)}`,
        );
        const { messages } = await searchResponse.json();

        if (messages?.length > 0) {
            const messageResponse = await fetch(
                `${MAILPIT_API_URL}/api/v1/message/${messages[0].ID}`,
            );
            return messageResponse.json();
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`No email arrived for ${toEmail} within ${timeoutMs}ms`);
}

/**
 * Deletes every message currently in Mailpit's inbox, so tests don't see leftovers from a
 * previous run or a parallel test.
 *
 * @returns {Promise<void>}
 */
export async function clearInbox() {
    await fetch(`${MAILPIT_API_URL}/api/v1/messages`, { method: 'DELETE' });
}
