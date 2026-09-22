import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// Shared across every test file in this run, so a crashed run's leftovers stay findable by prefix.
const RUN_ID = randomUUID().slice(0, 8);

/**
 * Secret-key Supabase client, bypassing RLS - for test-user lifecycle and any lookup a real
 * UI flow can't reasonably surface (e.g. reading a row's id back by name).
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function adminClient() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
}

/**
 * Creates a pre-confirmed throwaway Supabase user for a test.
 *
 * Skips the emailed confirmation link via admin `email_confirm: true` (no email interception yet).
 *
 * @param {object} [overrides]
 * @param {string} [overrides.password] - Defaults to a random value.
 * @returns {Promise<{id: string, email: string, password: string}>}
 */
export async function createTestUser(overrides = {}) {
    const email = `e2e-${RUN_ID}-${randomUUID().slice(0, 8)}@example.com`;
    const password = overrides.password ?? `Test-${randomUUID()}`;

    const { data: createdUser, error: createUserError } = await adminClient().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });
    if (createUserError) throw createUserError;

    return { id: createdUser.user.id, email, password };
}

/**
 * Deletes a test user.
 *
 * Spaces cascade-delete via owner_id's ON DELETE CASCADE chain (migration 0007) - nothing else to clean up.
 *
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function deleteTestUser(userId) {
    const { error: deleteUserError } = await adminClient().auth.admin.deleteUser(userId);
    if (deleteUserError && deleteUserError.status !== 404) throw deleteUserError;
}
