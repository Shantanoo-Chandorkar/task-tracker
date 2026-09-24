'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { startGuestSession } from '@/actions/guest-actions';
import { clearAllCaches } from '@/lib/cache';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const TURNSTILE_SCRIPT_URL =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let turnstileScriptPromise = null;

/**
 * Loads Cloudflare's Turnstile script once and resolves when `window.turnstile` is ready.
 *
 * @returns {Promise<void>} Rejects when the script cannot load.
 */
function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();
    if (!turnstileScriptPromise) {
        turnstileScriptPromise = new Promise((resolve, reject) => {
            const scriptElement = document.createElement('script');
            scriptElement.src = TURNSTILE_SCRIPT_URL;
            scriptElement.async = true;
            scriptElement.onload = () => resolve();
            scriptElement.onerror = () => {
                turnstileScriptPromise = null;
                reject(new Error('Turnstile script failed to load'));
            };
            document.head.appendChild(scriptElement);
        });
    }
    return turnstileScriptPromise;
}

/**
 * "Try as guest" button with its Turnstile security check, shown on the login page.
 * Starts a 30-minute guest session and lands the user on Home.
 *
 * @returns {JSX.Element}
 */
export default function GuestEntryButton() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const captchaContainerRef = useRef(null);
    const captchaWidgetIdRef = useRef(null);
    const [captchaToken, setCaptchaToken] = useState(null);
    const [isStarting, setIsStarting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!TURNSTILE_SITE_KEY) return undefined;

        let isCancelled = false;
        loadTurnstileScript()
            .then(() => {
                if (isCancelled || !captchaContainerRef.current) return;
                captchaWidgetIdRef.current = window.turnstile.render(captchaContainerRef.current, {
                    sitekey: TURNSTILE_SITE_KEY,
                    callback: (token) => setCaptchaToken(token),
                    'expired-callback': () => setCaptchaToken(null),
                    'error-callback': () => setCaptchaToken(null),
                });
            })
            .catch(() =>
                setErrorMessage(
                    'Could not load the security check. Refresh the page and try again.',
                ),
            );

        return () => {
            isCancelled = true;
            if (captchaWidgetIdRef.current !== null)
                window.turnstile?.remove(captchaWidgetIdRef.current);
            captchaWidgetIdRef.current = null;
        };
    }, []);

    /**
     * Asks for a fresh security check, because Turnstile tokens work only once.
     */
    function resetCaptcha() {
        setCaptchaToken(null);
        if (captchaWidgetIdRef.current !== null)
            window.turnstile?.reset(captchaWidgetIdRef.current);
    }

    /**
     * Starts the guest session and, on success, opens Home with no leftover cache from another session.
     */
    async function handleStartGuestSession() {
        setIsStarting(true);
        setErrorMessage('');

        let startResult;
        try {
            startResult = await startGuestSession(captchaToken);
        } catch {
            // A server action rejects on a transport failure; without this catch the button would stay stuck
            setIsStarting(false);
            setErrorMessage('Could not reach the server. Check your connection and try again.');
            resetCaptcha();
            return;
        }

        if (startResult.error) {
            setIsStarting(false);
            setErrorMessage(startResult.error);
            resetCaptcha();
            return;
        }

        await clearAllCaches(queryClient);
        router.push('/');
        router.refresh();
    }

    const isWaitingForCaptcha = Boolean(TURNSTILE_SITE_KEY) && !captchaToken;

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                Just looking around? Try a 30-minute guest session with sample data. Guest data is
                temporary and not private, so do not enter anything sensitive.
            </p>

            {TURNSTILE_SITE_KEY && <div ref={captchaContainerRef} />}

            {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}

            <Button
                type="button"
                variant="outline"
                className="w-full gap-1.5"
                onClick={handleStartGuestSession}
                disabled={isStarting || isWaitingForCaptcha}
            >
                {isStarting && <Loader size="xs" />}
                {isStarting ? 'Starting guest session...' : 'Try as guest'}
            </Button>
        </div>
    );
}
