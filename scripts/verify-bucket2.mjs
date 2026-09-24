import { createClient } from '@supabase/supabase-js';

// Usage: node --env-file=.env.local scripts/verify-bucket2.mjs <email> <password>
// Credentials are passed as args, not hardcoded here, so this tracked file never carries them.

const [email, password] = process.argv.slice(2);
if (!email || !password) {
    console.error(
        'Usage: node --env-file=.env.local scripts/verify-bucket2.mjs <email> <password>',
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

const authClient = createClient(supabaseUrl, supabaseKey);

await check('Sign-in succeeds', async () => {
    const { data: authData, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) return { pass: false, detail: error.message };
    return { pass: Boolean(authData.user?.id), detail: `user id ${authData.user?.id}` };
});

let ownSpaces = [];
await check('Authenticated user sees own spaces again (not zero, per Bucket 1)', async () => {
    const { data: spaceRows, error } = await authClient
        .from('spaces')
        .select('id, name')
        .order('position');
    if (error) return { pass: false, detail: `query error: ${error.message}` };
    ownSpaces = spaceRows;
    return {
        pass: spaceRows.length > 0,
        detail: `${spaceRows.length} space(s): ${spaceRows.map((s) => s.name).join(', ')}`,
    };
});

await check('Every existing space has exactly 3 statuses (migration 0008 remap)', async () => {
    if (ownSpaces.length === 0)
        return { pass: false, detail: 'no spaces to check (prior check failed)' };
    const counts = await Promise.all(
        ownSpaces.map(async (space) => {
            const { count } = await authClient
                .from('statuses')
                .select('*', { count: 'exact', head: true })
                .eq('space_id', space.id);
            return { space: space.name, count };
        }),
    );
    const bad = counts.filter((c) => c.count !== 3);
    return {
        pass: bad.length === 0,
        detail: counts.map((c) => `${c.space}: ${c.count}`).join(', '),
    };
});

let testSpaceId = null;
await check('Creating a new space auto-seeds exactly 3 statuses (trigger)', async () => {
    const {
        data: { user },
    } = await authClient.auth.getUser();
    const { data: space, error } = await authClient
        .from('spaces')
        .insert({ name: '__verify-bucket2-temp__', owner_id: user.id, position: 9999 })
        .select()
        .single();
    if (error) return { pass: false, detail: `insert error: ${error.message}` };
    testSpaceId = space.id;

    const { data: seeded, error: statusError } = await authClient
        .from('statuses')
        .select('name, code, is_default')
        .eq('space_id', space.id)
        .order('position');
    if (statusError) return { pass: false, detail: `status query error: ${statusError.message}` };

    const codes = seeded.map((s) => s.code).sort();
    const pass =
        seeded.length === 3 &&
        JSON.stringify(codes) === JSON.stringify(['done', 'in_progress', 'todo']);
    return { pass, detail: seeded.map((s) => `${s.name}(${s.code})`).join(', ') };
});

if (testSpaceId) {
    await authClient.from('spaces').delete().eq('id', testSpaceId);
}

// Fresh anonymous client -- the actual security proof this bucket exists to deliver.
const anonClient = createClient(supabaseUrl, supabaseKey);

for (const table of ['spaces', 'lists', 'sublists', 'tasks', 'statuses']) {
    await check(`Anonymous client sees ZERO rows on ${table}`, async () => {
        const { data: visibleRows, error } = await anonClient.from(table).select('id');
        // RLS denial can surface as an empty result OR a permission error, depending on the
        // exact policy shape -- both are the same correct outcome from the client's view.
        if (error) return { pass: true, detail: `denied: ${error.message}` };
        return {
            pass: (visibleRows ?? []).length === 0,
            detail: `${visibleRows.length} row(s) visible`,
        };
    });
}

await authClient.auth.signOut();

console.log('\nBucket 2 verification\n----------------------');
let allPassed = true;
for (const { label, pass, detail } of results) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}\n      ${detail}`);
    if (!pass) allPassed = false;
}
console.log('----------------------');
console.log(allPassed ? 'All checks passed.' : 'Some checks failed -- see above.');
process.exit(allPassed ? 0 : 1);
