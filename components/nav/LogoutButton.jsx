'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/actions/auth-actions';
import { clearAllCaches } from '@/lib/cache';

/**
 * Signs the current user out, clearing client-side caches first so the next login doesn't
 * briefly show this session's stale cached shell.
 *
 * @param {object} props
 * @param {Function} [props.onNavigate] - Called after sign-out (used to close the mobile drawer)
 */
export default function LogoutButton({ onNavigate }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [isPending, setIsPending] = useState(false);

    async function handleLogout() {
        setIsPending(true);
        const toastId = toast.loading('Logging out...');

        let signOutResult;
        try {
            signOutResult = await signOutAction();
        } catch {
            // Server Actions reject on a transport failure (offline, server down) — without
            // this catch, pending would stay true forever with no feedback to the client.
            setIsPending(false);
            toast.error('Could not reach the server. Check your connection and try again.', {
                id: toastId,
            });
            return;
        }
        setIsPending(false);

        if (signOutResult.error) {
            toast.error(signOutResult.error, { id: toastId });
            return;
        }

        await clearAllCaches(queryClient);
        toast.success('Logged out', { id: toastId });
        onNavigate?.();
        router.push('/login');
        router.refresh();
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            disabled={isPending}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Log out"
        >
            <LogOut className="h-4 w-4" />
        </Button>
    );
}
