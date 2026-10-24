'use client';

import { useQuery } from '@tanstack/react-query';
import { listPasskeysAction } from '@/actions/webauthn-actions';

/**
 * The caller's own registered passkeys.
 *
 * @param {object} [extraQueryOptions] - Extra react-query options (e.g. `enabled`) merged in.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>} Passkey rows, never the raw credential bytes.
 */
export function usePasskeysQuery(extraQueryOptions = {}) {
    return useQuery({
        queryKey: ['webauthn-passkeys'],
        queryFn: async () => {
            const passkeysResult = await listPasskeysAction();
            if (passkeysResult.error) throw new Error(passkeysResult.error);
            return passkeysResult.data;
        },
        retry: 1,
        ...extraQueryOptions,
    });
}
