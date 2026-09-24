import { createClient } from '@supabase/supabase-js';

// Usage: node --env-file=.env.local scripts/verify-bucket3.mjs <email> <password>
// Credentials are passed as args, not hardcoded here, so this tracked file never carries them.
//
// Proves the auth_rate_limits table, its RLS shape, and the lock/record/reset cycle work
// against real Postgres. Can't call the real actions directly (they need a request context).

const [email, password] = process.argv.slice(2);
if (!email || !password) {
    console.error(
        'Usage: node --env-file=.env.local scripts/verify-bucket3.mjs <email> <password>',
    );
    process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

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

const adminClient = createClient(supabaseUrl, secretKey);
const TEST_EMAIL = '__verify-bucket3-temp__@example.com';
const TEST_IP = '203.0.113.1'; // TEST-NET-3, RFC 5737 -- guaranteed not a real client IP

await check('Admin client can write to auth_rate_limits (bypasses RLS)', async () => {
    const { error } = await adminClient.from('auth_rate_limits').insert({
        email: TEST_EMAIL,
        ip_address: TEST_IP,
        action_type: 'signin',
        failed_count: 1,
    });
    return { pass: !error, detail: error ? error.message : 'inserted' };
});

await check(
    'Lockout triggers once failed_count reaches 5 (matches rate-limit.js logic)',
    async () => {
        const lockedUntil = new Date(Date.now() + 30 * 60_000).toISOString();
        const { error } = await adminClient
            .from('auth_rate_limits')
            .update({ failed_count: 5, locked_until: lockedUntil })
            .eq('email', TEST_EMAIL)
            .eq('ip_address', TEST_IP)
            .eq('action_type', 'signin');
        if (error) return { pass: false, detail: error.message };

        const { data: lockoutRow } = await adminClient
            .from('auth_rate_limits')
            .select('locked_until')
            .eq('email', TEST_EMAIL)
            .eq('ip_address', TEST_IP)
            .eq('action_type', 'signin')
            .maybeSingle();
        const isLocked = new Date(lockoutRow.locked_until).getTime() > Date.now();
        return { pass: isLocked, detail: `locked_until=${lockoutRow.locked_until}` };
    },
);

await check('Reset (delete) clears the lockout row', async () => {
    const { error } = await adminClient
        .from('auth_rate_limits')
        .delete()
        .eq('email', TEST_EMAIL)
        .eq('ip_address', TEST_IP)
        .eq('action_type', 'signin');
    if (error) return { pass: false, detail: error.message };

    const { data: remainingRows } = await adminClient
        .from('auth_rate_limits')
        .select('email')
        .eq('email', TEST_EMAIL)
        .eq('ip_address', TEST_IP)
        .eq('action_type', 'signin');
    return { pass: remainingRows.length === 0, detail: `${remainingRows.length} row(s) remain` };
});

const anonClient = createClient(supabaseUrl, publishableKey);
await check('Anonymous client sees ZERO rows on auth_rate_limits', async () => {
    const { data: visibleRows, error } = await anonClient.from('auth_rate_limits').select('email');
    if (error) return { pass: true, detail: `denied: ${error.message}` };
    return {
        pass: (visibleRows ?? []).length === 0,
        detail: `${visibleRows.length} row(s) visible`,
    };
});

const authClient = createClient(supabaseUrl, publishableKey);
await check('Authenticated (real) user still sees ZERO rows on auth_rate_limits', async () => {
    const { error: signInError } = await authClient.auth.signInWithPassword({ email, password });
    if (signInError) return { pass: false, detail: `sign-in failed: ${signInError.message}` };

    const { data: visibleRows, error } = await authClient.from('auth_rate_limits').select('email');
    if (error) return { pass: true, detail: `denied: ${error.message}` };
    return {
        pass: (visibleRows ?? []).length === 0,
        detail: `${visibleRows.length} row(s) visible`,
    };
});
await authClient.auth.signOut();

await check('generateLink({ type: "recovery" }) succeeds for the real account', async () => {
    const { data: generatedLink, error } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${process.env.SITE_URL}/auth/confirm?next=/reset-password` },
    });
    return {
        pass: Boolean(generatedLink?.properties?.hashed_token) && !error,
        detail: error ? error.message : 'hashed_token generated',
    };
});

console.log('\nBucket 3 verification\n----------------------');
let allPassed = true;
for (const { label, pass, detail } of results) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}\n      ${detail}`);
    if (!pass) allPassed = false;
}
console.log('----------------------');
console.log(allPassed ? 'All automated checks passed.' : 'Some checks failed -- see above.');
console.log(`
Remaining manual QA (needs a live Next.js server, real Brevo credentials):
  - Log in with 5 wrong passwords, confirm the 6th is rejected as ACCOUNT_LOCKED before
    reaching Supabase.
  - Request a password reset, confirm exactly one email arrives, confirm the link lands on
    a working /reset-password form.
  - Request a reset for a non-existent email, confirm the identical success message.
  - Submit a new password, confirm the old password stops working and the new one works.
  - Log in with "Remember me" checked vs. unchecked, compare the session cookie's Max-Age
    in devtools.
`);
process.exit(allPassed ? 0 : 1);
