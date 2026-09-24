const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SITEVERIFY_TIMEOUT_MS = 5000;

/**
 * Asks Cloudflare whether a Turnstile token from the browser is genuine and unused.
 * Fails closed: a missing secret, a network failure, a timeout or any unexpected answer all count as not valid.
 *
 * @param {string} captchaToken - Token the Turnstile widget gave the browser.
 * @param {string} [clientIp] - Caller IP, passed along to Cloudflare when known.
 * @returns {Promise<boolean>} True only when Cloudflare confirms the token.
 */
export async function verifyTurnstileToken(captchaToken, clientIp) {
    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
        console.error('[guest] turnstile secret is not configured');
        return false;
    }

    try {
        const verificationForm = new URLSearchParams({ secret: secretKey, response: captchaToken });
        if (clientIp && clientIp !== 'unknown') verificationForm.set('remoteip', clientIp);

        const cloudflareResponse = await fetch(SITEVERIFY_URL, {
            method: 'POST',
            body: verificationForm,
            signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
        });
        if (!cloudflareResponse.ok) {
            console.error('[guest] turnstile verify http error', {
                status: cloudflareResponse.status,
            });
            return false;
        }

        const verdict = await cloudflareResponse.json();
        return verdict?.success === true;
    } catch (thrown) {
        console.error('[guest] turnstile verify threw', { detail: thrown?.message });
        return false;
    }
}
