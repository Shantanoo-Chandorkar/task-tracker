'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

const STANDALONE_QUERY = '(display-mode: standalone)';

function getStandaloneSnapshot() {
    return window.matchMedia(STANDALONE_QUERY).matches || window.navigator.standalone === true;
}

function getServerStandaloneSnapshot() {
    return false;
}

function subscribeToStandaloneChange(callback) {
    const mediaQueryList = window.matchMedia(STANDALONE_QUERY);
    mediaQueryList.addEventListener('change', callback);
    return () => mediaQueryList.removeEventListener('change', callback);
}

/**
 * Captures the browser's `beforeinstallprompt` event so it can be replayed
 * later from a button click, and tracks whether the app is already
 * installed. The event only fires once and only when the browser's own
 * install criteria are met — this doesn't request installability, it just
 * exposes the browser's own signal.
 *
 * @returns {{ canPrompt: boolean, isInstalled: boolean, promptInstall: () => Promise<string|null> }}
 */
export function useInstallPrompt() {
    const [installPromptEvent, setInstallPromptEvent] = useState(null);
    // Just-installed is a one-off event (fires once, in this tab, mid-session) — matchMedia
    // won't retroactively flip for a tab that isn't itself running standalone yet.
    const [justInstalled, setJustInstalled] = useState(false);
    const isStandalone = useSyncExternalStore(
        subscribeToStandaloneChange,
        getStandaloneSnapshot,
        getServerStandaloneSnapshot,
    );

    useEffect(() => {
        function handleBeforeInstallPrompt(event) {
            event.preventDefault();
            setInstallPromptEvent(event);
        }
        function handleAppInstalled() {
            setJustInstalled(true);
            setInstallPromptEvent(null);
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    async function promptInstall() {
        if (!installPromptEvent) return null;
        installPromptEvent.prompt();
        const { outcome } = await installPromptEvent.userChoice;
        // The captured event is single-use regardless of outcome.
        setInstallPromptEvent(null);
        if (outcome === 'accepted') setJustInstalled(true);
        return outcome;
    }

    return {
        canPrompt: !!installPromptEvent,
        isInstalled: isStandalone || justInstalled,
        promptInstall,
    };
}

export default useInstallPrompt;
