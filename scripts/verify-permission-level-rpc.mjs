import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// Verifies get_space_permission_level answers what resolveSpacePermission needs, on throwaway users and data.
// Usage: node --env-file=.env.test scripts/verify-permission-level-rpc.mjs

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const adminClient = createClient(supabaseUrl, process.env.SUPABASE_SECRET_KEY);
const runId = randomUUID().slice(0, 8);
const checkResults = [];
const createdUserIds = [];

/**
 * Runs one check, records its outcome, and never throws past this call.
 *
 * @param {string} label - Human-readable name shown in the report.
 * @param {() => Promise<{ pass: boolean, detail: string }>} runCheck - The check itself.
 */
async function check(label, runCheck) {
    try {
        const { pass, detail } = await runCheck();
        checkResults.push({ label, pass, detail });
    } catch (error) {
        checkResults.push({ label, pass: false, detail: `threw: ${error.message}` });
    }
}

/**
 * Throws with context when a Supabase call returned an error, otherwise returns its rows.
 *
 * @param {string} step - What was being attempted, for the error message.
 * @param {{ data: any, error: object | null }} response - Raw Supabase response.
 * @returns {any} The response data.
 */
function unwrap(step, response) {
    if (response.error) throw new Error(`${step}: ${response.error.message}`);
    return response.data;
}

/**
 * Creates a confirmed throwaway user and returns a client signed in as them.
 *
 * @param {string} roleName - Short label used in the email address.
 * @returns {Promise<{ userId: string, userClient: object, email: string }>} The new user, signed in.
 */
async function createSignedInUser(roleName) {
    const email = `perm-${roleName}-${runId}@example.com`;
    const password = `Test-${randomUUID()}`;
    const { data: createdUser, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(createdUser.user.id);
    const userClient = createClient(supabaseUrl, publishableKey);
    unwrap('sign in', await userClient.auth.signInWithPassword({ email, password }));
    return { userId: createdUser.user.id, userClient, email };
}

try {
    const owner = await createSignedInUser('owner');
    const fullCollaborator = await createSignedInUser('full');
    const restrictedCollaborator = await createSignedInUser('restricted');
    const readOnlyCollaborator = await createSignedInUser('readonly');
    const pendingRequester = await createSignedInUser('pending');
    const stranger = await createSignedInUser('stranger');

    const { id: spaceId } = unwrap(
        'space',
        await adminClient
            .from('spaces')
            .insert({ name: `perm-${runId}`, owner_id: owner.userId })
            .select('id')
            .single(),
    );

    const collaboratorRows = [
        [fullCollaborator, 'full', 'accepted'],
        [restrictedCollaborator, 'restricted', 'accepted'],
        [readOnlyCollaborator, 'read_only', 'accepted'],
        [pendingRequester, 'full', 'pending'],
    ].map(([collaborator, permissionLevel, status]) => ({
        space_id: spaceId,
        user_id: collaborator.userId,
        requester_email: collaborator.email,
        permission_level: permissionLevel,
        status,
    }));
    unwrap('collaborators', await adminClient.from('space_collaborators').insert(collaboratorRows));

    const expectedLevels = [
        ['The owner gets "owner"', owner, 'owner'],
        ['An accepted full collaborator gets "full"', fullCollaborator, 'full'],
        ['An accepted restricted collaborator gets "restricted"', restrictedCollaborator, 'restricted'],
        ['An accepted read-only collaborator gets "read_only"', readOnlyCollaborator, 'read_only'],
        ['A pending requester gets null', pendingRequester, null],
        ['A stranger gets null', stranger, null],
    ];
    for (const [label, user, expectedLevel] of expectedLevels) {
        await check(label, async () => {
            const { data, error } = await user.userClient.rpc('get_space_permission_level', {
                target_space_id: spaceId,
            });
            if (error) throw new Error(error.message);
            return { pass: data === expectedLevel, detail: `got ${JSON.stringify(data)}` };
        });
    }

    await check('A space that does not exist gives null', async () => {
        const { data, error } = await owner.userClient.rpc('get_space_permission_level', {
            target_space_id: randomUUID(),
        });
        if (error) throw new Error(error.message);
        return { pass: data === null, detail: `got ${JSON.stringify(data)}` };
    });

    await check('A malformed id fails with Postgres code 22P02 (the code the app treats as "no access")', async () => {
        const { error } = await owner.userClient.rpc('get_space_permission_level', {
            target_space_id: 'not-a-uuid',
        });
        return { pass: error?.code === '22P02', detail: `code=${error?.code}` };
    });

    await check('A signed-out caller cannot call it (anon has no EXECUTE)', async () => {
        const anonClient = createClient(supabaseUrl, publishableKey);
        const { error } = await anonClient.rpc('get_space_permission_level', {
            target_space_id: spaceId,
        });
        return { pass: error?.code === '42501', detail: `code=${error?.code}` };
    });
} finally {
    for (const userId of createdUserIds) await adminClient.auth.admin.deleteUser(userId);
}

console.log('\nPermission level function verification\n---------------------------------------');
let allPassed = true;
for (const { label, pass, detail } of checkResults) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}\n      ${detail}`);
    if (!pass) allPassed = false;
}
console.log('---------------------------------------');
console.log(
    allPassed ? `All ${checkResults.length} checks passed.` : 'Some checks failed - see above.',
);
process.exit(allPassed ? 0 : 1);
