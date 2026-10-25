'use client';

import { useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { toast } from 'sonner';
import { usePasskeysQuery } from '@/hooks/usePasskeysQuery';
import { useCurrentUserProfileQuery } from '@/hooks/useCurrentUserProfileQuery';
import { runExclusively } from '@/lib/in-flight-entities';
import {
    getPasskeyRegistrationOptionsAction,
    verifyPasskeyRegistrationAction,
    reportPasskeyRegistrationFailureAction,
} from '@/actions/webauthn-actions';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/custom/Loader';
import PasskeyRow from '@/components/settings/PasskeyRow';

const PASSKEYS_QUERY_KEY = ['webauthn-passkeys'];
const REGISTER_ENTITY_KEY = 'webauthn-register';

function subscribeToWebauthnSupport() {
    return () => {};
}

// Server has no PublicKeyCredential global; useSyncExternalStore corrects this right after hydration.
function getWebauthnSupportServerSnapshot() {
    return false;
}

/**
 * Runs one passkey registration ceremony: options, the OS prompt, then verification.
 *
 * @param {import('@tanstack/react-query').QueryClient} queryClient - Client holding the passkey list cache.
 * @returns {Promise<void>}
 */
async function registerNewPasskey(queryClient) {
    const TRANSPORT_FAILURE_MESSAGE =
        'Could not reach the server. Check your connection and try again.';

    let optionsResult;
    try {
        optionsResult = await getPasskeyRegistrationOptionsAction();
    } catch {
        toast.error(TRANSPORT_FAILURE_MESSAGE);
        return;
    }
    if (optionsResult.error) {
        toast.error(optionsResult.error);
        return;
    }

    let attestationResponse;
    try {
        attestationResponse = await startRegistration({ optionsJSON: optionsResult.data });
    } catch (thrown) {
        if (thrown?.name === 'NotAllowedError') return;
        // Fire-and-forget: the real error is for the Vercel log only, never shown to the user.
        reportPasskeyRegistrationFailureAction({
            errorName: thrown?.name,
            errorMessage: thrown?.message,
        }).catch(() => {});
        toast.error('Could not set up your passkey. Please try again.');
        return;
    }

    let verifyResult;
    try {
        verifyResult = await verifyPasskeyRegistrationAction({ attestationResponse });
    } catch {
        toast.error(TRANSPORT_FAILURE_MESSAGE);
        return;
    }
    if (verifyResult.error) {
        toast.error(verifyResult.error);
        return;
    }

    toast.success('Passkey added');
    queryClient.invalidateQueries({ queryKey: PASSKEYS_QUERY_KEY });
}

/**
 * Settings-page passkey management: lists the caller's own passkeys and lets them add or remove one.
 *
 * Registration needs no confirm dialog - the OS biometric prompt already is one.
 * A guest never sees the list/register controls at all, not just a server-side refusal.
 *
 * @param {object} props
 * @param {object|null} [props.initialProfile] - SSR-fetched profile, so a guest never sees a flash of controls.
 */
export default function PasskeySettingsSection({ initialProfile }) {
    const queryClient = useQueryClient();
    const isSupported = useSyncExternalStore(
        subscribeToWebauthnSupport,
        browserSupportsWebAuthn,
        getWebauthnSupportServerSnapshot,
    );
    const [isRegistering, setIsRegistering] = useState(false);
    const { data: profile } = useCurrentUserProfileQuery({ initialData: initialProfile });
    const isGuest = profile?.is_guest === true;
    const {
        data: passkeys = [],
        isLoading,
        isError,
        refetch,
    } = usePasskeysQuery({ enabled: !isGuest });

    async function handleRegister() {
        await runExclusively(REGISTER_ENTITY_KEY, async () => {
            setIsRegistering(true);
            try {
                await registerNewPasskey(queryClient);
            } finally {
                setIsRegistering(false);
            }
        });
    }

    if (isGuest) {
        return (
            <div className="max-w-lg space-y-4">
                <div>
                    <h2 className="text-base font-semibold mb-1">Passkeys</h2>
                    <p className="text-sm text-muted-foreground">
                        This app supports passkeys as well. Sign up for a full account to set one
                        up.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-lg space-y-4">
            <div>
                <h2 className="text-base font-semibold mb-1">Passkeys</h2>
                <p className="text-sm text-muted-foreground">
                    Use your device&apos;s fingerprint, face, or PIN to log in instead of typing
                    your password.
                </p>
            </div>

            {!isSupported && (
                <p className="text-sm text-muted-foreground">
                    This browser doesn&apos;t support passkeys yet. Your password still works
                    everywhere.
                </p>
            )}

            {isLoading && (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-card py-6 text-sm text-muted-foreground">
                    <Loader size="sm" />
                    Loading passkeys...
                </div>
            )}

            {isError && (
                <div className="space-y-2 rounded-xl bg-card py-4 text-center">
                    <p className="text-sm text-destructive">Could not load your passkeys.</p>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => refetch()}
                        className="h-10"
                    >
                        Try again
                    </Button>
                </div>
            )}

            {!isLoading &&
                !isError &&
                passkeys.map((passkey) => <PasskeyRow key={passkey.id} passkey={passkey} />)}

            {!isLoading && !isError && passkeys.length === 0 && (
                <p className="text-sm text-muted-foreground">No passkeys yet.</p>
            )}

            {isSupported && (
                <Button
                    type="button"
                    onClick={handleRegister}
                    disabled={isRegistering || isLoading}
                    className="h-10 w-full gap-1.5"
                >
                    {isRegistering && <Loader size="xs" />}
                    Enable passkey on this device
                </Button>
            )}
        </div>
    );
}
