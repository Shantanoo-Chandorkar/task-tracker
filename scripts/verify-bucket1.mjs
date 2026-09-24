import { createClient } from '@supabase/supabase-js';

// Usage: node --env-file=.env.local scripts/verify-bucket1.mjs <email> <password>
// Credentials are passed as args, not hardcoded here, so this tracked file never carries them.

const [email, password] = process.argv.slice(2);
if (!email || !password) {
    console.error(
        'Usage: node --env-file=.env.local scripts/verify-bucket1.mjs <email> <password>',
    );
    process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const results = [];

/**
 * Runs one check, records its pass/fail outcome, and never throws past this call.
 *
 * @param {string} label - Human-readable name shown in the report.
 * @param {() => Promise<{ pass: boolean, detail: string }>} runCheck - The check itself.
 */
async function check(label, runCheck) {
    try {
        const { pass, detail } = await runCheck();
        results.push({ label, pass, detail });
    } catch (error) {
        results.push({ label, pass: false, detail: `threw: ${error.message}` });
    }
}

// Anonymous client -- confirms existing anon-scoped data (spaces/lists/tasks/statuses)
// survived the Bucket 1 route/file restructure untouched.
const anonClient = createClient(supabaseUrl, supabaseKey);

await check('Existing spaces/lists still readable (anon)', async () => {
    const [{ data: spaces, error: spacesError }, { data: lists, error: listsError }] =
        await Promise.all([
            anonClient.from('spaces').select('id'),
            anonClient.from('lists').select('id'),
        ]);
    if (spacesError || listsError) {
        return {
            pass: false,
            detail: `query error: ${spacesError?.message || listsError?.message}`,
        };
    }
    return {
        pass: spaces.length > 0 && lists.length > 0,
        detail: `${spaces.length} space(s), ${lists.length} list(s)`,
    };
});

// Authenticated client -- confirms Bucket 1's actual deliverable: sign-in works, and the
// 0005/0006 migrations produced a profiles row for this account.
const authClient = createClient(supabaseUrl, supabaseKey);

await check('Sign-in succeeds', async () => {
    const { data: authData, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) return { pass: false, detail: error.message };
    return { pass: Boolean(authData.user?.id), detail: `user id ${authData.user?.id}` };
});

const {
    data: { user },
} = await authClient.auth.getUser();

await check('profiles row exists for this account (migration 0005/0006)', async () => {
    if (!user) return { pass: false, detail: 'no authenticated user (sign-in check failed above)' };
    const { data: profileRows, error } = await authClient
        .from('profiles')
        .select('id, created_at')
        .eq('id', user.id);
    if (error) return { pass: false, detail: `query error: ${error.message}` };
    if (profileRows.length !== 1) {
        return { pass: false, detail: `expected 1 row, got ${profileRows.length}` };
    }
    return {
        pass: true,
        detail: `id ${profileRows[0].id}, created_at ${profileRows[0].created_at}`,
    };
});

await check(
    "authenticated role can't see other users' data yet (expected pre-Bucket-2 state)",
    async () => {
        if (!user)
            return { pass: false, detail: 'no authenticated user (sign-in check failed above)' };
        const { data: visibleSpaces, error } = await authClient.from('spaces').select('id');
        if (error) return { pass: false, detail: `query error: ${error.message}` };
        return {
            pass: visibleSpaces.length === 0,
            detail: `${visibleSpaces.length} space(s) visible while authenticated (expect 0 until Bucket 2 adds authenticated-role RLS policies)`,
        };
    },
);

await authClient.auth.signOut();

console.log('\nBucket 1 verification\n----------------------');
let allPassed = true;
for (const { label, pass, detail } of results) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}\n      ${detail}`);
    if (!pass) allPassed = false;
}
console.log('----------------------');
console.log(allPassed ? 'All checks passed.' : 'Some checks failed -- see above.');
process.exit(allPassed ? 0 : 1);
